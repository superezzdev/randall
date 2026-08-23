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

export const useVideoChat = (interests = [], mode = 'video', question = '') => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  
  const currentRoomIdRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  const [status, setStatus] = useState('idle'); // 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isStrangerTyping, setIsStrangerTyping] = useState(false);
  const [commonInterests, setCommonInterests] = useState([]);
  const [userCount, setUserCount] = useState(1);
  const [showReportModal, setShowReportModal] = useState(false);
  const [spyState, setSpyState] = useState(null);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState("");

  /**
   * Fetches TURN servers asynchronously in the background.
   */
  const fetchTurnServers = async () => {
    if (cachedTurnCredentials) {
      iceServersRef.current = [...DEFAULT_ICE_SERVERS, ...cachedTurnCredentials];
      return;
    }
    try {
      const response = await fetch('/api/turn-credentials');
      if (!response.ok) throw new Error('Failed to fetch TURN credentials');
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

  const cleanupPeerConnection = () => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.close();
      } catch (e) {
        console.warn("Error closing RTCPeerConnection:", e);
      }
      peerConnectionRef.current = null;
    }
    pendingOfferRef.current = null;
    pendingIceCandidatesRef.current = [];
  };

  /**
   * Initializes the chat by acquiring media tracks (if video) and establishing signaling immediately.
   */
  const init = async (isMounted) => {
    setErrorMessage('');
    // Trigger background TURN fetch without blocking signaling startup
    fetchTurnServers().catch(() => {});

    if (mode === 'video') {
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
        connectSignaling(isMounted);
      } catch (err) {
        console.error("Failed to access camera/mic:", err);
        if (isMounted()) {
          setStatus('error');
          setErrorMessage(err.name === 'NotAllowedError' ? 'Camera and microphone permissions were denied. Please allow access in browser settings.' : 'Could not access camera or microphone.');
        }
      }
    } else {
      setIsVideoEnabled(false);
      setIsAudioEnabled(false);
      if (!isMounted()) return;
      connectSignaling(isMounted);
    }
  };

  /**
   * Connects to the WebSocket server for signaling.
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
      console.log("Signaling WebSocket closed:", event.code, event.reason);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (!isMounted()) return;
      // If closed unexpectedly while waiting/connecting, notify user
      if (status !== 'idle' && status !== 'disconnected') {
        setStatus('disconnected');
        setToastMessage("Connection to server lost.");
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
          // Keepalive response received
          break;

        case 'waiting':
          setStatus('waiting');
          break;

        case 'matched':
          currentRoomIdRef.current = message.roomId || null;
          pendingOfferRef.current = null;
          pendingIceCandidatesRef.current = [];
          setCommonInterests(message.commonInterests || []);

          if (message.isSpy || message.isSpyStranger) {
            setSpyState({ isSpy: message.isSpy, isSpyStranger: message.isSpyStranger, question: message.question, peerId: message.peerId });
          }

          if (message.isSpy) {
            setStatus('connected');
            setToastMessage("🎉 Spy connected to conversation!");
            setTimeout(() => setToastMessage(""), 2500);
          } else if (mode === 'text') {
            // Text mode: Confirm mutual presence with peer_ready handshake
            setStatus('connecting');
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'peer_ready',
                roomId: currentRoomIdRef.current
              }));
            }

            // 4s Failsafe: if peer is dead, auto-re-queue
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = setTimeout(() => {
              if (status !== 'connected') {
                setToastMessage("Peer unresponsive — finding another stranger...");
                findStranger();
                setTimeout(() => setToastMessage(""), 3000);
              }
            }, 4000);
          } else {
            // Video mode: start WebRTC handshake
            setStatus('connecting');
            setupPeerConnection(message.initiator);
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'mediaState',
                videoEnabled: isVideoEnabled,
                audioEnabled: isAudioEnabled,
                roomId: currentRoomIdRef.current
              }));
              socketRef.current.send(JSON.stringify({
                type: 'peer_ready',
                roomId: currentRoomIdRef.current
              }));
            }

            // 5s Failsafe: if peer is dead or blocked, auto-skip
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = setTimeout(() => {
              if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== 'connected') {
                setToastMessage("Peer unresponsive — finding another stranger...");
                findStranger();
                setTimeout(() => setToastMessage(""), 3000);
              }
            }, 5000);
          }
          break;

        case 'peer_ready':
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          if (mode === 'text') {
            setStatus('connected');
            setToastMessage("🎉 Stranger connected!");
            setTimeout(() => setToastMessage(""), 2500);
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

        case 'peer_left':
          handlePeerLeft();
          break;

        case 'spy_left':
          setSpyState(null);
          setToastMessage(message.message || "The spy has left.");
          setTimeout(() => setToastMessage(""), 3000);
          break;

        case 'spy_timeout':
          setToastMessage(message.message || "No text chats available to spy on.");
          setStatus('disconnected');
          setTimeout(() => setToastMessage(""), 4000);
          break;

        case 'mediaState':
          if (message.videoEnabled !== undefined) setRemoteVideoEnabled(message.videoEnabled);
          if (message.audioEnabled !== undefined) setRemoteAudioEnabled(message.audioEnabled);
          break;

        case 'chat':
          setIsStrangerTyping(false);
          setMessages(prev => [...prev, { text: message.text, isSent: false, sender: 'stranger', senderId: message.senderId }]);
          break;

        case 'typing':
          setIsStrangerTyping(message.isTyping);
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
   * Sets up the WebRTC Peer Connection for P2P video/audio.
   * @param {boolean} isInitiator - Whether this client should create the offer
   */
  const setupPeerConnection = async (isInitiator) => {
    cleanupPeerConnection();

    try {
      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 2
      });
      peerConnectionRef.current = pc;

      // Add local stream tracks to the connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          try {
            pc.addTrack(track, localStreamRef.current);
          } catch (e) {
            console.warn("Error adding local track:", e);
          }
        });
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(e => console.warn("Remote video autoplay blocked:", e));
        }
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setStatus('connected');
        setToastMessage("🎉 Stranger connected!");
        setTimeout(() => setToastMessage(""), 2500);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            roomId: currentRoomIdRef.current
          }));
        }
      };

      pc.onconnectionstatechange = async () => {
        const connState = pc.connectionState;
        if (connState === 'connected') {
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          setStatus('connected');
          setToastMessage("🎉 Stranger connected!");
          setTimeout(() => setToastMessage(""), 2500);

          // Standard W3C bitrate parameter adjustment
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            try {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              params.encodings[0].maxBitrate = 2500000;
              params.encodings[0].maxFramerate = 30;
              params.encodings[0].networkPriority = 'high';
              await sender.setParameters(params);
            } catch (e) {
              console.warn("Could not set sender parameters:", e);
            }
          }
        } else if (connState === 'failed') {
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          setToastMessage("Connection lost — finding a new stranger...");
          findStranger();
          setTimeout(() => setToastMessage(""), 3000);
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'disconnected') {
          setTimeout(() => {
            if (peerConnectionRef.current && peerConnectionRef.current.iceConnectionState === 'disconnected') {
              try {
                peerConnectionRef.current.restartIce();
              } catch {}
            }
          }, 3000);
        } else if (state === 'failed') {
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          setToastMessage("Connection lost — finding a new stranger...");
          findStranger();
          setTimeout(() => setToastMessage(""), 3000);
        }
      };

      // If an offer arrived before PC was ready, process it now
      if (pendingOfferRef.current) {
        const offerMsg = pendingOfferRef.current;
        pendingOfferRef.current = null;
        await handleOffer(offerMsg);
        return;
      }

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'offer',
            offer,
            roomId: currentRoomIdRef.current
          }));
        }
      }
    } catch (err) {
      console.error("Error setting up peer connection:", err);
    }
  };

  /**
   * Handles an incoming WebRTC offer from the initiator.
   */
  const handleOffer = async (message) => {
    if (message.roomId && currentRoomIdRef.current && message.roomId !== currentRoomIdRef.current) {
      return; // Stale offer from previous room
    }

    if (!peerConnectionRef.current) {
      // Buffer offer if PC is still being constructed
      pendingOfferRef.current = message;
      return;
    }

    try {
      const pc = peerConnectionRef.current;
      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'answer',
          answer,
          roomId: currentRoomIdRef.current
        }));
      }
      processIceQueue();
    } catch (e) {
      console.error("Error handling offer:", e);
    }
  };

  const processIceQueue = async () => {
    if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) return;
    while (pendingIceCandidatesRef.current.length > 0) {
      const candidate = pendingIceCandidatesRef.current.shift();
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding queued ice candidate:', e);
      }
    }
  };

  /**
   * Handles an incoming WebRTC answer.
   */
  const handleAnswer = async (message) => {
    if (message.roomId && currentRoomIdRef.current && message.roomId !== currentRoomIdRef.current) {
      return; // Stale answer
    }
    if (!peerConnectionRef.current) return;
    try {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.answer));
      processIceQueue();
    } catch (e) {
      console.error("Error handling answer:", e);
    }
  };

  /**
   * Handles incoming ICE candidates from the peer.
   */
  const handleIceCandidate = async (message) => {
    if (message.roomId && currentRoomIdRef.current && message.roomId !== currentRoomIdRef.current) {
      return;
    }
    try {
      if (peerConnectionRef.current?.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(message.candidate));
      } else {
        pendingIceCandidatesRef.current.push(message.candidate);
      }
    } catch (e) {
      console.error('Error adding received ice candidate:', e);
    }
  };

  /**
   * Handles the event when the peer leaves the connection.
   */
  const handlePeerLeft = () => {
    cleanupPeerConnection();
    currentRoomIdRef.current = null;
    setStatus('disconnected');
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  /**
   * Leaves the current room and joins the waiting queue for a new stranger.
   */
  const findStranger = useCallback(() => {
    cleanupPeerConnection();
    currentRoomIdRef.current = null;
    
    setStatus('idle');
    setMessages([]);
    setIsStrangerTyping(false);
    setCommonInterests([]);
    setShowReportModal(false);
    setSpyState(null);
    setRemoteVideoEnabled(true);
    setRemoteAudioEnabled(true);
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'leave' }));
      socketRef.current.send(JSON.stringify({
        type: 'join',
        tags: interests,
        mode,
        question,
        sessionId: getSessionId()
      }));
    } else {
      connectSignaling();
    }
  }, [interests, mode, question]);

  /**
   * Toggles the user's video track on or off.
   */
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        if (socketRef.current?.readyState === WebSocket.OPEN && status === 'connected') {
          socketRef.current.send(JSON.stringify({
            type: 'mediaState',
            videoEnabled: videoTrack.enabled,
            audioEnabled: isAudioEnabled,
            roomId: currentRoomIdRef.current
          }));
        }
      }
    }
  };

  /**
   * Toggles the user's audio track on or off.
   */
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        if (socketRef.current?.readyState === WebSocket.OPEN && status === 'connected') {
          socketRef.current.send(JSON.stringify({
            type: 'mediaState',
            audioEnabled: audioTrack.enabled,
            videoEnabled: isVideoEnabled,
            roomId: currentRoomIdRef.current
          }));
        }
      }
    }
  };

  /**
   * Handles changes to the chat input and sends typing indicators.
   */
  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    if (status !== 'connected' || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    if (!typingTimeoutRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: true, roomId: currentRoomIdRef.current }));
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: false, roomId: currentRoomIdRef.current }));
      }
      typingTimeoutRef.current = null;
    }, 400);
  };

  /**
   * Sends a chat message to the peer.
   */
  const sendMessage = (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || status !== 'connected') return;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'chat', text: chatInput, roomId: currentRoomIdRef.current }));
      setMessages(prev => [...prev, { text: chatInput, isSent: true, sender: 'me' }]);
      setChatInput("");
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
        socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: false, roomId: currentRoomIdRef.current }));
      }
    }
  };

  /**
   * Submits a report against the current peer.
   */
  const submitReport = async (reason) => {
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: 'anonymous',
          roomType: mode,
          reason
        })
      });
    } catch (e) {
      console.error('Failed to submit report:', e);
    }

    if (socketRef.current?.readyState === WebSocket.OPEN && status === 'connected') {
      socketRef.current.send(JSON.stringify({ type: 'report', reason, roomId: currentRoomIdRef.current }));
    }
    setShowReportModal(false);
    findStranger();
  };

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;
    
    init(isMounted);

    const handleBeforeUnload = () => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({ type: 'leave' }));
          socketRef.current.close(1000, 'Page unloaded');
        } catch {}
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    
    return () => {
      mounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
      cleanupPeerConnection();
      if (socketRef.current) {
        try {
          socketRef.current.send(JSON.stringify({ type: 'leave' }));
          socketRef.current.close();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return {
    localVideoRef, remoteVideoRef, messagesEndRef,
    status, errorMessage, isVideoEnabled, isAudioEnabled, messages, chatInput,
    isStrangerTyping, commonInterests, userCount, showReportModal, setShowReportModal,
    spyState, remoteVideoEnabled, remoteAudioEnabled, toastMessage,
    toggleVideo, toggleAudio, handleChatInputChange, sendMessage, submitReport, findStranger,
    retryInit: () => init(() => true)
  };
};

