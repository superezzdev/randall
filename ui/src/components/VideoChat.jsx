import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVideoChat } from '../hooks/useVideoChat.js';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  SkipForward, LogOut, Flag, MessageCircle, X, Send, Search,
  Crown, UserX, Users, ArrowLeftRight, Move, Sparkles, SwitchCamera,
  Pin, PinOff, Maximize2, Minimize2, LayoutGrid
} from 'lucide-react';
import { useVisualViewport } from '../hooks/useVisualViewport.js';

/**
 * Reusable Video Stream Player
 * Safely attaches MediaStream to a video element with fallback avatar, fit-mode handling, and status badges.
 */
const VideoStreamPlayer = ({
  stream,
  muted = false,
  mirrored = false,
  className = '',
  videoEnabled = true,
  fallbackLabel = 'User',
  fallbackSubtext = 'Camera Off',
  isSpeaking = false,
  badgeText = null,
  isHost = false,
  isAudioEnabled = true,
  isScreenSharing = false,
  fitMode = 'cover', // 'cover' | 'contain'
  onDoubleClick,
  children
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name !== 'AbortError') {
            console.warn("Stream playback warning:", e);
          }
        });
      }
    } else {
      videoEl.srcObject = null;
    }
  }, [stream]);

  const isVideoVisible = videoEnabled && !!stream;

  return (
    <div
      onDoubleClick={onDoubleClick}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center bg-slate-950 select-none ${className}`}
    >
      {/* Ambient background blur when in 'contain' mode to provide sleek letterboxing */}
      {isVideoVisible && fitMode === 'contain' && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-25 filter blur-xl scale-110">
          <video
            ref={(el) => {
              if (el && stream && el.srcObject !== stream) {
                el.srcObject = stream;
                el.play().catch(() => {});
              }
            }}
            playsInline
            autoPlay
            muted
            aria-hidden="true"
            className={`w-full h-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
          />
        </div>
      )}

      {/* Main Video Element */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={muted}
        className={`w-full h-full transition-all duration-200 z-0 ${
          fitMode === 'contain' ? 'object-contain' : 'object-cover'
        } ${mirrored ? 'scale-x-[-1]' : ''} ${isVideoVisible ? 'block' : 'hidden'}`}
      />

      {/* Fallback Avatar when camera is off or stream missing */}
      {!isVideoVisible && (
        <div className="flex flex-col items-center justify-center gap-3 p-4 text-center select-none animate-fade-in z-10">
          <div
            className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-tr from-[#003cff] to-[#6366f1] text-[#d8ff00] font-black text-2xl sm:text-3xl md:text-4xl flex items-center justify-center shadow-2xl border-2 border-white/20 transition-all duration-300 ${
              isSpeaking ? 'ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-950 scale-105' : ''
            }`}
          >
            {fallbackLabel.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs sm:text-sm md:text-base font-bold text-white tracking-wide flex items-center gap-1.5">
              {fallbackLabel}
              {isHost && (
                <span className="flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-1.5 py-0.5 rounded-full text-[10px] font-black">
                  <Crown size={10} /> Host
                </span>
              )}
            </span>
            <span className="text-[11px] sm:text-xs text-slate-400 font-medium">{fallbackSubtext}</span>
          </div>
        </div>
      )}

      {/* Top Name & Role Badge */}
      {badgeText && (
        <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
          <div className="px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md text-white text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-sm border border-white/10">
            <span>{badgeText}</span>
            {isHost && (
              <span className="flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-1.5 py-0.5 rounded-full text-[9px] font-black">
                <Crown size={10} /> Host
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom Media Badges (Mic off / Screen share) */}
      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
        {isScreenSharing && (
          <div className="p-1.5 rounded-full bg-[#003cff] text-white text-xs shadow-md border border-white/10" title="Screen sharing">
            <Monitor size={13} />
          </div>
        )}
        {!isAudioEnabled && (
          <div className="p-1.5 rounded-full bg-red-500/90 text-white text-xs shadow-md backdrop-blur-sm border border-red-400/30" title="Muted">
            <MicOff size={13} />
          </div>
        )}
      </div>

      {children}
    </div>
  );
};

/**
 * Group Remote Participant Tile
 */
const GroupParticipantTile = ({
  peer,
  index,
  isCurrentUserHost,
  hostId,
  onKick,
  onMute,
  isPinned = false,
  onTogglePin,
  fitMode = 'cover',
  onToggleFit,
  isMiniThumbnail = false
}) => {
  const isPeerHost = peer.socketId === hostId;

  return (
    <div
      className={`group/tile relative w-full h-full rounded-2xl md:rounded-3xl overflow-hidden bg-slate-950 flex items-center justify-center border-2 transition-all duration-300 shadow-xl ${
        peer.isSpeaking
          ? 'border-[#4ade80] ring-2 ring-[#4ade80]/40 shadow-[0_0_24px_rgba(74,222,128,0.4)]'
          : 'border-white/10 hover:border-white/25'
      }`}
    >
      <VideoStreamPlayer
        stream={peer.stream}
        videoEnabled={peer.isVideoEnabled}
        isAudioEnabled={peer.isAudioEnabled}
        isSpeaking={peer.isSpeaking}
        isScreenSharing={peer.isScreenSharing}
        fallbackLabel={`Stranger ${index + 1}`}
        fallbackSubtext="Camera Off"
        badgeText={`Stranger ${index + 1}`}
        isHost={isPeerHost}
        fitMode={fitMode}
        onDoubleClick={onToggleFit}
      >
        {/* Top-Right Quick Action Overlays */}
        {!isMiniThumbnail && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20 opacity-90 sm:opacity-0 group-hover/tile:opacity-100 transition-opacity">
            {/* Fit / Fill Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFit?.();
              }}
              title={fitMode === 'contain' ? "Zoom to fill tile" : "Fit full camera frame (No crop)"}
              className={`p-1.5 rounded-full backdrop-blur-md border shadow-md transition-all active:scale-95 cursor-pointer ${
                fitMode === 'contain'
                  ? 'bg-[#003cff] text-[#d8ff00] border-[#003cff]'
                  : 'bg-black/60 hover:bg-[#003cff] text-white border-white/10'
              }`}
            >
              {fitMode === 'contain' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>

            {/* Pin / Spotlight Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin?.();
              }}
              title={isPinned ? "Unpin participant (Grid view)" : "Pin / Spotlight participant"}
              className={`p-1.5 rounded-full backdrop-blur-md border shadow-md transition-all active:scale-95 cursor-pointer ${
                isPinned
                  ? 'bg-[#d8ff00] text-[#003cff] border-[#d8ff00]'
                  : 'bg-black/60 hover:bg-[#003cff] text-white border-white/10'
              }`}
            >
              {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>

            {/* Host Controls */}
            {isCurrentUserHost && (
              <>
                <button
                  title="Mute participant"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMute(peer.socketId);
                  }}
                  className="p-1.5 rounded-full bg-black/60 hover:bg-yellow-500 text-white hover:text-black transition-colors backdrop-blur-md border border-white/10 shadow-md active:scale-95 cursor-pointer"
                >
                  <MicOff size={13} />
                </button>
                <button
                  title="Kick participant"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKick(peer.socketId);
                  }}
                  className="p-1.5 rounded-full bg-black/60 hover:bg-red-500 text-white transition-colors backdrop-blur-md border border-white/10 shadow-md active:scale-95 cursor-pointer"
                >
                  <UserX size={13} />
                </button>
              </>
            )}
          </div>
        )}
      </VideoStreamPlayer>
    </div>
  );
};

/**
 * Group Local Participant Tile
 */
const GroupLocalTile = ({
  localStream,
  isVideoEnabled,
  isAudioEnabled,
  isLocalSpeaking,
  isScreenSharing,
  isHost,
  facingMode,
  isPinned = false,
  onTogglePin,
  fitMode = 'cover',
  onToggleFit,
  switchCamera,
  isSwitchingCamera,
  isMiniThumbnail = false
}) => {
  return (
    <div
      className={`group/tile relative w-full h-full rounded-2xl md:rounded-3xl overflow-hidden bg-slate-950 flex items-center justify-center border-2 transition-all duration-300 shadow-xl ${
        isLocalSpeaking
          ? 'border-[#4ade80] ring-2 ring-[#4ade80]/40 shadow-[0_0_24px_rgba(74,222,128,0.4)]'
          : 'border-white/10 hover:border-white/25'
      }`}
    >
      <VideoStreamPlayer
        stream={localStream}
        videoEnabled={isVideoEnabled}
        isAudioEnabled={isAudioEnabled}
        isSpeaking={isLocalSpeaking}
        isScreenSharing={isScreenSharing}
        fallbackLabel="You"
        fallbackSubtext="Camera Off"
        badgeText="You"
        isHost={isHost}
        mirrored={facingMode === 'user' && !isScreenSharing}
        muted={true}
        fitMode={fitMode}
        onDoubleClick={onToggleFit}
      >
        {/* Top-Right Quick Action Overlays */}
        {!isMiniThumbnail && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20 opacity-90 sm:opacity-0 group-hover/tile:opacity-100 transition-opacity">
            {/* Camera Switch */}
            {switchCamera && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  switchCamera();
                }}
                title={facingMode === 'user' ? "Switch to back camera" : "Switch to front camera"}
                disabled={!isVideoEnabled || isScreenSharing || isSwitchingCamera}
                className="p-1.5 rounded-full bg-black/60 hover:bg-[#003cff] text-white transition-all backdrop-blur-md border border-white/10 shadow-md active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <SwitchCamera size={13} className={isSwitchingCamera ? 'animate-spin' : ''} />
              </button>
            )}

            {/* Fit / Fill Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFit?.();
              }}
              title={fitMode === 'contain' ? "Zoom to fill tile" : "Fit full camera frame (No crop)"}
              className={`p-1.5 rounded-full backdrop-blur-md border shadow-md transition-all active:scale-95 cursor-pointer ${
                fitMode === 'contain'
                  ? 'bg-[#003cff] text-[#d8ff00] border-[#003cff]'
                  : 'bg-black/60 hover:bg-[#003cff] text-white border-white/10'
              }`}
            >
              {fitMode === 'contain' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>

            {/* Pin / Spotlight Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin?.();
              }}
              title={isPinned ? "Unpin (Grid view)" : "Spotlight your camera"}
              className={`p-1.5 rounded-full backdrop-blur-md border shadow-md transition-all active:scale-95 cursor-pointer ${
                isPinned
                  ? 'bg-[#d8ff00] text-[#003cff] border-[#d8ff00]'
                  : 'bg-black/60 hover:bg-[#003cff] text-white border-white/10'
              }`}
            >
              {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </div>
        )}
      </VideoStreamPlayer>
    </div>
  );
};

const VideoChat = ({ onQuit, interests = [], mode = 'video' }) => {
  const {
    localStream,
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
    showReportModal,
    setShowReportModal,
    toastMessage,
    facingMode,
    isSwitchingCamera,
    switchCamera,
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
  } = useVideoChat(interests, mode);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [callDuration, setCallDuration] = useState(0);

  // Group Call layout state
  const [pinnedPeerId, setPinnedPeerId] = useState(null); // null (grid) | 'local' | socketId
  const [globalFitMode, setGlobalFitMode] = useState('cover'); // 'cover' | 'contain'
  const [tileFitOverrides, setTileFitOverrides] = useState({}); // Map<socketId | 'local', 'cover' | 'contain'>

  // WhatsApp PiP state for 1-on-1: view swapping and corner positioning
  const [isSwapped, setIsSwapped] = useState(false);
  const [pipPosition, setPipPosition] = useState('top-right'); // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

  const prevMessagesLength = useRef(messages.length);

  useVisualViewport();

  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
    } else if (messages.length > prevMessagesLength.current) {
      const newMessages = messages.slice(prevMessagesLength.current);
      const newReceived = newMessages.filter(m => m.senderId !== 'me').length;
      if (newReceived > 0) {
        setUnreadCount(prev => prev + newReceived);
      }
    }
    prevMessagesLength.current = messages.length;

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen, messagesEndRef]);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const isWaiting = status === 'idle' || status === 'waiting';
  const isDisconnected = status === 'disconnected';
  const isError = status === 'error';
  const isTextMode = mode === 'text';
  const is1on1Video = mode === 'video' || (mode !== 'group' && !isTextMode);

  // Search Timer
  useEffect(() => {
    let interval;
    if (isWaiting || isConnecting) {
      interval = setInterval(() => {
        setWaitSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setWaitSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isWaiting, isConnecting]);

  // Connected Call Duration Timer
  useEffect(() => {
    let timer;
    if (isConnected) {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
      setIsSwapped(false);
      setPinnedPeerId(null);
    }
    return () => clearInterval(timer);
  }, [isConnected]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalParticipants = 1 + peers.length;
  const primaryRemotePeer = peers[0] || null;

  // Toggle swap between Main Stage and PiP in 1-on-1
  const toggleSwap = () => {
    if (peers.length > 0) {
      setIsSwapped(prev => !prev);
    }
  };

  // Cycle PiP position through 4 corners in 1-on-1
  const cyclePipPosition = (e) => {
    e.stopPropagation();
    const positions = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];
    const nextIdx = (positions.indexOf(pipPosition) + 1) % positions.length;
    setPipPosition(positions[nextIdx]);
  };

  const getPipPositionClass = () => {
    switch (pipPosition) {
      case 'top-left':
        return 'top-16 sm:top-20 left-4 sm:left-6';
      case 'bottom-left':
        return 'bottom-24 sm:bottom-28 left-4 sm:left-6';
      case 'bottom-right':
        return 'bottom-24 sm:bottom-28 right-4 sm:right-6';
      case 'top-right':
      default:
        return 'top-16 sm:top-20 right-4 sm:right-6';
    }
  };

  // Get fit mode for a specific tile
  const getTileFitMode = (tileId) => {
    return tileFitOverrides[tileId] || globalFitMode;
  };

  // Toggle individual tile fit mode
  const toggleTileFit = (tileId) => {
    setTileFitOverrides(prev => {
      const current = prev[tileId] || globalFitMode;
      const next = current === 'contain' ? 'cover' : 'contain';
      return { ...prev, [tileId]: next };
    });
  };

  // Toggle global fit mode across all tiles
  const toggleGlobalFit = () => {
    const nextMode = globalFitMode === 'contain' ? 'cover' : 'contain';
    setGlobalFitMode(nextMode);
    setTileFitOverrides({});
  };

  // Toggle spotlight pinning for a tile
  const handleTogglePin = (tileId) => {
    setPinnedPeerId(prev => (prev === tileId ? null : tileId));
  };

  // Build unified list of participants for group mode
  const participantList = useMemo(() => {
    const list = [
      {
        id: 'local',
        isLocal: true,
        stream: localStream,
        isVideoEnabled,
        isAudioEnabled,
        isSpeaking: isLocalSpeaking,
        isScreenSharing,
        isHost,
        facingMode
      }
    ];
    peers.forEach((peer, idx) => {
      list.push({
        id: peer.socketId,
        isLocal: false,
        peer,
        index: idx
      });
    });
    return list;
  }, [localStream, isVideoEnabled, isAudioEnabled, isLocalSpeaking, isScreenSharing, isHost, facingMode, peers]);

  const pinnedParticipant = useMemo(() => {
    if (!pinnedPeerId) return null;
    return participantList.find(p => p.id === pinnedPeerId) || null;
  }, [pinnedPeerId, participantList]);

  const unpinnedParticipants = useMemo(() => {
    if (!pinnedPeerId) return participantList;
    return participantList.filter(p => p.id !== pinnedPeerId);
  }, [pinnedPeerId, participantList]);

  return (
    <main className="fixed inset-0 bg-[#070b14] text-white flex flex-col font-['Inter',system-ui,sans-serif] overflow-hidden select-none">
      
      {/* ── TOP FLOATING HEADER ── */}
      <header className="absolute top-0 left-0 right-0 h-[64px] bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between px-3 sm:px-6 z-40 backdrop-blur-[2px]">
        {/* Left: Mode, Status & Call Duration */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-black/50 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-full border border-white/15 text-xs font-bold shadow-md">
            <Users size={14} className="text-[#d8ff00] shrink-0" />
            <span className="truncate">
              {mode === 'group'
                ? `Group (${totalParticipants}/5)`
                : isTextMode
                ? '1-on-1 Text'
                : '1-on-1 Video'}
            </span>
          </div>

          {isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-500/15 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-full border border-green-500/30 shadow-md">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
              <span>{formatDuration(callDuration)}</span>
            </div>
          )}

          {isHost && mode === 'group' && (
            <div className="hidden sm:flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-2.5 py-1 rounded-full text-xs font-black shadow-sm">
              <Crown size={12} /> Host
            </div>
          )}
        </div>

        {/* Center: Shared Interests */}
        {isConnected && commonInterests.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/15 px-3 py-1 rounded-full text-xs">
            <Sparkles size={12} className="text-[#d8ff00]" />
            <span className="text-white/70">Shared:</span>
            {commonInterests.map((interest, i) => (
              <span key={i} className="bg-[#003cff]/80 text-[#d8ff00] font-bold px-2 py-0.5 rounded-full text-[11px]">
                {interest}
              </span>
            ))}
          </div>
        )}

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Global Fit Mode Toggle (Group mode) */}
          {mode === 'group' && (
            <button
              aria-label="Toggle Global Video Fit"
              title={globalFitMode === 'contain' ? "Zoom to fill all tiles" : "Fit all feeds to show full frame (No crop)"}
              onClick={toggleGlobalFit}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border backdrop-blur-md text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer ${
                globalFitMode === 'contain'
                  ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00]'
                  : 'bg-black/40 border-white/15 text-white hover:bg-white/20'
              }`}
            >
              {globalFitMode === 'contain' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span>{globalFitMode === 'contain' ? 'Fit View' : 'Fill View'}</span>
            </button>
          )}

          {/* Chat Toggle */}
          <button
            aria-label="Toggle Chat"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`relative p-2 rounded-full border backdrop-blur-md transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer ${
              isChatOpen
                ? 'bg-[#003cff] border-[#003cff] text-white'
                : 'bg-black/40 border-white/15 text-white hover:bg-white/20'
            }`}
          >
            <MessageCircle size={17} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-[#d8ff00] text-[#003cff] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Report Button */}
          <button
            aria-label="Report User"
            title="Report Stranger"
            onClick={() => setShowReportModal(true)}
            className="p-2 text-white/80 hover:text-red-400 rounded-full bg-black/40 hover:bg-red-500/20 border border-white/15 transition-all backdrop-blur-md shadow-md cursor-pointer"
          >
            <Flag size={17} />
          </button>

          {/* Skip / Next */}
          <button
            aria-label="Skip to next stranger"
            onClick={findStranger}
            className="px-3 sm:px-3.5 py-1.5 bg-[#d8ff00] hover:bg-[#ccee00] text-[#003cff] font-black rounded-full text-xs sm:text-sm flex items-center gap-1.5 transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer"
          >
            <SkipForward size={15} /> <span className="hidden sm:inline">Skip</span>
          </button>

          {/* Quit Button */}
          <button
            aria-label="Quit Chat"
            title="Exit Call"
            onClick={onQuit}
            className="p-2 text-white/80 hover:text-red-400 rounded-full bg-black/40 hover:bg-white/20 border border-white/15 transition-all backdrop-blur-md shadow-md cursor-pointer"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* ── TOAST NOTIFICATION ── */}
      {toastMessage && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 bg-[#d8ff00] text-[#003cff] px-5 py-2 rounded-full shadow-[0_4px_24px_rgba(216,255,0,0.5)] z-[100] flex items-center gap-2 text-xs sm:text-sm font-black animate-[slide-down_0.2s_ease-out] whitespace-nowrap">
          {toastMessage}
        </div>
      )}

      {/* ── MAIN CONTENT VIEWPORT ── */}
      <div className="flex-1 relative flex overflow-hidden w-full h-full">
        
        {/* ══════════════════════════════════════════════════════════════
            WHATSAPP 1-ON-1 VIDEO LAYOUT (Full-bleed Remote + Floating PiP)
           ══════════════════════════════════════════════════════════════ */}
        {is1on1Video && !isTextMode && (
          <div className="relative flex-1 w-full h-full overflow-hidden bg-black">
            
            {/* 1. FULL-BLEED MAIN STAGE */}
            <div className="absolute inset-0 w-full h-full">
              {!isSwapped ? (
                isConnected && primaryRemotePeer ? (
                  <VideoStreamPlayer
                    stream={primaryRemotePeer.stream}
                    videoEnabled={primaryRemotePeer.isVideoEnabled}
                    isAudioEnabled={primaryRemotePeer.isAudioEnabled}
                    isSpeaking={primaryRemotePeer.isSpeaking}
                    isScreenSharing={primaryRemotePeer.isScreenSharing}
                    fallbackLabel="Stranger"
                    fallbackSubtext="Camera Off"
                    badgeText="Stranger"
                    mirrored={false}
                    muted={false}
                    fitMode={globalFitMode}
                  />
                ) : (
                  <VideoStreamPlayer
                    stream={localStream}
                    videoEnabled={isVideoEnabled}
                    isAudioEnabled={isAudioEnabled}
                    isSpeaking={isLocalSpeaking}
                    isScreenSharing={isScreenSharing}
                    fallbackLabel="You"
                    fallbackSubtext="Your Camera is Off"
                    badgeText="You (Preview)"
                    mirrored={facingMode === 'user' && !isScreenSharing}
                    muted={true}
                    fitMode={globalFitMode}
                  />
                )
              ) : (
                <VideoStreamPlayer
                  stream={localStream}
                  videoEnabled={isVideoEnabled}
                  isAudioEnabled={isAudioEnabled}
                  isSpeaking={isLocalSpeaking}
                  isScreenSharing={isScreenSharing}
                  fallbackLabel="You"
                  fallbackSubtext="Your Camera is Off"
                  badgeText="You (Large View)"
                  mirrored={facingMode === 'user' && !isScreenSharing}
                  muted={true}
                  fitMode={globalFitMode}
                />
              )}
            </div>

            {/* 2. FLOATING PICTURE-IN-PICTURE (PiP) WINDOW */}
            {isConnected && (
              <div
                onClick={toggleSwap}
                title="Click to swap view"
                className={`absolute ${getPipPositionClass()} w-28 sm:w-36 md:w-48 aspect-[3/4] rounded-2xl sm:rounded-3xl overflow-hidden border-2 transition-all duration-300 shadow-[0_12px_36px_rgba(0,0,0,0.7)] cursor-pointer z-30 group hover:scale-105 ${
                  (!isSwapped ? isLocalSpeaking : primaryRemotePeer?.isSpeaking)
                    ? 'border-emerald-400 shadow-[0_0_24px_rgba(74,222,128,0.5)]'
                    : 'border-white/20 hover:border-[#d8ff00]'
                }`}
              >
                {!isSwapped ? (
                  <VideoStreamPlayer
                    stream={localStream}
                    videoEnabled={isVideoEnabled}
                    isAudioEnabled={isAudioEnabled}
                    isSpeaking={isLocalSpeaking}
                    isScreenSharing={isScreenSharing}
                    fallbackLabel="You"
                    fallbackSubtext="Off"
                    badgeText="You"
                    mirrored={facingMode === 'user' && !isScreenSharing}
                    muted={true}
                    fitMode="cover"
                  />
                ) : (
                  <VideoStreamPlayer
                    stream={primaryRemotePeer?.stream}
                    videoEnabled={primaryRemotePeer?.isVideoEnabled ?? true}
                    isAudioEnabled={primaryRemotePeer?.isAudioEnabled ?? true}
                    isSpeaking={primaryRemotePeer?.isSpeaking ?? false}
                    isScreenSharing={primaryRemotePeer?.isScreenSharing ?? false}
                    fallbackLabel="Stranger"
                    fallbackSubtext="Off"
                    badgeText="Stranger"
                    mirrored={false}
                    muted={false}
                    fitMode="cover"
                  />
                )}

                {/* PiP Action Overlays */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-between p-2 pointer-events-none">
                  <div className="w-full flex items-center justify-between pointer-events-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        switchCamera();
                      }}
                      title={facingMode === 'user' ? "Switch to rear camera" : "Switch to front camera"}
                      disabled={!isVideoEnabled || isScreenSharing || isSwitchingCamera}
                      className="p-1.5 rounded-full bg-black/70 text-white hover:text-[#d8ff00] transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <SwitchCamera size={12} className={isSwitchingCamera ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={cyclePipPosition}
                      title="Move PiP corner"
                      className="p-1.5 rounded-full bg-black/70 text-white hover:text-[#d8ff00] transition-colors cursor-pointer"
                    >
                      <Move size={12} />
                    </button>
                  </div>
                  <div className="bg-black/70 backdrop-blur-md text-[#d8ff00] text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 border border-white/10 shadow-lg">
                    <ArrowLeftRight size={10} /> Tap to Swap
                  </div>
                  <div className="h-2" />
                </div>
              </div>
            )}

            {/* 3. SEARCHING / MATCHMAKING RADAR OVERLAY (1-on-1) */}
            {(isWaiting || isConnecting) && (
              <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="relative flex items-center justify-center mb-6">
                  <div className="absolute w-36 h-36 rounded-full bg-[#003cff]/25 animate-ping duration-1000" />
                  <div className="absolute w-28 h-28 rounded-full bg-[#d8ff00]/25 animate-pulse" />
                  <div className="w-20 h-20 bg-gradient-to-tr from-[#003cff] to-[#6366f1] rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,60,255,0.6)] border-2 border-[#d8ff00] z-10">
                    <Search size={32} className="text-[#d8ff00] animate-bounce" strokeWidth={2.5} />
                  </div>
                </div>

                <h2 className="text-white text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                  {isConnecting ? 'Connecting video stream…' : 'Looking for a stranger…'}
                </h2>
                <p className="text-slate-300 text-sm sm:text-base font-medium max-w-sm mb-4">
                  {isConnecting
                    ? 'Establishing direct peer-to-peer connection'
                    : `Searching for ${waitSeconds}s`}
                </p>

                {interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-xs mb-8">
                    <span className="text-xs text-slate-400 font-semibold w-full mb-1">
                      Filtering by your interests:
                    </span>
                    {interests.map((tag, idx) => (
                      <span
                        key={idx}
                        className="bg-white/10 text-[#d8ff00] border border-white/20 px-3 py-1 rounded-full text-xs font-bold shadow-sm"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  onClick={onQuit}
                  className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs sm:text-sm font-bold transition-all active:scale-95 shadow-md cursor-pointer"
                >
                  Cancel Search
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            RESPONSIVE MULTI-PARTY GROUP VIDEO CALL GRID
           ══════════════════════════════════════════════════════════════ */}
        {mode === 'group' && !isTextMode && (
          <div className="flex-1 w-full h-full pt-16 sm:pt-18 pb-24 sm:pb-28 px-2 sm:px-4 md:px-6 flex items-center justify-center overflow-hidden">
            
            {/* ── 1. SPOTLIGHT / PINNED MODE ── */}
            {pinnedParticipant ? (
              <div className="w-full h-full max-w-[1600px] flex flex-col md:flex-row gap-2.5 sm:gap-3.5 md:gap-4 overflow-hidden animate-fade-in">
                {/* Main Large Stage */}
                <div className="flex-1 w-full h-full min-h-0 relative flex items-center justify-center">
                  {pinnedParticipant.isLocal ? (
                    <GroupLocalTile
                      localStream={localStream}
                      isVideoEnabled={isVideoEnabled}
                      isAudioEnabled={isAudioEnabled}
                      isLocalSpeaking={isLocalSpeaking}
                      isScreenSharing={isScreenSharing}
                      isHost={isHost}
                      facingMode={facingMode}
                      isPinned={true}
                      onTogglePin={() => handleTogglePin('local')}
                      fitMode={getTileFitMode('local')}
                      onToggleFit={() => toggleTileFit('local')}
                      switchCamera={switchCamera}
                      isSwitchingCamera={isSwitchingCamera}
                    />
                  ) : (
                    <GroupParticipantTile
                      peer={pinnedParticipant.peer}
                      index={pinnedParticipant.index}
                      isCurrentUserHost={isHost}
                      hostId={hostId}
                      onKick={kickPeer}
                      onMute={mutePeer}
                      isPinned={true}
                      onTogglePin={() => handleTogglePin(pinnedParticipant.id)}
                      fitMode={getTileFitMode(pinnedParticipant.id)}
                      onToggleFit={() => toggleTileFit(pinnedParticipant.id)}
                    />
                  )}

                  {/* Return to Grid Floating Badge */}
                  <button
                    onClick={() => setPinnedPeerId(null)}
                    className="absolute top-4 left-4 z-30 bg-black/70 hover:bg-[#003cff] text-[#d8ff00] hover:text-white px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 border border-white/20 shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                  >
                    <LayoutGrid size={14} /> Exit Spotlight (Grid View)
                  </button>
                </div>

                {/* Secondary Filmstrip */}
                {unpinnedParticipants.length > 0 && (
                  <div className="shrink-0 w-full md:w-56 lg:w-68 h-28 sm:h-36 md:h-full flex md:flex-col gap-2 sm:gap-2.5 overflow-x-auto md:overflow-y-auto pb-1 md:pb-0 scrollbar-none">
                    {unpinnedParticipants.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleTogglePin(item.id)}
                        className="shrink-0 w-36 sm:w-44 md:w-full h-full md:h-36 lg:h-44 cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
                        title="Click to spotlight"
                      >
                        {item.isLocal ? (
                          <GroupLocalTile
                            localStream={localStream}
                            isVideoEnabled={isVideoEnabled}
                            isAudioEnabled={isAudioEnabled}
                            isLocalSpeaking={isLocalSpeaking}
                            isScreenSharing={isScreenSharing}
                            isHost={isHost}
                            facingMode={facingMode}
                            isPinned={false}
                            onTogglePin={() => handleTogglePin('local')}
                            fitMode={getTileFitMode('local')}
                            onToggleFit={() => toggleTileFit('local')}
                            isMiniThumbnail={true}
                          />
                        ) : (
                          <GroupParticipantTile
                            peer={item.peer}
                            index={item.index}
                            isCurrentUserHost={isHost}
                            hostId={hostId}
                            onKick={kickPeer}
                            onMute={mutePeer}
                            isPinned={false}
                            onTogglePin={() => handleTogglePin(item.id)}
                            fitMode={getTileFitMode(item.id)}
                            onToggleFit={() => toggleTileFit(item.id)}
                            isMiniThumbnail={true}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ── 2. EQUAL MULTI-PARTY BALANCED GRID ── */
              <div className="w-full h-full max-w-[1600px] flex items-center justify-center overflow-hidden">
                
                {/* ── Case 1 Participant: Searching / Waiting Lobby ── */}
                {totalParticipants === 1 && (
                  <div className="w-full h-full max-w-[960px] max-h-[640px] relative rounded-3xl overflow-hidden shadow-2xl border-2 border-white/15 bg-slate-950">
                    <GroupLocalTile
                      localStream={localStream}
                      isVideoEnabled={isVideoEnabled}
                      isAudioEnabled={isAudioEnabled}
                      isLocalSpeaking={isLocalSpeaking}
                      isScreenSharing={isScreenSharing}
                      isHost={isHost}
                      facingMode={facingMode}
                      fitMode={getTileFitMode('local')}
                      onToggleFit={() => toggleTileFit('local')}
                      switchCamera={switchCamera}
                      isSwitchingCamera={isSwitchingCamera}
                    />

                    {/* Waiting / Matchmaking Overlay */}
                    {(isWaiting || isConnecting) && (
                      <div className="absolute inset-0 z-20 bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                        <div className="relative flex items-center justify-center mb-5">
                          <div className="absolute w-32 h-32 rounded-full bg-[#003cff]/25 animate-ping duration-1000" />
                          <div className="absolute w-24 h-24 rounded-full bg-[#d8ff00]/25 animate-pulse" />
                          <div className="w-16 h-16 bg-gradient-to-tr from-[#003cff] to-[#6366f1] rounded-full flex items-center justify-center shadow-[0_0_24px_rgba(0,60,255,0.6)] border-2 border-[#d8ff00] z-10">
                            <Users size={28} className="text-[#d8ff00] animate-bounce" />
                          </div>
                        </div>

                        <div className="inline-flex items-center gap-2 bg-[#d8ff00]/15 border border-[#d8ff00]/30 text-[#d8ff00] px-3.5 py-1 rounded-full text-xs font-black mb-2">
                          <span className="w-2 h-2 rounded-full bg-[#d8ff00] animate-ping" />
                          <span>Group Room Ready (1/5 Participants)</span>
                        </div>

                        <h2 className="text-white text-xl sm:text-2xl font-extrabold tracking-tight mb-1">
                          Looking for participants…
                        </h2>
                        <p className="text-slate-300 text-xs sm:text-sm max-w-sm mb-4">
                          Waiting for strangers to join your group room ({waitSeconds}s elapsed)
                        </p>

                        {interests.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 justify-center max-w-xs mb-6">
                            {interests.map((tag, idx) => (
                              <span
                                key={idx}
                                className="bg-white/10 text-[#d8ff00] border border-white/20 px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-sm"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <button
                          onClick={onQuit}
                          className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold transition-all active:scale-95 shadow-md cursor-pointer"
                        >
                          Cancel Search
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Case 2 Participants: Stacked on Mobile Portrait, 2 Cols on Desktop/Landscape ── */}
                {totalParticipants === 2 && (
                  <div className="w-full h-full max-w-[1400px] grid grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1 gap-2.5 sm:gap-3.5 md:gap-4">
                    <GroupLocalTile
                      localStream={localStream}
                      isVideoEnabled={isVideoEnabled}
                      isAudioEnabled={isAudioEnabled}
                      isLocalSpeaking={isLocalSpeaking}
                      isScreenSharing={isScreenSharing}
                      isHost={isHost}
                      facingMode={facingMode}
                      onTogglePin={() => handleTogglePin('local')}
                      fitMode={getTileFitMode('local')}
                      onToggleFit={() => toggleTileFit('local')}
                      switchCamera={switchCamera}
                      isSwitchingCamera={isSwitchingCamera}
                    />
                    {peers[0] && (
                      <GroupParticipantTile
                        peer={peers[0]}
                        index={0}
                        isCurrentUserHost={isHost}
                        hostId={hostId}
                        onKick={kickPeer}
                        onMute={mutePeer}
                        onTogglePin={() => handleTogglePin(peers[0].socketId)}
                        fitMode={getTileFitMode(peers[0].socketId)}
                        onToggleFit={() => toggleTileFit(peers[0].socketId)}
                      />
                    )}
                  </div>
                )}

                {/* ── Case 3 Participants: 2 on Row 1, 1 centered on Row 2 (Mobile) | 3 Cols (Desktop/Landscape) ── */}
                {totalParticipants === 3 && (
                  <div className="w-full h-full max-w-[1600px] grid grid-cols-2 md:grid-cols-3 grid-rows-2 md:grid-rows-1 gap-2.5 sm:gap-3.5 md:gap-4">
                    {/* Tile 1 */}
                    <div className="col-span-1 row-span-1 w-full h-full">
                      <GroupLocalTile
                        localStream={localStream}
                        isVideoEnabled={isVideoEnabled}
                        isAudioEnabled={isAudioEnabled}
                        isLocalSpeaking={isLocalSpeaking}
                        isScreenSharing={isScreenSharing}
                        isHost={isHost}
                        facingMode={facingMode}
                        onTogglePin={() => handleTogglePin('local')}
                        fitMode={getTileFitMode('local')}
                        onToggleFit={() => toggleTileFit('local')}
                        switchCamera={switchCamera}
                        isSwitchingCamera={isSwitchingCamera}
                      />
                    </div>

                    {/* Tile 2 */}
                    {peers[0] && (
                      <div className="col-span-1 row-span-1 w-full h-full">
                        <GroupParticipantTile
                          peer={peers[0]}
                          index={0}
                          isCurrentUserHost={isHost}
                          hostId={hostId}
                          onKick={kickPeer}
                          onMute={mutePeer}
                          onTogglePin={() => handleTogglePin(peers[0].socketId)}
                          fitMode={getTileFitMode(peers[0].socketId)}
                          onToggleFit={() => toggleTileFit(peers[0].socketId)}
                        />
                      </div>
                    )}

                    {/* Tile 3 (Centered spanning 2 cols on mobile portrait, 1 col on desktop) */}
                    {peers[1] && (
                      <div className="col-span-2 md:col-span-1 row-span-1 w-full h-full flex justify-center">
                        <div className="w-full md:w-full max-w-[600px] md:max-w-none h-full">
                          <GroupParticipantTile
                            peer={peers[1]}
                            index={1}
                            isCurrentUserHost={isHost}
                            hostId={hostId}
                            onKick={kickPeer}
                            onMute={mutePeer}
                            onTogglePin={() => handleTogglePin(peers[1].socketId)}
                            fitMode={getTileFitMode(peers[1].socketId)}
                            onToggleFit={() => toggleTileFit(peers[1].socketId)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Case 4 Participants: 2x2 Quadrant Grid on all devices ── */}
                {totalParticipants === 4 && (
                  <div className="w-full h-full max-w-[1400px] grid grid-cols-2 grid-rows-2 gap-2.5 sm:gap-3.5 md:gap-4">
                    <GroupLocalTile
                      localStream={localStream}
                      isVideoEnabled={isVideoEnabled}
                      isAudioEnabled={isAudioEnabled}
                      isLocalSpeaking={isLocalSpeaking}
                      isScreenSharing={isScreenSharing}
                      isHost={isHost}
                      facingMode={facingMode}
                      onTogglePin={() => handleTogglePin('local')}
                      fitMode={getTileFitMode('local')}
                      onToggleFit={() => toggleTileFit('local')}
                      switchCamera={switchCamera}
                      isSwitchingCamera={isSwitchingCamera}
                    />
                    {peers.slice(0, 3).map((peer, idx) => (
                      <GroupParticipantTile
                        key={peer.socketId}
                        peer={peer}
                        index={idx}
                        isCurrentUserHost={isHost}
                        hostId={hostId}
                        onKick={kickPeer}
                        onMute={mutePeer}
                        onTogglePin={() => handleTogglePin(peer.socketId)}
                        fitMode={getTileFitMode(peer.socketId)}
                        onToggleFit={() => toggleTileFit(peer.socketId)}
                      />
                    ))}
                  </div>
                )}

                {/* ── Case 5 Participants: Symmetrical 3-Top + 2-Bottom (Desktop) | 2-2-1 (Mobile) ── */}
                {totalParticipants >= 5 && (
                  <div className="w-full h-full max-w-[1600px] grid grid-cols-2 md:grid-cols-6 grid-rows-3 md:grid-rows-2 gap-2 sm:gap-3 md:gap-4">
                    {/* Item 0: Local */}
                    <div className="col-span-1 md:col-span-2 row-span-1 w-full h-full">
                      <GroupLocalTile
                        localStream={localStream}
                        isVideoEnabled={isVideoEnabled}
                        isAudioEnabled={isAudioEnabled}
                        isLocalSpeaking={isLocalSpeaking}
                        isScreenSharing={isScreenSharing}
                        isHost={isHost}
                        facingMode={facingMode}
                        onTogglePin={() => handleTogglePin('local')}
                        fitMode={getTileFitMode('local')}
                        onToggleFit={() => toggleTileFit('local')}
                        switchCamera={switchCamera}
                        isSwitchingCamera={isSwitchingCamera}
                      />
                    </div>

                    {/* Item 1: Peer 0 */}
                    {peers[0] && (
                      <div className="col-span-1 md:col-span-2 row-span-1 w-full h-full">
                        <GroupParticipantTile
                          peer={peers[0]}
                          index={0}
                          isCurrentUserHost={isHost}
                          hostId={hostId}
                          onKick={kickPeer}
                          onMute={mutePeer}
                          onTogglePin={() => handleTogglePin(peers[0].socketId)}
                          fitMode={getTileFitMode(peers[0].socketId)}
                          onToggleFit={() => toggleTileFit(peers[0].socketId)}
                        />
                      </div>
                    )}

                    {/* Item 2: Peer 1 */}
                    {peers[1] && (
                      <div className="col-span-1 md:col-span-2 row-span-1 w-full h-full">
                        <GroupParticipantTile
                          peer={peers[1]}
                          index={1}
                          isCurrentUserHost={isHost}
                          hostId={hostId}
                          onKick={kickPeer}
                          onMute={mutePeer}
                          onTogglePin={() => handleTogglePin(peers[1].socketId)}
                          fitMode={getTileFitMode(peers[1].socketId)}
                          onToggleFit={() => toggleTileFit(peers[1].socketId)}
                        />
                      </div>
                    )}

                    {/* Item 3: Peer 2 (starts at col 2 on desktop to center bottom 2 tiles) */}
                    {peers[2] && (
                      <div className="col-span-1 md:col-start-2 md:col-span-2 row-span-1 w-full h-full">
                        <GroupParticipantTile
                          peer={peers[2]}
                          index={2}
                          isCurrentUserHost={isHost}
                          hostId={hostId}
                          onKick={kickPeer}
                          onMute={mutePeer}
                          onTogglePin={() => handleTogglePin(peers[2].socketId)}
                          fitMode={getTileFitMode(peers[2].socketId)}
                          onToggleFit={() => toggleTileFit(peers[2].socketId)}
                        />
                      </div>
                    )}

                    {/* Item 4: Peer 3 (col 4-5 on desktop, centered col-span-2 on mobile) */}
                    {peers[3] && (
                      <div className="col-span-2 md:col-start-4 md:col-span-2 row-span-1 w-full h-full flex justify-center">
                        <div className="w-full md:w-full max-w-[400px] md:max-w-none h-full">
                          <GroupParticipantTile
                            peer={peers[3]}
                            index={3}
                            isCurrentUserHost={isHost}
                            hostId={hostId}
                            onKick={kickPeer}
                            onMute={mutePeer}
                            onTogglePin={() => handleTogglePin(peers[3].socketId)}
                            fitMode={getTileFitMode(peers[3].socketId)}
                            onToggleFit={() => toggleTileFit(peers[3].socketId)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            CHAT SIDEBAR / DRAWER (Slide-out panel)
           ══════════════════════════════════════════════════════════════ */}
        {(isChatOpen || isTextMode) && (
          <aside
            className={`${
              isTextMode
                ? 'flex-1'
                : 'absolute right-0 top-0 bottom-0 w-full sm:w-[380px] md:w-[420px] shadow-2xl border-l border-white/10'
            } bg-slate-950/95 backdrop-blur-2xl flex flex-col z-50 transition-all duration-300`}
          >
            {/* Chat Drawer Header */}
            <div className="h-14 border-b border-white/10 px-4 flex items-center justify-between bg-slate-900/50">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <MessageCircle size={16} className="text-[#d8ff00]" />
                {mode === 'group' ? 'Group Chat' : 'Conversation'}
              </span>
              {!isTextMode && (
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && (
                <div className="text-center text-slate-500 text-xs my-auto">
                  Say hello to start the conversation!
                </div>
              )}

              {messages.map((msg, idx) => {
                const isMe = msg.senderId === 'me';
                return (
                  <div
                    key={idx}
                    className={`px-3.5 py-2.5 max-w-[85%] text-sm font-medium leading-relaxed ${
                      isMe
                        ? 'self-end bg-[#d8ff00] text-[#003cff] rounded-[18px_4px_18px_18px] shadow-md font-semibold'
                        : 'self-start bg-white/10 text-white rounded-[4px_18px_18px_18px] border border-white/10 shadow-sm'
                    }`}
                  >
                    {!isMe && (
                      <div className="text-[11px] font-extrabold text-[#d8ff00] mb-0.5">
                        {peers.findIndex(p => p.socketId === msg.senderId) !== -1
                          ? `Stranger ${peers.findIndex(p => p.socketId === msg.senderId) + 1}`
                          : 'Stranger'}
                      </div>
                    )}
                    <div>{msg.text}</div>
                    <span
                      className={`block text-[10px] text-right mt-1 font-semibold ${
                        isMe ? 'text-[#003cff]/70' : 'text-slate-400'
                      }`}
                    >
                      {msg.timestamp || 'now'}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />

              {typingUsers.size > 0 && (
                <div className="text-xs font-semibold italic text-[#d8ff00] px-1 animate-pulse">
                  {typingUsers.size === 1 ? 'Someone is typing…' : `${typingUsers.size} people are typing…`}
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 border-t border-white/10 bg-slate-900/50 pb-[max(12px,env(safe-area-inset-bottom))]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2 items-center"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={handleChatInputChange}
                  placeholder="Type a message…"
                  disabled={!isConnected}
                  className="flex-1 bg-white/10 border border-white/20 focus:border-[#d8ff00] rounded-full px-4 py-2.5 text-sm text-white placeholder-slate-400 outline-none transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!isConnected || !chatInput.trim()}
                  className="w-10 h-10 rounded-full bg-[#003cff] hover:bg-[#0030cc] disabled:opacity-40 disabled:hover:bg-[#003cff] text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0 shadow-md"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </aside>
        )}
      </div>

      {/* ── FLOATING BOTTOM CONTROLS DOCK ── */}
      {!isTextMode && (
        <footer className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-16px)]">
          <div className="bg-slate-950/85 backdrop-blur-2xl border border-white/15 px-3 sm:px-5 py-2 sm:py-3 rounded-full flex items-center gap-2 sm:gap-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] overflow-x-auto scrollbar-none">
            
            {/* Toggle Microphone */}
            <button
              aria-label="Toggle Microphone"
              title={isAudioEnabled ? "Mute Microphone" : "Unmute Microphone"}
              onClick={toggleAudio}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0 ${
                !isAudioEnabled
                  ? 'bg-red-500/25 border-red-500 text-red-400 hover:bg-red-500/35'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {!isAudioEnabled ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            {/* Toggle Camera */}
            <button
              aria-label="Toggle Camera"
              title={isVideoEnabled ? "Turn Off Camera" : "Turn On Camera"}
              onClick={toggleVideo}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0 ${
                !isVideoEnabled
                  ? 'bg-red-500/25 border-red-500 text-red-400 hover:bg-red-500/35'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {!isVideoEnabled ? <VideoOff size={18} /> : <Video size={18} />}
            </button>

            {/* Switch Camera (Rear <-> Front) */}
            <button
              aria-label="Switch Camera"
              title={
                !isVideoEnabled
                  ? "Turn on camera to switch"
                  : facingMode === 'user'
                  ? "Switch to Rear Camera"
                  : "Switch to Front Camera"
              }
              onClick={switchCamera}
              disabled={!isVideoEnabled || isScreenSharing || isSwitchingCamera}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0 disabled:opacity-40 disabled:hover:scale-100 ${
                facingMode === 'environment'
                  ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00] shadow-[0_0_16px_rgba(0,60,255,0.6)]'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              } ${isSwitchingCamera ? 'animate-spin' : ''}`}
            >
              <SwitchCamera size={18} />
            </button>

            {/* Flip / Swap Views (1-on-1 mode only) */}
            {is1on1Video && isConnected && (
              <button
                aria-label="Swap View"
                title="Swap Main & PiP Camera"
                onClick={toggleSwap}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0 ${
                  isSwapped
                    ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00]'
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
              >
                <ArrowLeftRight size={18} />
              </button>
            )}

            {/* Fit / Fill Toggle Button (Group Mode) */}
            {mode === 'group' && (
              <button
                aria-label="Toggle Fit Mode"
                title={globalFitMode === 'contain' ? "Zoom to fill all tiles" : "Fit all feeds to show full view (No crop)"}
                onClick={toggleGlobalFit}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0 ${
                  globalFitMode === 'contain'
                    ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00]'
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
              >
                {globalFitMode === 'contain' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            )}

            {/* Screen Share */}
            <button
              aria-label="Toggle Screen Share"
              title="Share Screen"
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0 ${
                isScreenSharing
                  ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00] shadow-[0_0_16px_rgba(0,60,255,0.6)]'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
            </button>

            {/* Chat Drawer Toggle */}
            <button
              aria-label="Toggle Chat Drawer"
              title="Open Chat"
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border relative flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0 ${
                isChatOpen
                  ? 'bg-[#003cff] border-[#003cff] text-white'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <MessageCircle size={18} />
              {unreadCount > 0 && !isChatOpen && (
                <span className="absolute -top-1 -right-1 bg-[#d8ff00] text-[#003cff] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Skip Stranger */}
            <button
              aria-label="Skip to Next Stranger"
              title="Next Stranger"
              onClick={findStranger}
              className="w-11 sm:w-13 h-10 sm:h-12 rounded-full bg-[#d8ff00] hover:bg-[#ccee00] text-[#003cff] font-extrabold flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-[0_4px_16px_rgba(216,255,0,0.4)] cursor-pointer shrink-0"
            >
              <SkipForward size={20} />
            </button>

            {/* End Call / Leave */}
            <button
              aria-label="Leave Call"
              title="End Call"
              onClick={onQuit}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-[0_4px_16px_rgba(239,68,68,0.4)] cursor-pointer shrink-0"
            >
              <LogOut size={19} />
            </button>
          </div>
        </footer>
      )}

      {/* ── DISCONNECTED OVERLAY (1-on-1 Mode) ── */}
      {isDisconnected && mode !== 'group' && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900/90 border border-white/20 rounded-3xl p-8 flex flex-col items-center gap-5 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center text-red-400">
              <LogOut size={28} />
            </div>
            <div>
              <h3 className="text-white text-xl font-black mb-1">Stranger Disconnected</h3>
              <p className="text-slate-400 text-xs sm:text-sm">The call has ended. Ready to meet someone new?</p>
            </div>
            <div className="w-full flex flex-col gap-2.5 mt-2">
              <button
                onClick={findStranger}
                className="w-full h-12 rounded-full bg-[#d8ff00] hover:bg-[#ccee00] text-[#003cff] font-black text-sm shadow-[0_4px_16px_rgba(216,255,0,0.3)] transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <SkipForward size={18} /> Find New Stranger
              </button>
              <button
                onClick={onQuit}
                className="w-full h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/15 transition-colors cursor-pointer"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEVICE PERMISSION ERROR OVERLAY ── */}
      {isError && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-[70] text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4 text-2xl font-bold border border-red-500/30">
            !
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Device Permission Error</h2>
          <p className="text-slate-300 text-sm max-w-sm mb-6 leading-relaxed">
            {errorMessage || 'Unable to access your camera or microphone. Please check your browser permissions.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={retryInit}
              className="h-11 px-6 rounded-full bg-[#d8ff00] text-[#003cff] font-bold text-sm cursor-pointer hover:bg-[#ccee00] transition-transform hover:scale-105"
            >
              Try Again
            </button>
            <button
              onClick={onQuit}
              className="h-11 px-6 rounded-full bg-white/10 text-white font-semibold text-sm border border-white/20 cursor-pointer hover:bg-white/20"
            >
              Go Home
            </button>
          </div>
        </div>
      )}

      {/* ── REPORT MODAL ── */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-white/20 p-6 rounded-3xl w-full max-w-[400px] shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Flag size={18} className="text-red-400" /> Report User
            </h3>
            <p className="text-xs text-slate-400 mb-4">Please describe why you are reporting this user.</p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="w-full h-24 p-3 border border-white/15 rounded-xl mb-4 text-sm text-white bg-slate-800/80 outline-none focus:border-[#d8ff00] resize-none"
              placeholder="Inappropriate behavior, harassment, or violation of community guidelines…"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  submitReport(reportText);
                  setReportText('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-md cursor-pointer"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default VideoChat;
