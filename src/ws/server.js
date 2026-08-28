import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../db/index.js";
import { reports } from "../db/schema.js";

/**
 * Attaches the WebSocket server to the HTTP server and handles signaling.
 * @param {import('http').Server} server - The HTTP server instance
 * @returns {WebSocketServer} The WebSocket server instance
 */
export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
    verifyClient: (info, cb) => {
      const origin = info.origin || info.req.headers.origin;
      const allowedOriginStr = process.env.CLIENT_ORIGIN || '*';
      const allowedOrigins = allowedOriginStr === '*' ? ['*'] : allowedOriginStr.split(',').map(o => o.trim().replace(/\/$/, ''));
      
      if (!allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
        console.log(`[${new Date().toISOString()}] WebSocket connection rejected. Invalid origin: ${origin} (Expected: ${allowedOrigins.join(', ')})`);
        return cb(false, 401, "Unauthorized");
      }
      cb(true);
    },
  });

  /**
   * The waiting room queues and active rooms.
   * Maps provide guaranteed O(1) single-entry uniqueness per socket.
   */
  const waitingQueue = new Map(); // Map<WebSocket, { socket, tags, mode, joinedAt, lastPeerId, lastSkippedAt, sessionId }>
  const rooms = new Map();        // Map<WebSocket, RoomObject>
  const groupRooms = new Map();   // Map<roomId, RoomObject>

  /**
   * Checks if a WebSocket is genuinely open and writable.
   * @param {WebSocket} socket - The socket to check
   * @returns {boolean}
   */
  function isSocketValid(socket) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (socket._socket && (socket._socket.destroyed || !socket._socket.writable)) return false;
    return true;
  }

  /**
   * Sends a JSON payload to a WebSocket client safely.
   * @param {WebSocket} socket - The target socket
   * @param {Object} payload - The data to stringify and send
   */
  function sendJson(socket, payload) {
    if (isSocketValid(socket)) {
      try {
        socket.send(JSON.stringify(payload));
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error sending to socket ${socket.id}:`, err.message);
      }
    }
  }

  /**
   * Leaves and cleans up any active room the socket is currently part of.
   * @param {WebSocket} socket - The socket leaving
   */
  function leaveRoom(socket) {
    const room = rooms.get(socket);
    if (!room) return;

    rooms.delete(socket);
    socket.currentRoomId = null;

    if (room.type === 'group') {
      room.sockets = room.sockets.filter(s => s !== socket && isSocketValid(s));
      
      if (room.sockets.length === 0) {
        groupRooms.delete(room.id);
        return;
      }

      // If the departing user was the host, assign host role to the next oldest user
      let hostChanged = false;
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = room.sockets[0].id;
        hostChanged = true;
      }

      for (const s of room.sockets) {
        if (isSocketValid(s)) {
          if (hostChanged) {
            sendJson(s, {
              type: "host_changed",
              hostId: room.hostSocketId,
              isHost: s.id === room.hostSocketId
            });
          }
          sendJson(s, {
            type: "user_left",
            socketId: socket.id,
            hostId: room.hostSocketId
          });
        }
      }
    } else {
      // 1-on-1 Normal room
      for (const s of room.sockets) {
        rooms.delete(s);
        s.currentRoomId = null;
        if (s !== socket && isSocketValid(s)) {
          sendJson(s, { type: "peer_left" });
        }
      }
    }
  }

  /**
   * Pairs two users together in a normal 1-on-1 video/text chat room.
   * @param {WebSocket} socket1 - The first user's socket
   * @param {WebSocket} socket2 - The second user's socket
   * @param {Array} commonInterests - Tags they both share
   */
  function pairUp(socket1, socket2, commonInterests = []) {
    if (!isSocketValid(socket1)) {
      waitingQueue.delete(socket1);
      if (isSocketValid(socket2) && !rooms.has(socket2)) {
        waitingQueue.set(socket2, {
          socket: socket2,
          tags: socket2.tags || [],
          mode: socket2.mode || 'video',
          joinedAt: Date.now(),
          lastPeerId: socket2.lastPeerId,
          lastSkippedAt: socket2.lastSkippedAt,
          sessionId: socket2.sessionId
        });
        sendJson(socket2, { type: "waiting" });
      }
      return;
    }
    if (!isSocketValid(socket2)) {
      waitingQueue.delete(socket2);
      if (isSocketValid(socket1) && !rooms.has(socket1)) {
        waitingQueue.set(socket1, {
          socket: socket1,
          tags: socket1.tags || [],
          mode: socket1.mode || 'video',
          joinedAt: Date.now(),
          lastPeerId: socket1.lastPeerId,
          lastSkippedAt: socket1.lastSkippedAt,
          sessionId: socket1.sessionId
        });
        sendJson(socket1, { type: "waiting" });
      }
      return;
    }

    waitingQueue.delete(socket1);
    waitingQueue.delete(socket2);

    const roomId = crypto.randomUUID();
    const room = {
      id: roomId,
      sockets: [socket1, socket2],
      type: 'normal',
      mode: socket1.mode || 'video',
      hostSocketId: socket1.id,
      createdAt: Date.now()
    };

    socket1.currentRoomId = roomId;
    socket2.currentRoomId = roomId;
    socket1.lastPeerId = socket2.id;
    socket2.lastPeerId = socket1.id;

    rooms.set(socket1, room);
    rooms.set(socket2, room);

    console.log(`[${new Date().toISOString()}] Paired 1-on-1 Room (${roomId}): ${socket1.id} & ${socket2.id}`);

    sendJson(socket1, {
      type: "matched",
      roomId,
      initiator: true,
      mode: room.mode,
      hostId: socket1.id,
      isHost: true,
      commonInterests,
      peers: [{ socketId: socket2.id, tags: socket2.tags || [] }]
    });

    sendJson(socket2, {
      type: "matched",
      roomId,
      initiator: false,
      mode: room.mode,
      hostId: socket1.id,
      isHost: false,
      commonInterests,
      peers: [{ socketId: socket1.id, tags: socket1.tags || [] }]
    });
  }

  /**
   * Adds a user to an existing or newly created group room (up to 5 users).
   * @param {WebSocket} socket - The user joining group chat
   * @param {Array} tags - User's interest tags
   */
  function joinGroupRoom(socket, tags = [], isRetry = false) {
    const now = Date.now();
    waitingQueue.delete(socket);
    let targetRoom = null;

    // 1. Look for an existing group room with space (< 5 participants)
    if (tags.length > 0) {
      const lowerTags = tags.map(t => t.toLowerCase());
      for (const [roomId, room] of groupRooms.entries()) {
        room.sockets = room.sockets.filter(s => isSocketValid(s));
        if (room.sockets.length === 0) {
          groupRooms.delete(roomId);
          continue;
        }

        if (room.sockets.length < 5) {
          const hasSameSession = socket.sessionId && room.sockets.some(s => s.sessionId === socket.sessionId);
          if (!hasSameSession) {
            const common = (room.commonInterests || []).filter(t => lowerTags.includes(t.toLowerCase()));
            if (common.length > 0) {
              targetRoom = room;
              break;
            }
          }
        }
      }
    } else {
      // General group room matching (no tags specified)
      for (const [roomId, room] of groupRooms.entries()) {
        room.sockets = room.sockets.filter(s => isSocketValid(s));
        if (room.sockets.length === 0) {
          groupRooms.delete(roomId);
          continue;
        }

        if (room.sockets.length < 5) {
          const hasSameSession = socket.sessionId && room.sockets.some(s => s.sessionId === socket.sessionId);
          if (!hasSameSession && (!room.commonInterests || room.commonInterests.length === 0)) {
            targetRoom = room;
            break;
          }
        }
      }
    }

    if (targetRoom) {
      // Join existing group room
      targetRoom.sockets.push(socket);
      socket.currentRoomId = targetRoom.id;
      rooms.set(socket, targetRoom);

      console.log(`[${new Date().toISOString()}] User ${socket.id} joined Group Room ${targetRoom.id} (${targetRoom.sockets.length}/5)`);

      // Notify joining user with current room state and existing peers
      sendJson(socket, {
        type: "matched",
        roomId: targetRoom.id,
        mode: "group",
        initiator: false,
        hostId: targetRoom.hostSocketId,
        isHost: (socket.id === targetRoom.hostSocketId),
        commonInterests: targetRoom.commonInterests || [],
        peers: targetRoom.sockets
          .filter(s => s !== socket)
          .map(s => ({ socketId: s.id, tags: s.tags || [] }))
      });

      // Notify existing members about the newcomer
      for (const s of targetRoom.sockets) {
        if (s !== socket && isSocketValid(s)) {
          sendJson(s, {
            type: "user_joined",
            peer: { socketId: socket.id, tags: socket.tags || [] },
            hostId: targetRoom.hostSocketId,
            roomId: targetRoom.id
          });
        }
      }
      return;
    }

    // 2. Check if another group waiter is available to form a new group room
    let matchWaiter = null;
    for (const [wSocket, wInfo] of waitingQueue.entries()) {
      if (wSocket !== socket && isSocketValid(wSocket) && !rooms.has(wSocket) && wInfo.mode === 'group') {
        if (socket.sessionId && wInfo.sessionId && socket.sessionId === wInfo.sessionId) {
          continue;
        }
        matchWaiter = wInfo;
        break;
      }
    }

    if (matchWaiter) {
      waitingQueue.delete(matchWaiter.socket);
      waitingQueue.delete(socket);

      const roomId = crypto.randomUUID();
      const lowerTags = tags.map(t => t.toLowerCase());
      const common = (matchWaiter.tags || []).filter(t => lowerTags.includes(t.toLowerCase()));

      const newRoom = {
        id: roomId,
        sockets: [matchWaiter.socket, socket],
        type: 'group',
        mode: 'group',
        hostSocketId: matchWaiter.socket.id,
        commonInterests: common,
        createdAt: now
      };

      socket.currentRoomId = roomId;
      matchWaiter.socket.currentRoomId = roomId;

      rooms.set(socket, newRoom);
      rooms.set(matchWaiter.socket, newRoom);
      groupRooms.set(roomId, newRoom);

      console.log(`[${new Date().toISOString()}] Formed New Group Room (${roomId}): Host ${matchWaiter.socket.id} & ${socket.id}`);

      // Host (first waiter who created/waited for the room)
      sendJson(matchWaiter.socket, {
        type: "matched",
        roomId,
        mode: "group",
        initiator: true,
        hostId: matchWaiter.socket.id,
        isHost: true,
        commonInterests: common,
        peers: [{ socketId: socket.id, tags: tags || [] }]
      });

      // Member (newcomer)
      sendJson(socket, {
        type: "matched",
        roomId,
        mode: "group",
        initiator: false,
        hostId: matchWaiter.socket.id,
        isHost: false,
        commonInterests: common,
        peers: [{ socketId: matchWaiter.socket.id, tags: matchWaiter.tags || [] }]
      });
      return;
    }

    // 3. No group matches available right now, place in waiting queue
    waitingQueue.set(socket, {
      socket,
      tags,
      mode: 'group',
      joinedAt: now,
      lastPeerId: socket.lastPeerId,
      lastSkippedAt: socket.lastSkippedAt,
      sessionId: socket.sessionId
    });
    if (!isRetry) {
      sendJson(socket, { type: "waiting" });
    }
  }

  /**
   * Broadcasts the current number of connected users to all clients (Throttled).
   */
  let broadcastTimeout = null;
  function broadcastUserCount() {
    if (!broadcastTimeout) {
      broadcastTimeout = setTimeout(() => {
        const payload = JSON.stringify({ type: 'userCount', count: wss.clients.size });
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
        broadcastTimeout = null;
      }, 1000);
    }
  }

  /**
   * Cleans up when a user disconnects or closes the connection.
   * @param {WebSocket} socket - The socket that disconnected
   */
  function handleDisconnect(socket) {
    console.log(`[${new Date().toISOString()}] WebSocket disconnected: ${socket.id}`);
    waitingQueue.delete(socket);
    leaveRoom(socket);
  }

  wss.on("connection", async (socket, req) => {
    socket.id = crypto.randomUUID();
    socket.isAlive = true;
    socket.currentRoomId = null;
    socket.lastPeerId = null;
    socket.lastSkippedAt = 0;
    socket.clientIp = req.headers["x-forwarded-for"]?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    socket.sessionId = null;

    console.log(`[${new Date().toISOString()}] WebSocket connected: ${socket.id}`);

    // Immediately send the user count to the newly connected socket
    sendJson(socket, { type: 'userCount', count: wss.clients.size });

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("error", (error) => {
      console.log(`[${new Date().toISOString()}] WebSocket error on ${socket.id}: ${error.message}`);
      handleDisconnect(socket);
      socket.terminate();
    });
    
    socket.on("close", () => {
      handleDisconnect(socket);
      setTimeout(broadcastUserCount, 50);
    });

    let isAuthenticated = !wsArcjet || process.env.NODE_ENV === "test";
    const messageQueue = [];

    const processMessage = (data) => {
      let rawMessage;
      try {
        rawMessage = JSON.parse(data.toString());
      } catch {
        return; // Ignore malformed JSON
      }

      // Zod schema for all valid incoming messages
      const messageSchema = z.object({
        type: z.enum([
          'join', 'leave', 'report', 'mediaState', 'chat', 'typing',
          'offer', 'answer', 'ice-candidate', 'sys_ping', 'peer_ready',
          'kick_user', 'host_mute_user'
        ]),
        tags: z.array(z.string().max(50)).max(10).optional(),
        mode: z.enum(['video', 'text', 'group']).optional(),
        sessionId: z.string().max(100).optional(),
        reason: z.string().max(1000).optional(),
        videoEnabled: z.boolean().optional(),
        audioEnabled: z.boolean().optional(),
        isScreenSharing: z.boolean().optional(),
        text: z.string().max(2000).optional(),
        isTyping: z.boolean().optional(),
        offer: z.any().optional(),
        answer: z.any().optional(),
        candidate: z.any().optional(),
        targetId: z.string().optional(),
        roomId: z.string().optional()
      });

      const parseResult = messageSchema.safeParse(rawMessage);
      if (!parseResult.success) {
        console.warn(`[${new Date().toISOString()}] Invalid message payload from ${socket.id}`, parseResult.error.issues);
        return;
      }
      const message = parseResult.data;

      // Application-level keepalive
      if (message.type === "sys_ping") {
        socket.isAlive = true;
        sendJson(socket, { type: "sys_pong" });
        return;
      }

      if (message.type === "join") {
        // Leave any room cleanly before queuing or matching
        leaveRoom(socket);
        waitingQueue.delete(socket);

        const tags = message.tags || [];
        const mode = message.mode || 'video';
        socket.tags = tags;
        socket.mode = mode;
        socket.sessionId = message.sessionId || null;

        // Evict any stale socket with the same sessionId (e.g. page refreshed)
        if (socket.sessionId) {
          for (const [wSocket, wInfo] of waitingQueue) {
            if (wSocket !== socket && wInfo.sessionId === socket.sessionId) {
              waitingQueue.delete(wSocket);
              leaveRoom(wSocket);
            }
          }
        }

        if (mode === 'group') {
          joinGroupRoom(socket, tags);
          return;
        }

        const now = Date.now();
        let matchSocket = null;
        let commonInterests = [];

        // Matchmaking Candidates for 1-on-1 (video or text)
        const availableWaiters = [];
        for (const [wSocket, wInfo] of waitingQueue) {
          if (wSocket === socket || !isSocketValid(wSocket) || rooms.has(wSocket)) {
            if (!isSocketValid(wSocket) || rooms.has(wSocket)) {
              waitingQueue.delete(wSocket);
            }
            continue;
          }
          // Prevent self-matching (same sessionId)
          if (socket.sessionId && wInfo.sessionId && socket.sessionId === wInfo.sessionId) {
            waitingQueue.delete(wSocket);
            continue;
          }
          if (wInfo.mode === mode) {
            availableWaiters.push(wInfo);
          }
        }

        const isEligible = (wInfo, requireDifferentPeer = true) => {
          if (!requireDifferentPeer) return true;
          if (socket.lastPeerId && wInfo.socket.id === socket.lastPeerId) {
            return (now - socket.lastSkippedAt > 1500) && (availableWaiters.length === 1);
          }
          return true;
        };

        // Tier 1: Matching tags with different peer
        if (tags.length > 0) {
          const lowerTags = tags.map(t => t.toLowerCase());
          for (const w of availableWaiters) {
            if (isEligible(w, true)) {
              const common = (w.tags || []).filter(t => lowerTags.includes(t.toLowerCase()));
              if (common.length > 0) {
                matchSocket = w.socket;
                commonInterests = common;
                break;
              }
            }
          }
        }

        // Tier 2: Instant match with any eligible waiter of same mode (only if no tags specified)
        if (!matchSocket && tags.length === 0) {
          for (const w of availableWaiters) {
            if (isEligible(w, true) && (!w.tags || w.tags.length === 0)) {
              matchSocket = w.socket;
              break;
            }
          }
        }

        // Tier 3: If no other match found and no tags, allow same peer after cooldown
        if (!matchSocket && tags.length === 0) {
          for (const w of availableWaiters) {
            if (isEligible(w, false) && (!w.tags || w.tags.length === 0)) {
              matchSocket = w.socket;
              break;
            }
          }
        }

        if (matchSocket) {
          waitingQueue.delete(matchSocket);
          pairUp(socket, matchSocket, commonInterests);
        } else {
          waitingQueue.set(socket, {
            socket,
            tags,
            mode,
            joinedAt: Date.now(),
            lastPeerId: socket.lastPeerId,
            lastSkippedAt: socket.lastSkippedAt,
            sessionId: socket.sessionId
          });
          sendJson(socket, { type: "waiting" });
        }
        return;
      }

      if (message.type === "leave") {
        socket.lastSkippedAt = Date.now();
        leaveRoom(socket);
        waitingQueue.delete(socket);
        return;
      }

      if (message.type === "report") {
        const room = rooms.get(socket);
        console.log(`\n[REPORT] [${new Date().toISOString()}]`);
        console.log(`Reporter ID: ${socket.id}`);
        console.log(`Room Type: ${room ? room.type : 'N/A'}`);
        console.log(`Reason: ${message.reason}`);
        console.log("-----------------------------------------");
        
        if (message.reason) {
          db.insert(reports).values({
            reporterId: socket.id,
            roomType: room ? room.type : 'unknown',
            reason: message.reason
          }).catch(err => console.error(`[${new Date().toISOString()}] Error saving report to DB via WS:`, err));
        }
        return;
      }

      // Host Control: Kick User
      if (message.type === "kick_user") {
        const room = rooms.get(socket);
        if (room && room.hostSocketId === socket.id && message.targetId) {
          const targetSocket = room.sockets.find(s => s.id === message.targetId);
          if (targetSocket) {
            console.log(`[${new Date().toISOString()}] Host ${socket.id} kicked user ${targetSocket.id} from Room ${room.id}`);
            sendJson(targetSocket, {
              type: "kicked",
              message: "You have been removed from the room by the host."
            });
            leaveRoom(targetSocket);
          }
        }
        return;
      }

      // Host Control: Mute User
      if (message.type === "host_mute_user") {
        const room = rooms.get(socket);
        if (room && room.hostSocketId === socket.id && message.targetId) {
          const targetSocket = room.sockets.find(s => s.id === message.targetId);
          if (targetSocket) {
            console.log(`[${new Date().toISOString()}] Host ${socket.id} requested mute on ${targetSocket.id}`);
            sendJson(targetSocket, { type: "host_mute" });
          }
        }
        return;
      }

      /**
       * Relays WebRTC signaling, handshake, and chat messages between peers.
       * Supports targeted routing (P2P mesh) via targetId or room broadcast.
       */
      if (["offer", "answer", "ice-candidate", "chat", "typing", "mediaState", "peer_ready"].includes(message.type)) {
        const room = rooms.get(socket);
        if (room) {
          if (message.roomId && message.roomId !== room.id) {
            return; // Ignore stale room message
          }

          const payload = {
            ...message,
            senderId: socket.id,
            roomId: room.id
          };

          if (message.targetId) {
            // Targeted delivery to a specific peer (e.g. WebRTC offer/answer/candidate)
            const targetSocket = room.sockets.find(s => s.id === message.targetId);
            if (targetSocket && isSocketValid(targetSocket)) {
              sendJson(targetSocket, payload);
            }
          } else {
            // Broadcast to all other peers in the room (e.g. chat, typing, media state)
            for (const s of room.sockets) {
              if (s !== socket && isSocketValid(s)) {
                sendJson(s, payload);
              }
            }
          }
        }
      }
    };

    socket.on("message", (data) => {
      if (!isAuthenticated) {
        if (messageQueue.length > 50) {
          socket.close(1009, "Message queue limit exceeded during authentication");
          return;
        }
        messageQueue.push(data);
        return;
      }
      processMessage(data);
    });

    if (wsArcjet && process.env.NODE_ENV !== "test") {
      try {
        const ipSrc = socket.clientIp;
        
        let timeoutId;
        const decision = await Promise.race([
          wsArcjet.protect(req, { ipSrc }),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Arcjet timeout')), 2000);
          })
        ]);
        clearTimeout(timeoutId);

        if (decision.isDenied()) {
          socket.close(1008, "Access denied");
          return;
        }
        isAuthenticated = true;
        messageQueue.forEach(msg => processMessage(msg));
        messageQueue.length = 0;
      } catch (e) {
        console.warn(`[${new Date().toISOString()}] Arcjet protect check skipped/failed for ${socket.id}: ${e.message}`);
        isAuthenticated = true;
        messageQueue.forEach(msg => processMessage(msg));
        messageQueue.length = 0;
      }
    }

    broadcastUserCount();
  });

  // Standard WebSocket ping/pong heartbeat to clean dead/hung TCP connections cleanly
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log(`[${new Date().toISOString()}] WebSocket terminated due to heartbeat timeout: ${ws.id}`);
        handleDisconnect(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      if (isSocketValid(ws)) {
        ws.ping();
      }
    });
  }, 10000);

  // Background Matchmaking Sweeper to pair waiting users and clean dead sockets
  const fallbackInterval = setInterval(() => {
    const now = Date.now();
    const waitEntries = Array.from(waitingQueue.entries());
    
    for (let i = 0; i < waitEntries.length; i++) {
      const [waiterSocket, waiter] = waitEntries[i];
      if (!isSocketValid(waiterSocket) || rooms.has(waiterSocket)) {
        waitingQueue.delete(waiterSocket);
        continue;
      }

      if (waiter.mode === 'group') {
        // Try to place in active group room with capacity
        waitingQueue.delete(waiterSocket);
        joinGroupRoom(waiterSocket, waiter.tags, true);
        continue;
      }

      // Check if waiter is still in queue for 1-on-1 modes
      if (waitingQueue.has(waiterSocket)) {
        for (let j = i + 1; j < waitEntries.length; j++) {
          const [potentialSocket, potentialMatch] = waitEntries[j];
          if (potentialSocket !== waiterSocket &&
              isSocketValid(potentialSocket) &&
              !rooms.has(potentialSocket) &&
              potentialMatch.mode === waiter.mode &&
              waitingQueue.has(potentialSocket)) {
            
            if (waiter.sessionId && potentialMatch.sessionId && waiter.sessionId === potentialMatch.sessionId) {
              continue;
            }

            if (!waiterSocket.lastPeerId || potentialSocket.id !== waiterSocket.lastPeerId || (now - waiterSocket.lastSkippedAt > 1500)) {
              waitingQueue.delete(waiterSocket);
              waitingQueue.delete(potentialSocket);
              
              const lowerTags = (waiter.tags || []).map(t => t.toLowerCase());
              const commonInterests = (potentialMatch.tags || []).filter(t => lowerTags.includes(t.toLowerCase()));
              
              pairUp(waiterSocket, potentialSocket, commonInterests);
              break;
            }
          }
        }
      }
    }
  }, 1000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
    clearInterval(fallbackInterval);
  });

  return wss;
}
