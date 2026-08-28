import React, { useState, useRef, useEffect } from 'react';
import { useVideoChat } from '../hooks/useVideoChat.js';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  SkipForward, LogOut, Flag, MessageCircle, X, Send, Search,
  Crown, UserX, Users, ArrowLeftRight, Move, Sparkles, SwitchCamera
} from 'lucide-react';
import { useVisualViewport } from '../hooks/useVisualViewport.js';

/**
 * Reusable Video Stream Player
 * Safely attaches MediaStream to a video element with fallback avatar and status badges.
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

  return (
    <div className={`relative w-full h-full overflow-hidden flex items-center justify-center bg-slate-950 select-none ${className}`}>
      {/* Video Element */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={muted}
        className={`w-full h-full object-cover transition-transform duration-300 ${
          mirrored ? 'scale-x-[-1]' : ''
        } ${videoEnabled && stream ? 'block' : 'hidden'}`}
      />

      {/* Fallback Avatar when camera is off or stream missing */}
      {(!videoEnabled || !stream) && (
        <div className="flex flex-col items-center justify-center gap-3 p-4 text-center select-none animate-fade-in z-10">
          <div
            className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-tr from-[#003cff] to-[#6366f1] text-[#d8ff00] font-black text-3xl sm:text-4xl flex items-center justify-center shadow-2xl border-2 border-white/20 transition-all duration-300 ${
              isSpeaking ? 'ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-950 scale-105' : ''
            }`}
          >
            {fallbackLabel.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-1.5">
              {fallbackLabel}
              {isHost && (
                <span className="flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-1.5 py-0.5 rounded-full text-[10px] font-black">
                  <Crown size={10} /> Host
                </span>
              )}
            </span>
            <span className="text-xs text-slate-400 font-medium">{fallbackSubtext}</span>
          </div>
        </div>
      )}

      {/* Top Name Badge */}
      {badgeText && (
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 shadow-sm border border-white/10">
            <span>{badgeText}</span>
            {isHost && (
              <span className="flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-1.5 py-0.5 rounded-full text-[10px] font-black">
                <Crown size={10} /> Host
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom Media Badges (Mic off / Screen share) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10 pointer-events-none">
        {isScreenSharing && (
          <div className="p-1.5 rounded-full bg-[#003cff] text-white text-xs shadow-md border border-white/10">
            <Monitor size={14} />
          </div>
        )}
        {!isAudioEnabled && (
          <div className="p-1.5 rounded-full bg-red-500/90 text-white text-xs shadow-md backdrop-blur-sm border border-red-400/30">
            <MicOff size={14} />
          </div>
        )}
      </div>

      {children}
    </div>
  );
};

/**
 * Group Participant Tile
 */
const GroupParticipantTile = ({ peer, index, isCurrentUserHost, hostId, onKick, onMute }) => {
  const isPeerHost = peer.socketId === hostId;

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center border-2 transition-all duration-200 shadow-lg ${
        peer.isSpeaking ? 'border-[#4ade80] shadow-[0_0_16px_rgba(74,222,128,0.4)]' : 'border-white/10'
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
      >
        {/* Host Controls */}
        {isCurrentUserHost && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            <button
              title="Mute participant"
              onClick={() => onMute(peer.socketId)}
              className="p-1.5 rounded-full bg-black/60 hover:bg-yellow-500 text-white hover:text-black transition-colors backdrop-blur-md"
            >
              <MicOff size={14} />
            </button>
            <button
              title="Kick participant"
              onClick={() => onKick(peer.socketId)}
              className="p-1.5 rounded-full bg-black/60 hover:bg-red-500 text-white transition-colors backdrop-blur-md"
            >
              <UserX size={14} />
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

  // WhatsApp PiP state: view swapping and corner positioning
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

  // Toggle swap between Main Stage and PiP
  const toggleSwap = () => {
    if (peers.length > 0) {
      setIsSwapped(prev => !prev);
    }
  };

  // Cycle PiP position through 4 corners
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

  // Dynamic grid class for group calls
  const getGroupGridLayoutClass = () => {
    if (totalParticipants <= 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1';
    if (totalParticipants === 3) return 'grid-cols-1 md:grid-cols-3 grid-rows-3 md:grid-rows-1';
    if (totalParticipants === 4) return 'grid-cols-2 grid-rows-2';
    return 'grid-cols-2 md:grid-cols-3 grid-rows-3 md:grid-rows-2';
  };

  return (
    <main className="fixed inset-0 bg-[#070b14] text-white flex flex-col font-['Inter',system-ui,sans-serif] overflow-hidden select-none">
      
      {/* ── TOP FLOATING WHATSAPP-STYLE HEADER ── */}
      <header className="absolute top-0 left-0 right-0 h-[64px] bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between px-4 sm:px-6 z-40 backdrop-blur-[2px]">
        {/* Left: Mode, Status & Call Duration */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 text-xs font-bold shadow-md">
            <Users size={14} className="text-[#d8ff00]" />
            <span>
              {mode === 'group'
                ? `Group Call (${totalParticipants}/5)`
                : isTextMode
                ? '1-on-1 Text'
                : '1-on-1 Video'}
            </span>
          </div>

          {isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-500/15 backdrop-blur-md px-3 py-1.5 rounded-full border border-green-500/30 shadow-md">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
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
          <div className="hidden md:flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/15 px-3 py-1 rounded-full text-xs">
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
        <div className="flex items-center gap-2">
          {/* Chat Toggle */}
          <button
            aria-label="Toggle Chat"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`relative p-2 rounded-full border backdrop-blur-md transition-transform hover:scale-105 active:scale-95 shadow-md ${
              isChatOpen
                ? 'bg-[#003cff] border-[#003cff] text-white'
                : 'bg-black/40 border-white/15 text-white hover:bg-white/20'
            }`}
          >
            <MessageCircle size={18} />
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
            className="p-2 text-white/80 hover:text-red-400 rounded-full bg-black/40 hover:bg-red-500/20 border border-white/15 transition-all backdrop-blur-md shadow-md"
          >
            <Flag size={18} />
          </button>

          {/* Skip / Next */}
          <button
            aria-label="Skip to next stranger"
            onClick={findStranger}
            className="px-3.5 py-1.5 bg-[#d8ff00] hover:bg-[#ccee00] text-[#003cff] font-black rounded-full text-xs sm:text-sm flex items-center gap-1.5 transition-transform hover:scale-105 active:scale-95 shadow-md"
          >
            <SkipForward size={16} /> <span className="hidden sm:inline">Skip</span>
          </button>

          {/* Quit Button */}
          <button
            aria-label="Quit Chat"
            title="Exit Call"
            onClick={onQuit}
            className="p-2 text-white/80 hover:text-red-400 rounded-full bg-black/40 hover:bg-white/20 border border-white/15 transition-all backdrop-blur-md shadow-md"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ── TOAST NOTIFICATION ── */}
      {toastMessage && (
        <div className="absolute top-[72px] left-1/2 -translate-x-1/2 bg-[#d8ff00] text-[#003cff] px-5 py-2 rounded-full shadow-[0_4px_24px_rgba(216,255,0,0.5)] z-[100] flex items-center gap-2 text-xs sm:text-sm font-black animate-[slide-down_0.2s_ease-out] whitespace-nowrap">
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
                // Default: Remote video on main stage (or local video during search/pre-call)
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
                  />
                ) : (
                  // Pre-call / Searching: Local camera preview on main stage
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
                  />
                )
              ) : (
                // Swapped: Local camera enlarged on main stage
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
                  // Default PiP: Local Camera
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
                  />
                ) : (
                  // Swapped PiP: Remote Stranger
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
                  />
                )}

                {/* PiP Hover / Action Overlays */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-between p-2 pointer-events-none">
                  {/* Top Action Buttons */}
                  <div className="w-full flex items-center justify-between pointer-events-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        switchCamera();
                      }}
                      title={facingMode === 'user' ? "Switch to rear camera" : "Switch to front camera"}
                      disabled={!isVideoEnabled || isScreenSharing || isSwitchingCamera}
                      className="p-1.5 rounded-full bg-black/70 text-white hover:text-[#d8ff00] transition-colors disabled:opacity-40"
                    >
                      <SwitchCamera size={12} className={isSwitchingCamera ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={cyclePipPosition}
                      title="Move PiP corner"
                      className="p-1.5 rounded-full bg-black/70 text-white hover:text-[#d8ff00] transition-colors"
                    >
                      <Move size={12} />
                    </button>
                  </div>

                  {/* Swap Affordance */}
                  <div className="bg-black/70 backdrop-blur-md text-[#d8ff00] text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 border border-white/10 shadow-lg">
                    <ArrowLeftRight size={10} /> Tap to Swap
                  </div>
                  <div className="h-2"></div>
                </div>
              </div>
            )}

            {/* 3. SEARCHING / MATCHMAKING RADAR OVERLAY */}
            {(isWaiting || isConnecting) && (
              <div className="absolute inset-0 z-20 bg-slate-950/60 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="relative flex items-center justify-center mb-6">
                  {/* Concentric radar pulses */}
                  <div className="absolute w-36 h-36 rounded-full bg-[#003cff]/20 animate-ping duration-1000"></div>
                  <div className="absolute w-28 h-28 rounded-full bg-[#d8ff00]/20 animate-pulse"></div>
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
                  className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs sm:text-sm font-bold transition-all active:scale-95 shadow-md"
                >
                  Cancel Search
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            GROUP CALL LAYOUT (Responsive dynamic multi-party grid)
           ══════════════════════════════════════════════════════════════ */}
        {mode === 'group' && !isTextMode && (
          <div className="flex-1 p-3 md:p-4 flex items-center justify-center overflow-hidden">
            <div className={`w-full h-full max-w-[1400px] grid ${getGroupGridLayoutClass()} gap-3 md:gap-4`}>
              {/* Local Tile */}
              <div
                className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center border-2 transition-all duration-200 shadow-lg ${
                  isLocalSpeaking ? 'border-[#4ade80] shadow-[0_0_16px_rgba(74,222,128,0.4)]' : 'border-white/10'
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
                />
              </div>

              {/* Remote Participants */}
              {peers.map((peer, idx) => (
                <GroupParticipantTile
                  key={peer.socketId}
                  peer={peer}
                  index={idx}
                  isCurrentUserHost={isHost}
                  hostId={hostId}
                  onKick={kickPeer}
                  onMute={mutePeer}
                />
              ))}
            </div>
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
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
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

      {/* ── FLOATING BOTTOM CONTROLS DOCK (WhatsApp Style) ── */}
      {!isTextMode && (
        <footer className="absolute bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-slate-950/80 backdrop-blur-xl border border-white/15 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full flex items-center gap-3 sm:gap-4 shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
            
            {/* Toggle Microphone */}
            <button
              aria-label="Toggle Microphone"
              title={isAudioEnabled ? "Mute Microphone" : "Unmute Microphone"}
              onClick={toggleAudio}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md ${
                !isAudioEnabled
                  ? 'bg-red-500/25 border-red-500 text-red-400 hover:bg-red-500/35'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {!isAudioEnabled ? <MicOff size={19} /> : <Mic size={19} />}
            </button>

            {/* Toggle Camera */}
            <button
              aria-label="Toggle Camera"
              title={isVideoEnabled ? "Turn Off Camera" : "Turn On Camera"}
              onClick={toggleVideo}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md ${
                !isVideoEnabled
                  ? 'bg-red-500/25 border-red-500 text-red-400 hover:bg-red-500/35'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {!isVideoEnabled ? <VideoOff size={19} /> : <Video size={19} />}
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
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md disabled:opacity-40 disabled:hover:scale-100 ${
                facingMode === 'environment'
                  ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00] shadow-[0_0_16px_rgba(0,60,255,0.6)]'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              } ${isSwitchingCamera ? 'animate-spin' : ''}`}
            >
              <SwitchCamera size={19} />
            </button>

            {/* Flip / Swap Views (1-on-1 mode only) */}
            {is1on1Video && isConnected && (
              <button
                aria-label="Swap View"
                title="Swap Main & PiP Camera"
                onClick={toggleSwap}
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md ${
                  isSwapped
                    ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00]'
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
              >
                <ArrowLeftRight size={19} />
              </button>
            )}

            {/* Screen Share */}
            <button
              aria-label="Toggle Screen Share"
              title="Share Screen"
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md ${
                isScreenSharing
                  ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00] shadow-[0_0_16px_rgba(0,60,255,0.6)]'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {isScreenSharing ? <MonitorOff size={19} /> : <Monitor size={19} />}
            </button>

            {/* Chat Drawer Toggle */}
            <button
              aria-label="Toggle Chat Drawer"
              title="Open Chat"
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border relative flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md ${
                isChatOpen
                  ? 'bg-[#003cff] border-[#003cff] text-white'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <MessageCircle size={19} />
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
              className="w-13 sm:w-14 h-11 sm:h-12 rounded-full bg-[#d8ff00] hover:bg-[#ccee00] text-[#003cff] font-extrabold flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-[0_4px_16px_rgba(216,255,0,0.4)]"
            >
              <SkipForward size={22} />
            </button>

            {/* End Call / Leave */}
            <button
              aria-label="Leave Call"
              title="End Call"
              onClick={onQuit}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-[0_4px_16px_rgba(239,68,68,0.4)]"
            >
              <LogOut size={20} />
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
                className="w-full h-12 rounded-full bg-[#d8ff00] hover:bg-[#ccee00] text-[#003cff] font-black text-sm shadow-[0_4px_16px_rgba(216,255,0,0.3)] transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
              >
                <SkipForward size={18} /> Find New Stranger
              </button>
              <button
                onClick={onQuit}
                className="w-full h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/15 transition-colors"
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
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  submitReport(reportText);
                  setReportText('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-md"
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
