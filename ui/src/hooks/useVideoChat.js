import { useEffect, useRef, useState } from 'react';

function setVideoBitrate(sdp, bitrate) {
  return sdp.replace(
    /b=AS:\d+/g,
    `b=AS:${bitrate}`
  ).replace(
    /(m=video.*\r\n)/,
    `$1b=AS:${bitrate}\r\n`
  );
}

let cachedTurnCredentials = null;

export const useVideoChat = (interests = [], mode = 'video', question = '') => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const iceCandidateQueue = useRef([]);

  const [status, setStatus] = useState('idle');
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
   * Fetches TURN servers from our metered.live API to fallback when STUN fails.
   */
  const fetchTurnServers = async () => {
    if (cachedTurnCredentials) {
      iceServersRef.current = [{ urls: 'stun:stun.l.google.com:19302' }, ...cachedTurnCredentials];
      return;
    }
    try {
      const response = await fetch('/api/turn-credentials');
      if (!response.ok) throw new Error('Failed to fetch TURN credentials');
      const data = await response.json();
      if (Array.isArray(data)) {
        cachedTurnCredentials = data;
        iceServersRef.current = [{ urls: 'stun:stun.l.google.com:19302' }, ...data];
      }
    } catch (err) {
      console.warn("Could not fetch TURN servers, falling back to STUN only:", err);
    }
  };

  /**
   * Initializes the video chat by asking for permissions and connecting to signaling.
   */
  const init = async (isMounted) => {
    const turnPromise = fetchTurnServers();

    if (mode === 'video') {
      try {
        const mediaPromise = navigator.mediaDevices.getUserMedia({
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

        // Parallelize TURN fetching and Camera/Mic access
        const [_, stream] = await Promise.all([turnPromise, mediaPromise]);
        if (!isMounted()) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        connectSignaling();
      } catch (err) {
        console.error("Failed to access camera/mic", err);
        if (isMounted()) setStatus('error');
      }
    } else {
      setIsVideoEnabled(false);
      setIsAudioEnabled(false);
      await turnPromise;
      if (!isMounted()) return;
      connectSignaling();
    }
  };

  /**
   * Connects to the WebSocket server for signaling.
   */
  const connectSignaling = () => {
    const wsUrl = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => findStranger();

    socketRef.current.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'waiting': setStatus('waiting'); break;
        case 'matched':
          setCommonInterests(message.commonInterests || []);
          if (message.isSpy || message.isSpyStranger) {
            setSpyState({ isSpy: message.isSpy, isSpyStranger: message.isSpyStranger, question: message.question, peerId: message.peerId });
          }
          if (mode === 'text' || message.isSpy) {
            setStatus('connected');
            setToastMessage("🎉 Stranger connected!");
            setTimeout(() => setToastMessage(""), 2500);
          } else {
            // In video mode, transition to 'connecting' while WebRTC completes handshake
            setStatus('connecting');
            setupPeerConnection(message.initiator);
            socketRef.current.send(JSON.stringify({ type: 'mediaState', videoEnabled: isVideoEnabled, audioEnabled: isAudioEnabled }));

            // 10s Failsafe: if peer is dead or blocked, auto-skip
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = setTimeout(() => {
              if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== 'connected') {
                setToastMessage("Could not connect to peer — finding another stranger...");
                findStranger();
                setTimeout(() => setToastMessage(""), 3000);
              }
            }, 10000);
          }
          break;
        case 'offer': await handleOffer(message); break;
        case 'answer': await handleAnswer(message); break;
        case 'ice-candidate': await handleIceCandidate(message); break;
        case 'peer_left': handlePeerLeft(); break;
        case 'mediaState':
          if (message.videoEnabled !== undefined) setRemoteVideoEnabled(message.videoEnabled);
          if (message.audioEnabled !== undefined) setRemoteAudioEnabled(message.audioEnabled);
          break;
        case 'chat':
          setIsStrangerTyping(false);
          setMessages(prev => [...prev, { text: message.text, isSent: false, sender: 'stranger', senderId: message.senderId }]);
          break;
        case 'typing': setIsStrangerTyping(message.isTyping); break;
        case 'userCount': setUserCount(message.count); break;
        default: break;
      }
    };
  };

  /**
   * Sets up the WebRTC Peer Connection for P2P video/audio.
   * @param {boolean} isInitiator - Whether this client should create the offer
   */
  const setupPeerConnection = async (isInitiator) => {
    peerConnectionRef.current = new RTCPeerConnection({ iceServers: iceServersRef.current });
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => peerConnectionRef.current.addTrack(track, localStreamRef.current));
    }
    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      setStatus('connected');
      setToastMessage("🎉 Stranger connected!");
      setTimeout(() => setToastMessage(""), 2500);
    };
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
      }
    };

    peerConnectionRef.current.onconnectionstatechange = async () => {
      const connState = peerConnectionRef.current?.connectionState;
      if (connState === 'connected') {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setStatus('connected');
        setToastMessage("🎉 Stranger connected!");
        setTimeout(() => setToastMessage(""), 2500);

        const sender = peerConnectionRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          try {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 2500000;
            params.encodings[0].maxFramerate = 30;
            params.encodings[0].networkPriority = 'high';
            await sender.setParameters(params);
          } catch (e) {
            console.warn("Could not set sender parameters", e);
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

    peerConnectionRef.current.oniceconnectionstatechange = () => {
      const state = peerConnectionRef.current?.iceConnectionState;
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

    if (isInitiator) {
      const offer = await peerConnectionRef.current.createOffer();
      offer.sdp = setVideoBitrate(offer.sdp, 2500);
      await peerConnectionRef.current.setLocalDescription(offer);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'offer', offer }));
      }
    }
  };

  /**
   * Handles an incoming WebRTC offer from the initiator.
   * @param {Object} message - The message containing the offer
   */
  const handleOffer = async (message) => {
    if (!peerConnectionRef.current) return;
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.offer));
    const answer = await peerConnectionRef.current.createAnswer();
    answer.sdp = setVideoBitrate(answer.sdp, 2500);
    await peerConnectionRef.current.setLocalDescription(answer);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'answer', answer }));
    }
    processIceQueue();
  };

  const processIceQueue = async () => {
    while (iceCandidateQueue.current.length > 0) {
      const candidate = iceCandidateQueue.current.shift();
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.error('Error adding queued ice candidate', e);
      }
    }
  };

  /**
   * Handles an incoming WebRTC answer.
   * @param {Object} message - The message containing the answer
   */
  const handleAnswer = async (message) => {
    if (!peerConnectionRef.current) return;
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.answer));
    processIceQueue();
  };

  /**
   * Handles incoming ICE candidates from the peer.
   * @param {Object} message - The message containing the ICE candidate
   */
  const handleIceCandidate = async (message) => {
    try {
      if (peerConnectionRef.current?.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(message.candidate));
      } else {
        iceCandidateQueue.current.push(message.candidate);
      }
    } catch (e) {
      console.error('Error adding received ice candidate', e);
    }
  };

  /**
   * Handles the event when the peer leaves the connection.
   */
  const handlePeerLeft = () => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    setStatus('disconnected');
    if (peerConnectionRef.current) { 
      peerConnectionRef.current.close(); 
      peerConnectionRef.current = null; 
    }
  };

  /**
   * Leaves the current room and joins the waiting queue for a new stranger.
   */
  const findStranger = () => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    setStatus('idle'); setMessages([]); setIsStrangerTyping(false); setCommonInterests([]);
    setShowReportModal(false); setSpyState(null); setRemoteVideoEnabled(true); setRemoteAudioEnabled(true);
    iceCandidateQueue.current = [];
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (peerConnectionRef.current) { 
      peerConnectionRef.current.close(); 
      peerConnectionRef.current = null; 
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'leave' }));
      socketRef.current.send(JSON.stringify({ type: 'join', tags: interests, mode, question }));
    }
  };

  /**
   * Toggles the user's video track on or off.
   */
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        if (socketRef.current && status === 'connected') {
          socketRef.current.send(JSON.stringify({ type: 'mediaState', videoEnabled: videoTrack.enabled, audioEnabled: isAudioEnabled }));
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
        if (socketRef.current && status === 'connected') {
          socketRef.current.send(JSON.stringify({ type: 'mediaState', audioEnabled: audioTrack.enabled, videoEnabled: isVideoEnabled }));
        }
      }
    }
  };

  /**
   * Handles changes to the chat input and sends typing indicators.
   * @param {Object} e - The input change event
   */
  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    if (status !== 'connected') return;
    if (!typingTimeoutRef.current) socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: true }));
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: false }));
      typingTimeoutRef.current = null;
    }, 300);
  };

  /**
   * Sends a chat message to the peer.
   * @param {Object} e - The form submit event
   */
  const sendMessage = (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || status !== 'connected') return;
    socketRef.current.send(JSON.stringify({ type: 'chat', text: chatInput }));
    setMessages(prev => [...prev, { text: chatInput, isSent: true, sender: 'me' }]);
    setChatInput("");
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: false }));
    }
  };

  /**
   * Submits a report against the current peer.
   * @param {string} reason - The reason for the report
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
      console.error('Failed to submit report', e);
    }

    if (socketRef.current && status === 'connected') {
      socketRef.current.send(JSON.stringify({ type: 'report', reason }));
    }
    setShowReportModal(false);
    findStranger();
  };

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;
    
    init(isMounted);
    
    return () => {
      mounted = false;
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return {
    localVideoRef, remoteVideoRef, messagesEndRef,
    status, isVideoEnabled, isAudioEnabled, messages, chatInput,
    isStrangerTyping, commonInterests, userCount, showReportModal, setShowReportModal,
    spyState, remoteVideoEnabled, remoteAudioEnabled, toastMessage,
    toggleVideo, toggleAudio, handleChatInputChange, sendMessage, submitReport, findStranger
  };
};
