import { useEffect, useRef, useState, useCallback } from 'react';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

let cachedTurnCredentials = null;

const getSessionId = () => {
  try {
    let sid = sessionStorage.getItem('randall_sid');
    if (!sid) {
      sid = 's_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      sessionStorage.setItem('randall_sid', sid);
    }
    return sid;
  } catch {
    return 's_' + Math.random().toString(36).substring(2, 11);
  }
};

export const useVideoChat = (interests = [], mode = 'video') => {
  const localVideoRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  
  // Multi-peer connection storage
  const peerConnectionsRef = useRef(new Map()); // Map<socketId, RTCPeerConnection>
  const pendingCandidatesRef = useRef(new Map()); // Map<socketId, RTCIceCandidateInit[]>
  const remoteStreamsRef = useRef(new Map()); // Map<socketId, MediaStream>

  // Audio analyzers for active speaker detection
  const audioContextRef = useRef(null);
  const audioAnalysersRef = useRef(new Map()); // Map<string, AnalyserNode>
  const audioIntervalRef = useRef(null);

  const currentRoomIdRef = useRef(null);
  const currentSocketIdRef = useRef(null);

  const [status, setStatus] = useState('idle'); // 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

  const [isHost, setIsHost] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [peers, setPeers] = useState([]); // Array<{ socketId, stream, isVideoEnabled, isAudioEnabled, isScreenSharing, isSpeaking }>

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [typingUsers, setTypingUsers] = useState(new Set()); // Set of socketIds currently typing
  const [commonInterests, setCommonInterests] = useState([]);
  const [userCount, setUserCount] = useState(1);
  const [showReportModal, setShowReportModal] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = useCallback((msg, duration = 3000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), duration);
  }, []);

  const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.replace(/\/$/, '');
    }
    if (import.meta.env.VITE_WS_URL) {
      return import.meta.env.VITE_WS_URL
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://')
        .replace(/\/ws\/?$/i, '');
    }
    return '';
  };

  /**
   * Fetches TURN servers asynchronously in the background.
   */
  const fetchTurnServers = async () => {
    if (cachedTurnCredentials) {
      iceServersRef.current = [...DEFAULT_ICE_SERVERS, ...cachedTurnCredentials];
      return;
    }
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/turn-credentials`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        throw new Error('Non-JSON response received');
      }
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        cachedTurnCredentials = data;
        iceServersRef.current = [...DEFAULT_ICE_SERVERS, ...data];
      }
    } catch (err) {
      console.warn("Could not fetch TURN servers, using STUN servers:", err.message);
    }
  };

  const startPingInterval = () => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'sys_ping' }));
      }
    }, 10000);
  };

  /**
   * Active Speaker Audio Analysis Loop
   */
  const setupAudioAnalysis = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }

      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = setInterval(() => {
        if (!audioContextRef.current || audioContextRef.current.state === 'suspended') {
          audioContextRef.current?.resume().catch(() => {});
        }

        const dataArray = new Uint8Array(64);

        // Analyze local stream
        const localAnalyser = audioAnalysersRef.current.get('local');
        if (localAnalyser && isAudioEnabled) {
          localAnalyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setIsLocalSpeaking(avg > 15);
        } else {
          setIsLocalSpeaking(false);
        }

        // Analyze remote streams
        setPeers(prevPeers => {
          let hasChanges = false;
          const updated = prevPeers.map(p => {
            const analyser = audioAnalysersRef.current.get(p.socketId);
            if (analyser && p.isAudioEnabled !== false) {
              analyser.getByteFrequencyData(dataArray);
              const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
              const speaking = avg > 15;
              if (speaking !== p.isSpeaking) {
                hasChanges = true;
                return { ...p, isSpeaking: speaking };
              }
            } else if (p.isSpeaking) {
              hasChanges = true;
              return { ...p, isSpeaking: false };
            }
            return p;
          });
          return hasChanges ? updated : prevPeers;
        });
      }, 150);
    } catch (e) {
      console.warn("AudioContext speaker detection error:", e);
    }
  };

  const attachAudioAnalyser = (id, stream) => {
    try {
      if (!audioContextRef.current) return;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioAnalysersRef.current.set(id, analyser);
    } catch (e) {
      console.warn("Could not attach audio analyser for", id, e);
    }
  };

  /**
   * Safely closes and removes all active WebRTC peer connections.
   */
  const cleanupAllPeerConnections = () => {
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch (e) {
        console.warn("Error closing RTCPeerConnection:", e);
      }
    });
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    remoteStreamsRef.current.clear();
    audioAnalysersRef.current.clear();
    setPeers([]);
  };

  /**
   * Cleans up a single peer connection when that participant leaves.
   */
  const cleanupSinglePeer = (peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch (e) {}
      peerConnectionsRef.current.delete(peerId);
    }
    pendingCandidatesRef.current.delete(peerId);
    remoteStreamsRef.current.delete(peerId);
    audioAnalysersRef.current.delete(peerId);
    setPeers(prev => prev.filter(p => p.socketId !== peerId));
  };

  /**
   * Creates and configures an RTCPeerConnection for a specific remote peer.
   */
  const createPeerConnection = (peerId, isOfferInitiator) => {
    if (peerConnectionsRef.current.has(peerId)) {
      cleanupSinglePeer(peerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 2
    });

    peerConnectionsRef.current.set(peerId, pc);

    // Add active media tracks (camera or screen share)
    const activeVideoStream = isScreenSharing && screenStreamRef.current ? screenStreamRef.current : localStreamRef.current;
    if (activeVideoStream) {
      activeVideoStream.getVideoTracks().forEach(track => {
        try {
          pc.addTrack(track, activeVideoStream);
        } catch (e) {}
      });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        try {
          pc.addTrack(track, localStreamRef.current);
        } catch (e) {}
      });
    }

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      let incomingStream = event.streams && event.streams[0];
      if (!incomingStream) {
        let existingStream = remoteStreamsRef.current.get(peerId);
        if (!existingStream) {
          existingStream = new MediaStream();
          remoteStreamsRef.current.set(peerId, existingStream);
        }
        existingStream.addTrack(event.track);
        incomingStream = existingStream;
      } else {
        remoteStreamsRef.current.set(peerId, incomingStream);
      }
      attachAudioAnalyser(peerId, incomingStream);

      setPeers(prev => {
        const existing = prev.find(p => p.socketId === peerId);
        if (existing) {
          return prev.map(p => p.socketId === peerId ? { ...p, stream: incomingStream } : p);
        }
        return [...prev, {
          socketId: peerId,
          stream: incomingStream,
          isVideoEnabled: true,
          isAudioEnabled: true,
          isScreenSharing: false,
          isSpeaking: false
        }];
      });

      setStatus('connected');
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          targetId: peerId,
          candidate: event.candidate,
          roomId: currentRoomIdRef.current
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        setStatus('connected');
      }
    };

    pc.onconnectionstatechange = () => {
      const connState = pc.connectionState;
      if (connState === 'connected') {
        setStatus('connected');
      } else if (connState === 'failed') {
        console.warn(`Peer connection to ${peerId} failed.`);
      }
    };

    // If this client is initiating the offer to the newcomer
    if (isOfferInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'offer',
              targetId: peerId,
              offer: pc.localDescription,
              roomId: currentRoomIdRef.current
            }));
          }
        })
        .catch(err => console.error(`Error creating offer for ${peerId}:`, err));
    }

    return pc;
  };

  /**
   * Handles incoming WebRTC Offer
   */
  const handleOffer = async (message) => {
    const senderId = message.senderId;
    if (!senderId) return;

    try {
      const pc = createPeerConnection(senderId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));

      // Process any buffered ICE candidates for this peer
      const queuedCandidates = pendingCandidatesRef.current.get(senderId) || [];
      for (const candidate of queuedCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
      }
      pendingCandidatesRef.current.delete(senderId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'answer',
          targetId: senderId,
          answer,
          roomId: currentRoomIdRef.current
        }));
      }
    } catch (e) {
      console.error("Error handling offer from", senderId, e);
    }
  };

  /**
   * Handles incoming WebRTC Answer
   */
  const handleAnswer = async (message) => {
    const senderId = message.senderId;
    if (!senderId) return;

    const pc = peerConnectionsRef.current.get(senderId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(message.answer));

      const queuedCandidates = pendingCandidatesRef.current.get(senderId) || [];
      for (const candidate of queuedCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
      }
      pendingCandidatesRef.current.delete(senderId);
    } catch (e) {
      console.error("Error handling answer from", senderId, e);
    }
  };

  /**
   * Handles incoming ICE Candidates
   */
  const handleIceCandidate = async (message) => {
    const senderId = message.senderId;
    if (!senderId || !message.candidate) return;

    const pc = peerConnectionsRef.current.get(senderId);
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (e) {
        console.error("Error adding ice candidate:", e);
      }
    } else {
      if (!pendingCandidatesRef.current.has(senderId)) {
        pendingCandidatesRef.current.set(senderId, []);
      }
      pendingCandidatesRef.current.get(senderId).push(message.candidate);
    }
  };

  /**
   * Starts Screen Sharing and replaces the video track in all active peer connections.
   */
  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);

      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace video track in all active peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      // Notify other peers about screen share state
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'mediaState',
          isScreenSharing: true,
          videoEnabled: isVideoEnabled,
          audioEnabled: isAudioEnabled,
          roomId: currentRoomIdRef.current
        }));
      }

      // Handle user stopping screen share via browser floating bar
      screenTrack.onended = () => {
        stopScreenShare();
      };

      showToast("🖥️ Screen sharing started");
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error("Error starting screen share:", err);
        showToast("Could not start screen share");
      }
    }
  };

  /**
   * Stops Screen Sharing and reverts video track back to the camera.
   */
  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);

    // Revert video track back to local camera
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && cameraTrack) {
        sender.replaceTrack(cameraTrack);
      }
    });

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'mediaState',
        isScreenSharing: false,
        videoEnabled: isVideoEnabled,
        audioEnabled: isAudioEnabled,
        roomId: currentRoomIdRef.current
      }));
    }

    showToast("Screen sharing stopped");
  };

  /**
   * Host Control: Kick a specific participant from the room.
   */
  const kickPeer = (targetSocketId) => {
    if (!isHost) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'kick_user',
        targetId: targetSocketId,
        roomId: currentRoomIdRef.current
      }));
      showToast("User kicked from the room");
    }
  };

  /**
   * Host Control: Request a specific participant to mute their mic.
   */
  const mutePeer = (targetSocketId) => {
    if (!isHost) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'host_mute_user',
        targetId: targetSocketId,
        roomId: currentRoomIdRef.current
      }));
      showToast("Mute request sent to user");
    }
  };

  /**
   * Initializes local media (camera/mic) and signaling.
   */
  const init = async (isMounted) => {
    setErrorMessage('');
    fetchTurnServers().catch(() => {});

    if (mode === 'video' || mode === 'group') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: 'user',
            aspectRatio: 16 / 9
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000
          }
        });

        if (!isMounted()) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }

        setupAudioAnalysis();
        attachAudioAnalyser('local', stream);
        connectSignaling(isMounted);
      } catch (err) {
        console.error("Failed to access camera/mic:", err);
        if (isMounted()) {
          setStatus('error');
          setErrorMessage(
            err.name === 'NotAllowedError'
              ? 'Camera and microphone permissions were denied. Please allow access in browser settings.'
              : 'Could not access camera or microphone.'
          );
        }
      }
    } else {
      // Text only mode
      setIsVideoEnabled(false);
      setIsAudioEnabled(false);
      if (!isMounted()) return;
      connectSignaling(isMounted);
    }
  };

  /**
   * Connects to WebSocket server.
   */
  const connectSignaling = (isMounted = () => true) => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      if (!isMounted()) return;
      startPingInterval();
      findStranger();
    };

    socket.onclose = (event) => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (!isMounted()) return;
      if (status !== 'idle' && status !== 'disconnected') {
        setStatus('disconnected');
        showToast("Connection to server lost.");
      }
    };

    socket.onerror = (error) => {
      console.error("Signaling WebSocket error:", error);
    };

    socket.onmessage = async (event) => {
      if (!isMounted()) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      switch (message.type) {
        case 'sys_pong':
          break;

        case 'waiting':
          setStatus('waiting');
          cleanupAllPeerConnections();
          break;

        case 'matched':
          currentRoomIdRef.current = message.roomId || null;
          setCommonInterests(message.commonInterests || []);
          setIsHost(!!message.isHost);
          setHostId(message.hostId || null);
          cleanupAllPeerConnections();

          if (mode === 'text') {
            setStatus('connected');
            showToast("🎉 Stranger connected!");
          } else {
            setStatus(message.peers && message.peers.length > 0 ? 'connecting' : 'connected');
            showToast(mode === 'group' ? "🎉 Joined group chat room!" : "🎉 Stranger connected!");

            // Send local initial media state
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'mediaState',
                videoEnabled: isVideoEnabled,
                audioEnabled: isAudioEnabled,
                isScreenSharing,
                roomId: currentRoomIdRef.current
              }));
            }

            // In 1-on-1 mode or newly formed group rooms, the initiator creates peer connection(s) and sends WebRTC Offer(s)
            const shouldInitiateOffers = message.initiator ?? (mode !== 'group' && message.isHost);
            if (shouldInitiateOffers && Array.isArray(message.peers)) {
              for (const peer of message.peers) {
                if (peer.socketId) {
                  createPeerConnection(peer.socketId, true);
                }
              }
            }
          }
          break;

        case 'user_joined':
          if (message.peer?.socketId) {
            const newPeerId = message.peer.socketId;
            showToast("👋 A new stranger joined the room!");

            // Existing participant creates offer to the newly joined peer
            if (mode !== 'text') {
              createPeerConnection(newPeerId, true);
            }
          }
          break;

        case 'user_left':
          if (message.socketId) {
            cleanupSinglePeer(message.socketId);
            showToast("A participant left the room.");
            if (message.hostId) {
              setHostId(message.hostId);
              if (socketRef.current && currentSocketIdRef.current === message.hostId) {
                setIsHost(true);
                showToast("👑 You are now the host of this room!");
              }
            }
            if (mode === 'video') {
              setStatus('disconnected');
            }
          }
          break;

        case 'host_changed':
          setHostId(message.hostId);
          setIsHost(!!message.isHost);
          if (message.isHost) {
            showToast("👑 You are now the host of this room!");
          }
          break;

        case 'kicked':
          cleanupAllPeerConnections();
          setStatus('disconnected');
          showToast(message.message || "You were removed from the room by the host.", 5000);
          break;

        case 'host_mute':
          if (isAudioEnabled) {
            toggleAudio();
            showToast("🔇 The host muted your microphone.", 4000);
          }
          break;

        case 'offer':
          await handleOffer(message);
          break;

        case 'answer':
          await handleAnswer(message);
          break;

        case 'ice-candidate':
          await handleIceCandidate(message);
          break;

        case 'mediaState':
          if (message.senderId) {
            setPeers(prev => prev.map(p => {
              if (p.socketId === message.senderId) {
                return {
                  ...p,
                  isVideoEnabled: message.videoEnabled !== undefined ? message.videoEnabled : p.isVideoEnabled,
                  isAudioEnabled: message.audioEnabled !== undefined ? message.audioEnabled : p.isAudioEnabled,
                  isScreenSharing: message.isScreenSharing !== undefined ? message.isScreenSharing : p.isScreenSharing
                };
              }
              return p;
            }));
          }
          break;

        case 'peer_left':
          cleanupAllPeerConnections();
          currentRoomIdRef.current = null;
          setStatus('disconnected');
          showToast("Stranger disconnected.");
          break;

        case 'chat':
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(message.senderId);
            return next;
          });
          setMessages(prev => [
            ...prev,
            {
              text: message.text,
              isSent: false,
              senderId: message.senderId,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          break;

        case 'typing':
          setTypingUsers(prev => {
            const next = new Set(prev);
            if (message.isTyping && message.senderId) {
              next.add(message.senderId);
            } else if (message.senderId) {
              next.delete(message.senderId);
            }
            return next;
          });
          break;

        case 'userCount':
          setUserCount(message.count);
          break;

        default:
          break;
      }
    };
  };

  /**
   * Toggles video on/off.
   */
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newEnabled = videoTrack.enabled;
        setIsVideoEnabled(newEnabled);

        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'mediaState',
            videoEnabled: newEnabled,
            audioEnabled: isAudioEnabled,
            isScreenSharing,
            roomId: currentRoomIdRef.current
          }));
        }
      }
    }
  };

  /**
   * Toggles audio on/off.
   */
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newEnabled = audioTrack.enabled;
        setIsAudioEnabled(newEnabled);

        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'mediaState',
            videoEnabled: isVideoEnabled,
            audioEnabled: newEnabled,
            isScreenSharing,
            roomId: currentRoomIdRef.current
          }));
        }
      }
    }
  };

  /**
   * Sends text chat message.
   */
  const sendMessage = () => {
    if (!chatInput.trim() || status !== 'connected') return;

    const text = chatInput.trim();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'chat',
        text,
        roomId: currentRoomIdRef.current
      }));
    }

    setMessages(prev => [
      ...prev,
      {
        text,
        isSent: true,
        senderId: 'me',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setChatInput("");
  };

  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'typing',
        isTyping: e.target.value.length > 0,
        roomId: currentRoomIdRef.current
      }));
    }
  };

  /**
   * Requests new stranger / next room.
   */
  const findStranger = () => {
    cleanupAllPeerConnections();
    setMessages([]);
    setCommonInterests([]);
    setStatus('waiting');

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'join',
        tags: interests,
        mode,
        sessionId: getSessionId()
      }));
    }
  };

  /**
   * Submits a report to the backend.
   */
  const submitReport = (reason) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'report',
        reason,
        roomId: currentRoomIdRef.current
      }));
      showToast("Report submitted. Thank you for keeping Randall safe.");
    }
    setShowReportModal(false);
  };

  const retryInit = () => {
    let isMounted = true;
    init(() => isMounted);
  };

  useEffect(() => {
    let isMounted = true;
    init(() => isMounted);

    return () => {
      isMounted = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }

      cleanupAllPeerConnections();

      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [mode]);

  return {
    localVideoRef,
    messagesEndRef,
    status,
    errorMessage,
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,
    isLocalSpeaking,
    isHost,
    hostId,
    peers,
    messages,
    chatInput,
    typingUsers,
    commonInterests,
    userCount,
    showReportModal,
    setShowReportModal,
    toastMessage,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
    kickPeer,
    mutePeer,
    handleChatInputChange,
    sendMessage,
    submitReport,
    findStranger,
    retryInit
  };
};
