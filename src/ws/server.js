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
   * We use a Set for queues to easily add/remove unique connections without duplicates,
   * and a Map for rooms to quickly look up a room by a user's socket connection.
   */
  const waitingQueue = new Set();
  const spyQueue = new Set();
  const rooms = new Map();

  /**
   * Pairs two users together in a normal video/text chat room.
   * @param {WebSocket} socket1 - The first user's socket
   * @param {WebSocket} socket2 - The second user's socket
   * @param {Array} commonInterests - Tags they both share
   */
  function pairUp(socket1, socket2, commonInterests) {
    if (!socket1 || socket1.readyState !== WebSocket.OPEN) {
      if (socket2 && socket2.readyState === WebSocket.OPEN) {
        waitingQueue.add({ socket: socket2, tags: socket2.tags || [], mode: socket2.mode || 'video', joinedAt: Date.now() });
        sendJson(socket2, { type: "waiting" });
      }
      return;
    }
    if (!socket2 || socket2.readyState !== WebSocket.OPEN) {
      if (socket1 && socket1.readyState === WebSocket.OPEN) {
        waitingQueue.add({ socket: socket1, tags: socket1.tags || [], mode: socket1.mode || 'video', joinedAt: Date.now() });
        sendJson(socket1, { type: "waiting" });
      }
      return;
    }

    const room = { sockets: [socket1, socket2], type: 'normal' };
    rooms.set(socket1, room);
    rooms.set(socket2, room);

    console.log(`[${new Date().toISOString()}] Paired: ${socket1.id} & ${socket2.id}`);

    sendJson(socket1, { type: "matched", initiator: true, commonInterests });
    sendJson(socket2, { type: "matched", initiator: false, commonInterests });
  }

  /**
   * Pairs three users together for a spy mode room.
   * @param {Object} spyItem - The spy user object
   * @param {Object} stranger1 - The first stranger object
   * @param {Object} stranger2 - The second stranger object
   */
  function pairUpSpy(spyItem, stranger1, stranger2, commonInterests = []) {
    const sSockets = [spyItem?.socket, stranger1?.socket, stranger2?.socket];
    const invalid = sSockets.some(s => !s || s.readyState !== WebSocket.OPEN);
    if (invalid) {
      if (spyItem?.socket?.readyState === WebSocket.OPEN) {
        spyQueue.add(spyItem);
        sendJson(spyItem.socket, { type: "waiting" });
      }
      if (stranger1?.socket?.readyState === WebSocket.OPEN) {
        waitingQueue.add({ socket: stranger1.socket, tags: stranger1.socket.tags || [], mode: 'text', joinedAt: Date.now() });
        sendJson(stranger1.socket, { type: "waiting" });
      }
      if (stranger2?.socket?.readyState === WebSocket.OPEN) {
        waitingQueue.add({ socket: stranger2.socket, tags: stranger2.socket.tags || [], mode: 'text', joinedAt: Date.now() });
        sendJson(stranger2.socket, { type: "waiting" });
      }
      return;
    }

    const room = { 
      sockets: [spyItem.socket, stranger1.socket, stranger2.socket], 
      type: 'spy', 
      spySocket: spyItem.socket, 
      stranger1Socket: stranger1.socket,
      stranger2Socket: stranger2.socket,
      question: spyItem.question 
    };
    rooms.set(spyItem.socket, room);
    rooms.set(stranger1.socket, room);
    rooms.set(stranger2.socket, room);

    console.log(`[${new Date().toISOString()}] Paired (Spy): ${spyItem.socket.id} (Spy) & ${stranger1.socket.id} & ${stranger2.socket.id}`);

    sendJson(spyItem.socket, { type: "matched", initiator: false, isSpy: true, question: spyItem.question, commonInterests });
    sendJson(stranger1.socket, { type: "matched", initiator: true, isSpyStranger: true, question: spyItem.question, peerId: 1, commonInterests });
    sendJson(stranger2.socket, { type: "matched", initiator: false, isSpyStranger: true, question: spyItem.question, peerId: 2, commonInterests });
  }

  /**
   * Attempts to assign a spy if text mode, otherwise pairs normally.
   */
  function tryPairWithSpy(socket1, socket2, mode, commonInterests) {
    if (mode === 'text' && spyQueue.size > 0) {
      for (const spy of spyQueue) {
        if (spy.socket.readyState === WebSocket.OPEN) {
          spyQueue.delete(spy);
          pairUpSpy(spy, { socket: socket1 }, { socket: socket2 }, commonInterests);
          return;
        } else {
          spyQueue.delete(spy);
        }
      }
    }
    pairUp(socket1, socket2, commonInterests);
  }

  /**
   * Sends a JSON payload to a WebSocket client.
   * @param {WebSocket} socket - The target socket
   * @param {Object} payload - The data to stringify and send
   */
  function sendJson(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
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
      }, 3000);
    }
  }

  /**
   * Cleans up when a user disconnects.
   * @param {WebSocket} socket - The socket that disconnected
   */
  function handleDisconnect(socket) {
    console.log(`[${new Date().toISOString()}] WebSocket disconnected: ${socket.id}`);
    for (const w of waitingQueue) {
      if (w.socket === socket) {
        waitingQueue.delete(w);
        break;
      }
    }
    for (const s of spyQueue) {
      if (s.socket === socket) {
        spyQueue.delete(s);
        break;
      }
    }

    const room = rooms.get(socket);
    if (room) {
      if (room.type === 'spy' && socket === room.spySocket) {
        rooms.delete(socket);
        room.sockets = room.sockets.filter(s => s !== socket);
        for (const s of room.sockets) {
          if (s.readyState === WebSocket.OPEN) {
            sendJson(s, { type: "spy_left", message: "The spy has disconnected. You can continue chatting." });
          }
        }
      } else {
        for (const s of room.sockets) {
          rooms.delete(s);
          if (s !== socket && s.readyState === WebSocket.OPEN) {
            sendJson(s, { type: "peer_left" });
          }
        }
      }
    }
  }

  wss.on("connection", async (socket, req) => {
    socket.id = crypto.randomUUID();
    console.log(`[${new Date().toISOString()}] WebSocket connected: ${socket.id}`);

    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("error", (error) => {
      console.log(`[${new Date().toISOString()}] WebSocket error on ${socket.id}: ${error.message}`);
      socket.terminate();
    });
    
    socket.on("close", () => {
      handleDisconnect(socket);
      setTimeout(broadcastUserCount, 50); // Small delay to let wss.clients update
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
        type: z.enum(['join', 'leave', 'report', 'mediaState', 'chat', 'typing', 'offer', 'answer', 'ice-candidate', 'sys_ping']),
        tags: z.array(z.string().max(50)).max(10).optional(),
        mode: z.enum(['video', 'text', 'spy']).optional(),
        question: z.string().max(500).optional(),
        reason: z.string().max(1000).optional(),
        videoEnabled: z.boolean().optional(),
        audioEnabled: z.boolean().optional(),
        text: z.string().max(2000).optional(),
        isTyping: z.boolean().optional(),
        offer: z.any().optional(),
        answer: z.any().optional(),
        candidate: z.any().optional()
      });

      const parseResult = messageSchema.safeParse(rawMessage);
      if (!parseResult.success) {
        console.warn(`[${new Date().toISOString()}] Invalid message payload from ${socket.id}`, parseResult.error.issues);
        return;
      }
      const message = parseResult.data;

      if (message.type === "join") {
        if (rooms.has(socket)) return;
        
        // Purge existing entries for this socket or dead sockets
        for (const w of waitingQueue) {
          if (w.socket === socket || w.socket.readyState !== WebSocket.OPEN) {
            waitingQueue.delete(w);
          }
        }
        for (const s of spyQueue) {
          if (s.socket === socket || s.socket.readyState !== WebSocket.OPEN) {
            spyQueue.delete(s);
          }
        }

        const tags = message.tags || [];
        const mode = message.mode || 'video';
        socket.tags = tags;
        socket.mode = mode;

        if (mode === 'spy') {
          spyQueue.add({ socket, question: message.question, joinedAt: Date.now() });
          sendJson(socket, { type: "waiting" });
          return;
        }

        let match = null;
        let commonInterests = [];

        // Tier 1: Match with common tags in the same mode
        if (tags.length > 0) {
          const lowerTags = tags.map(t => t.toLowerCase());
          for (const w of waitingQueue) {
            if (w.socket.readyState !== WebSocket.OPEN || w.socket === socket) {
              if (w.socket.readyState !== WebSocket.OPEN) waitingQueue.delete(w);
              continue;
            }
            if (w.mode === mode) {
              const common = (w.tags || []).filter(t => lowerTags.includes(t.toLowerCase()));
              if (common.length > 0) {
                match = w;
                commonInterests = common;
                break;
              }
            }
          }
        }

        // Tier 2: Instant Match with ANY available waiter of the same mode
        if (!match) {
          for (const w of waitingQueue) {
            if (w.socket.readyState !== WebSocket.OPEN || w.socket === socket) {
              if (w.socket.readyState !== WebSocket.OPEN) waitingQueue.delete(w);
              continue;
            }
            if (w.mode === mode) {
              match = w;
              if (tags.length > 0 && w.tags && w.tags.length > 0) {
                const lowerTags = tags.map(t => t.toLowerCase());
                commonInterests = w.tags.filter(t => lowerTags.includes(t.toLowerCase()));
              }
              break;
            }
          }
        }

        if (match) {
          waitingQueue.delete(match);
          tryPairWithSpy(socket, match.socket, mode, commonInterests);
        } else {
          waitingQueue.add({ socket, tags, mode, joinedAt: Date.now() });
          sendJson(socket, { type: "waiting" });
        }
        return;
      }

      if (message.type === "leave") {
        handleDisconnect(socket);
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
       * Relays WebRTC signaling and chat messages between peers.
       */
      if (["offer", "answer", "ice-candidate", "chat", "typing", "mediaState"].includes(message.type)) {
        const room = rooms.get(socket);
        if (room) {
          // Prevent the spy from sending WebRTC signaling to strangers
          if (room.type === 'spy' && socket === room.spySocket && ["offer", "answer", "ice-candidate", "mediaState"].includes(message.type)) {
            return;
          }

          for (const s of room.sockets) {
            if (s !== socket && s.readyState === WebSocket.OPEN) {
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
        const ipSrc = req.headers["x-forwarded-for"]?.split(',')[0] || req.socket?.remoteAddress;
        
        // Wrap Arcjet protect in a 2000ms timeout to prevent hanging
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
        messageQueue.length = 0; // Clear the queue to free memory
      } catch (e) {
        socket.close(1011, "Server security error");
        return;
      }
    }

    broadcastUserCount();
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      
      ws.isAlive = false;
      ws.ping();

      setTimeout(() => {
        if (ws.isAlive === false && ws.readyState === WebSocket.OPEN) {
          console.log(`[${new Date().toISOString()}] WebSocket terminated due to heartbeat timeout: ${ws.id}`);
          ws.terminate();
        }
      }, 10000);
    });
  }, 30000);

  const fallbackInterval = setInterval(() => {
    const now = Date.now();
    const waitList = Array.from(waitingQueue);
    
    for (const waiter of waitList) {
      if (waiter.socket.readyState !== WebSocket.OPEN) {
        waitingQueue.delete(waiter);
        continue;
      }
      
      // If someone has been waiting, pair with any other open waiter of same mode
      if (waitingQueue.has(waiter)) {
        for (const potentialMatch of waitingQueue) {
          if (potentialMatch !== waiter && potentialMatch.socket.readyState === WebSocket.OPEN && potentialMatch.mode === waiter.mode) {
            waitingQueue.delete(waiter);
            waitingQueue.delete(potentialMatch);
            
            const lowerTags = (waiter.tags || []).map(t => t.toLowerCase());
            const commonInterests = (potentialMatch.tags || []).filter(t => lowerTags.includes(t.toLowerCase()));
            
            tryPairWithSpy(waiter.socket, potentialMatch.socket, waiter.mode, commonInterests);
            break;
          }
        }
      }
    }

    // Spy Queue Fallback (30 seconds): Notify spies if no text users are found
    for (const spy of Array.from(spyQueue)) {
      if (spy.socket.readyState !== WebSocket.OPEN) {
        spyQueue.delete(spy);
        continue;
      }
      
      if (now - spy.joinedAt > 30000) {
        spyQueue.delete(spy);
        sendJson(spy.socket, { type: "spy_timeout", message: "No active text chats available to spy on at the moment." });
      }
    }
  }, 1000);

  wss.on("close", () => {
    clearInterval(interval);
    clearInterval(fallbackInterval);
  });

  return wss;
}
