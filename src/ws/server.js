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
  const waitingQueue = new Map(); // Map<WebSocket, { socket, tags, mode, joinedAt, lastPeerId, lastSkippedAt }>
  const spyQueue = new Map();     // Map<WebSocket, { socket, question, joinedAt }>
  const rooms = new Map();        // Map<WebSocket, RoomObject>

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

    if (room.type === 'spy' && socket === room.spySocket) {
      room.sockets = room.sockets.filter(s => s !== socket);
      for (const s of room.sockets) {
        if (isSocketValid(s)) {
          sendJson(s, { type: "spy_left", message: "The spy has disconnected. You can continue chatting." });
        }
      }
    } else {
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
   * Pairs two users together in a normal video/text chat room.
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
      createdAt: Date.now()
    };

    socket1.currentRoomId = roomId;
    socket2.currentRoomId = roomId;
    socket1.lastPeerId = socket2.id;
    socket2.lastPeerId = socket1.id;

    rooms.set(socket1, room);
    rooms.set(socket2, room);

    console.log(`[${new Date().toISOString()}] Paired Room (${roomId}): ${socket1.id} & ${socket2.id}`);

    sendJson(socket1, { type: "matched", roomId, initiator: true, commonInterests });
    sendJson(socket2, { type: "matched", roomId, initiator: false, commonInterests });
  }

  /**
   * Pairs three users together for a spy mode room.
   * @param {Object} spyItem - The spy user object
   * @param {Object} stranger1 - The first stranger object
   * @param {Object} stranger2 - The second stranger object
   * @param {Array} commonInterests - Common interests between strangers
   */
  function pairUpSpy(spyItem, stranger1, stranger2, commonInterests = []) {
    const sSockets = [spyItem?.socket, stranger1?.socket, stranger2?.socket];
    const invalid = sSockets.some(s => !isSocketValid(s));
    if (invalid) {
      if (isSocketValid(spyItem?.socket)) {
        spyQueue.set(spyItem.socket, spyItem);
        sendJson(spyItem.socket, { type: "waiting" });
      } else if (spyItem?.socket) {
        spyQueue.delete(spyItem.socket);
      }

      if (isSocketValid(stranger1?.socket) && !rooms.has(stranger1.socket)) {
        waitingQueue.set(stranger1.socket, {
          socket: stranger1.socket,
          tags: stranger1.socket.tags || [],
          mode: 'text',
          joinedAt: Date.now(),
          sessionId: stranger1.socket.sessionId
        });
        sendJson(stranger1.socket, { type: "waiting" });
      } else if (stranger1?.socket) {
        waitingQueue.delete(stranger1.socket);
      }

      if (isSocketValid(stranger2?.socket) && !rooms.has(stranger2.socket)) {
        waitingQueue.set(stranger2.socket, {
          socket: stranger2.socket,
          tags: stranger2.socket.tags || [],
          mode: 'text',
          joinedAt: Date.now(),
          sessionId: stranger2.socket.sessionId
        });
        sendJson(stranger2.socket, { type: "waiting" });
      } else if (stranger2?.socket) {
        waitingQueue.delete(stranger2.socket);
      }
      return;
    }

    spyQueue.delete(spyItem.socket);
    waitingQueue.delete(stranger1.socket);
    waitingQueue.delete(stranger2.socket);

    const roomId = crypto.randomUUID();
    const room = { 
      id: roomId,
      sockets: [spyItem.socket, stranger1.socket, stranger2.socket], 
      type: 'spy', 
      spySocket: spyItem.socket, 
      stranger1Socket: stranger1.socket,
      stranger2Socket: stranger2.socket,
      question: spyItem.question,
      createdAt: Date.now()
    };

    spyItem.socket.currentRoomId = roomId;
    stranger1.socket.currentRoomId = roomId;
    stranger2.socket.currentRoomId = roomId;

    rooms.set(spyItem.socket, room);
    rooms.set(stranger1.socket, room);
    rooms.set(stranger2.socket, room);

    console.log(`[${new Date().toISOString()}] Paired Spy Room (${roomId}): Spy ${spyItem.socket.id} & Strangers ${stranger1.socket.id}, ${stranger2.socket.id}`);

    sendJson(spyItem.socket, { type: "matched", roomId, initiator: false, isSpy: true, question: spyItem.question, commonInterests });
    sendJson(stranger1.socket, { type: "matched", roomId, initiator: true, isSpyStranger: true, question: spyItem.question, peerId: 1, commonInterests });
    sendJson(stranger2.socket, { type: "matched", roomId, initiator: false, isSpyStranger: true, question: spyItem.question, peerId: 2, commonInterests });
  }

  /**
   * Attempts to assign a spy if text mode, otherwise pairs normally.
   */
  function tryPairWithSpy(socket1, socket2, mode, commonInterests) {
    if (mode === 'text' && spyQueue.size > 0) {
      for (const [spySocket, spyItem] of spyQueue) {
        if (isSocketValid(spySocket) && !rooms.has(spySocket)) {
          spyQueue.delete(spySocket);
          pairUpSpy(spyItem, { socket: socket1 }, { socket: socket2 }, commonInterests);
          return;
        } else {
          spyQueue.delete(spySocket);
        }
      }
    }
    pairUp(socket1, socket2, commonInterests);
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
    spyQueue.delete(socket);
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

    let isAuthenticated = !wsArcjet;
    const messageQueue = [];

    const processMessage = (data) => {
      let rawMessage;
      try {
        rawMessage = JSON.parse(data.toString());
      } catch {
        return; // Ignore malformed JSON
      }

      // Basic Zod schema for incoming messages to prevent payload bloat/injection
      const messageSchema = z.object({
        type: z.enum(['join', 'leave', 'report', 'mediaState', 'chat', 'typing', 'offer', 'answer', 'ice-candidate', 'sys_ping', 'peer_ready']),
        tags: z.array(z.string().max(50)).max(10).optional(),
        mode: z.enum(['video', 'text', 'spy']).optional(),
        sessionId: z.string().max(100).optional(),
        question: z.string().max(500).optional(),
        reason: z.string().max(1000).optional(),
        videoEnabled: z.boolean().optional(),
        audioEnabled: z.boolean().optional(),
        text: z.string().max(2000).optional(),
        isTyping: z.boolean().optional(),
        offer: z.any().optional(),
        answer: z.any().optional(),
        candidate: z.any().optional(),
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
        spyQueue.delete(socket);

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
          for (const [sSocket, sInfo] of spyQueue) {
            if (sSocket !== socket && sSocket.sessionId === socket.sessionId) {
              spyQueue.delete(sSocket);
              leaveRoom(sSocket);
            }
          }
        }

        if (mode === 'spy') {
          spyQueue.set(socket, { socket, question: message.question, joinedAt: Date.now(), sessionId: socket.sessionId });
          sendJson(socket, { type: "waiting" });
          return;
        }

        const now = Date.now();
        let matchSocket = null;
        let commonInterests = [];

        // Matchmaking Candidates - only include active, valid sockets
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

        // Helper to check if candidate is eligible (prioritize not immediately re-matching recent peer)
        const isEligible = (wInfo, requireDifferentPeer = true) => {
          if (!requireDifferentPeer) return true;
          if (socket.lastPeerId && wInfo.socket.id === socket.lastPeerId) {
            // Only allow re-match with same peer if no one else is available and after 1.5s debounce
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

        // Tier 2: Instant match with any eligible waiter of same mode
        if (!matchSocket) {
          for (const w of availableWaiters) {
            if (isEligible(w, true)) {
              matchSocket = w.socket;
              if (tags.length > 0 && w.tags && w.tags.length > 0) {
                const lowerTags = tags.map(t => t.toLowerCase());
                commonInterests = w.tags.filter(t => lowerTags.includes(t.toLowerCase()));
              }
              break;
            }
          }
        }

        // Tier 3: If no other match found, allow same peer after cooldown
        if (!matchSocket) {
          for (const w of availableWaiters) {
            if (isEligible(w, false)) {
              matchSocket = w.socket;
              if (tags.length > 0 && w.tags && w.tags.length > 0) {
                const lowerTags = tags.map(t => t.toLowerCase());
                commonInterests = w.tags.filter(t => lowerTags.includes(t.toLowerCase()));
              }
              break;
            }
          }
        }

        if (matchSocket) {
          waitingQueue.delete(matchSocket);
          tryPairWithSpy(socket, matchSocket, mode, commonInterests);
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
        spyQueue.delete(socket);
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

      /**
       * Relays WebRTC signaling, handshake, and chat messages between peers.
       */
      if (["offer", "answer", "ice-candidate", "chat", "typing", "mediaState", "peer_ready"].includes(message.type)) {
        const room = rooms.get(socket);
        if (room) {
          // If message is tied to a specific roomId and room has changed, ignore stale message
          if (message.roomId && message.roomId !== room.id) {
            return;
          }

          // Prevent the spy from sending WebRTC signaling to strangers
          if (room.type === 'spy' && socket === room.spySocket && ["offer", "answer", "ice-candidate", "mediaState"].includes(message.type)) {
            return;
          }

          for (const s of room.sockets) {
            if (s !== socket && isSocketValid(s)) {
              if (room.type === 'spy' && ["offer", "answer", "ice-candidate", "mediaState"].includes(message.type) && s === room.spySocket) {
                // Do not send WebRTC signaling to the spy
                continue;
              }
              let msgToSend = message;
              if (room.type === 'spy' && (message.type === 'chat' || message.type === 'typing')) {
                let senderId;
                if (socket === room.spySocket) {
                  senderId = 'Spy';
                } else if (socket === room.stranger1Socket) {
                  senderId = 'Stranger 1';
                } else {
                  senderId = 'Stranger 2';
                }
                msgToSend = { ...message, senderId };
              }
              sendJson(s, msgToSend);
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

    if (wsArcjet) {
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
        // Fallback gracefully to allow authenticated connection if Arcjet times out
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

      // Check if waiter is still in queue
      if (waitingQueue.has(waiterSocket)) {
        for (let j = i + 1; j < waitEntries.length; j++) {
          const [potentialSocket, potentialMatch] = waitEntries[j];
          if (potentialSocket !== waiterSocket &&
              isSocketValid(potentialSocket) &&
              !rooms.has(potentialSocket) &&
              potentialMatch.mode === waiter.mode &&
              waitingQueue.has(potentialSocket)) {
            
            // Prevent self-matching
            if (waiter.sessionId && potentialMatch.sessionId && waiter.sessionId === potentialMatch.sessionId) {
              continue;
            }

            // Allow match if not immediate peer, or after 1.5s debounce
            if (!waiterSocket.lastPeerId || potentialSocket.id !== waiterSocket.lastPeerId || (now - waiterSocket.lastSkippedAt > 1500)) {
              waitingQueue.delete(waiterSocket);
              waitingQueue.delete(potentialSocket);
              
              const lowerTags = (waiter.tags || []).map(t => t.toLowerCase());
              const commonInterests = (potentialMatch.tags || []).filter(t => lowerTags.includes(t.toLowerCase()));
              
              tryPairWithSpy(waiterSocket, potentialSocket, waiter.mode, commonInterests);
              break;
            }
          }
        }
      }
    }

    // Spy Queue Fallback (30 seconds): Notify spies if no text users are found
    for (const [spySocket, spy] of spyQueue.entries()) {
      if (!isSocketValid(spySocket) || rooms.has(spySocket)) {
        spyQueue.delete(spySocket);
        continue;
      }
      
      if (now - spy.joinedAt > 30000) {
        spyQueue.delete(spySocket);
        sendJson(spySocket, { type: "spy_timeout", message: "No active text chats available to spy on at the moment." });
      }
    }
  }, 1000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
    clearInterval(fallbackInterval);
  });

  return wss;
}

