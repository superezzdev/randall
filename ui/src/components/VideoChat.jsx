import React, { useState, useRef, useEffect } from 'react';
import { useVideoChat } from '../hooks/useVideoChat.js';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  SkipForward, LogOut, Flag, MessageCircle, X, Send, Search,
  Crown, UserX, Users
} from 'lucide-react';
import { useVisualViewport } from '../hooks/useVisualViewport.js';

/**
 * Remote Participant Video Tile
 */
const RemoteParticipantTile = ({ peer, index, isCurrentUserHost, hostId, onKick, onMute }) => {
  const videoRef = useRef(null);
  const isPeerHost = peer.socketId === hostId;

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
      videoRef.current.play().catch(e => console.warn("Remote stream play error:", e));
    }
  }, [peer.stream]);

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center border-2 transition-all duration-200 shadow-lg ${
        peer.isSpeaking ? 'border-[#4ade80] shadow-[0_0_16px_rgba(74,222,128,0.4)]' : 'border-white/10'
      }`}
    >
      {/* Video Stream */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className={`w-full h-full object-cover ${peer.isVideoEnabled ? 'block' : 'hidden'}`}
      />

      {/* Camera Off Avatar Fallback */}
      {!peer.isVideoEnabled && (
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#003cff] text-[#d8ff00] font-black text-2xl md:text-3xl flex items-center justify-center shadow-md">
            S{index + 1}
          </div>
          <span className="text-xs md:text-sm font-semibold text-slate-300">Camera Off</span>
        </div>
      )}

      {/* Top Overlay: Name Badge & Host Badge */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 shadow-sm">
          <span>Stranger {index + 1}</span>
          {isPeerHost && (
            <span className="flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-1.5 py-0.5 rounded-full text-[10px] font-black">
              <Crown size={10} /> Host
            </span>
          )}
        </div>
      </div>

      {/* Top Right: Host Controls (if current user is room host) */}
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

      {/* Bottom Overlay: Status Icons (Mic / Screen Share) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
        {peer.isScreenSharing && (
          <div className="p-1 rounded-full bg-[#003cff] text-white text-xs shadow-md">
            <Monitor size={14} />
          </div>
        )}
        {!peer.isAudioEnabled && (
          <div className="p-1 rounded-full bg-red-500/80 text-white text-xs shadow-md backdrop-blur-sm">
            <MicOff size={14} />
          </div>
        )}
      </div>
    </div>
  );
};

const VideoChat = ({ onQuit, interests = [], mode = 'video' }) => {
  const {
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
  } = useVideoChat(interests, mode);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);

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

  const totalParticipants = 1 + peers.length;

  // Compute dynamic grid layout class based on number of participants
  const getGridLayoutClass = () => {
    if (totalParticipants === 1) return 'grid-cols-1 grid-rows-1';
    if (totalParticipants === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1';
    if (totalParticipants === 3) return 'grid-cols-1 md:grid-cols-3 grid-rows-3 md:grid-rows-1';
    if (totalParticipants === 4) return 'grid-cols-2 grid-rows-2';
    return 'grid-cols-2 md:grid-cols-3 grid-rows-3 md:grid-rows-2';
  };

  return (
    <main className="fixed inset-0 bg-[#070b14] text-white flex flex-col font-['Inter',system-ui,sans-serif] overflow-hidden select-none">
      
      {/* ── TOP HEADER ── */}
      <header className="h-[56px] shrink-0 border-b border-white/10 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 z-40">
        {/* Left: Mode & Participant Count */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 text-xs font-bold">
            <Users size={14} className="text-[#d8ff00]" />
            <span>
              {mode === 'group' ? `Group Call (${totalParticipants}/5)` : isTextMode ? '1-on-1 Text' : '1-on-1 Video'}
            </span>
          </div>

          {isConnected && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Connected
            </div>
          )}

          {isHost && mode === 'group' && (
            <div className="flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-2.5 py-1 rounded-full text-xs font-black shadow-sm">
              <Crown size={12} /> You are Room Host
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Chat Toggle Button */}
          <button
            aria-label="Toggle Chat"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`relative p-2 rounded-full border transition-colors ${
              isChatOpen ? 'bg-[#003cff] border-[#003cff] text-white' : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
            }`}
          >
            <MessageCircle size={18} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-[#d8ff00] text-[#003cff] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Report Button */}
          <button
            aria-label="Report User"
            onClick={() => setShowReportModal(true)}
            className="p-2 text-white/70 hover:text-red-400 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            <Flag size={18} />
          </button>

          {/* Skip / Next Stranger */}
          <button
            aria-label="Skip to next stranger"
            onClick={findStranger}
            className="px-3.5 py-1.5 bg-[#d8ff00] text-[#003cff] font-extrabold rounded-full text-xs sm:text-sm flex items-center gap-1.5 hover:bg-[#ccee00] transition-transform active:scale-95 shadow-sm"
          >
            <SkipForward size={16} /> Skip
          </button>

          {/* Quit Button */}
          <button
            aria-label="Quit Chat"
            onClick={onQuit}
            className="p-2 text-white/70 hover:text-red-400 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ── TOAST MESSAGE ── */}
      {toastMessage && (
        <div className="absolute top-[68px] left-1/2 -translate-x-1/2 bg-[#d8ff00] text-[#003cff] px-5 py-2 rounded-full shadow-[0_4px_20px_rgba(216,255,0,0.4)] z-[100] flex items-center gap-2 text-xs sm:text-sm font-extrabold animate-[slide-down_0.2s_ease-out] whitespace-nowrap">
          {toastMessage}
          {commonInterests.length > 0 && commonInterests.map((interest, i) => (
            <span key={i} className="bg-[#003cff] text-white px-2 py-0.5 rounded-full text-xs font-semibold">
              {interest}
            </span>
          ))}
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 relative flex overflow-hidden">
        
        {/* VIDEO GRID (when not text-only mode) */}
        {!isTextMode && (
          <div className="flex-1 p-3 md:p-4 flex items-center justify-center overflow-hidden">
            <div className={`w-full h-full max-w-[1400px] grid ${getGridLayoutClass()} gap-3 md:gap-4`}>
              
              {/* Local User Tile */}
              <div
                className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center border-2 transition-all duration-200 shadow-lg ${
                  isLocalSpeaking ? 'border-[#4ade80] shadow-[0_0_16px_rgba(74,222,128,0.4)]' : 'border-white/10'
                }`}
              >
                <video
                  ref={localVideoRef}
                  playsInline
                  autoPlay
                  muted
                  className={`w-full h-full object-cover scale-x-[-1] ${isVideoEnabled ? 'block' : 'hidden'}`}
                />

                {!isVideoEnabled && (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#d8ff00] text-[#003cff] font-black text-2xl md:text-3xl flex items-center justify-center shadow-md">
                      You
                    </div>
                    <span className="text-xs md:text-sm font-semibold text-slate-300">Camera Off</span>
                  </div>
                )}

                {/* Local Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                  <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 shadow-sm">
                    <span>You</span>
                    {isHost && mode === 'group' && (
                      <span className="flex items-center gap-1 bg-[#d8ff00] text-[#003cff] px-1.5 py-0.5 rounded-full text-[10px] font-black">
                        <Crown size={10} /> Host
                      </span>
                    )}
                  </div>
                </div>

                {/* Local Media Indicators */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
                  {isScreenSharing && (
                    <div className="p-1 rounded-full bg-[#003cff] text-white text-xs shadow-md">
                      <Monitor size={14} />
                    </div>
                  )}
                  {!isAudioEnabled && (
                    <div className="p-1 rounded-full bg-red-500/80 text-white text-xs shadow-md backdrop-blur-sm">
                      <MicOff size={14} />
                    </div>
                  )}
                </div>
              </div>

              {/* Remote Participant Tiles */}
              {peers.map((peer, idx) => (
                <RemoteParticipantTile
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

        {/* ── CHAT DRAWER / SIDEBAR (or full view in text mode) ── */}
        {(isChatOpen || isTextMode) && (
          <aside className={`${isTextMode ? 'flex-1' : 'w-full sm:w-[360px] md:w-[400px] border-l border-white/10'} bg-slate-950/95 backdrop-blur-xl flex flex-col z-30 transition-all duration-200`}>
            
            {/* Chat Header */}
            <div className="h-12 border-b border-white/10 px-4 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                {mode === 'group' ? 'Group Chat' : 'Conversation'}
              </span>
              {!isTextMode && (
                <button onClick={() => setIsChatOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-full">
                  <X size={16} />
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
                        ? 'self-end bg-[#d8ff00] text-[#003cff] rounded-[18px_4px_18px_18px] shadow-sm'
                        : 'self-start bg-white/10 text-white rounded-[4px_18px_18px_18px] border border-white/10'
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
                    <span className={`block text-[10px] text-right mt-1 font-semibold ${isMe ? 'text-[#003cff]/60' : 'text-slate-400'}`}>
                      {msg.timestamp || 'now'}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
              
              {typingUsers.size > 0 && (
                <div className="text-xs font-semibold italic text-[#d8ff00] px-1">
                  {typingUsers.size === 1 ? 'Someone is typing…' : `${typingUsers.size} people are typing…`}
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-3 border-t border-white/10 pb-[max(12px,env(safe-area-inset-bottom))]">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-center">
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
                  className="w-10 h-10 rounded-full bg-[#003cff] hover:bg-[#0030cc] disabled:opacity-40 disabled:hover:bg-[#003cff] text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </aside>
        )}
      </div>

      {/* ── BOTTOM CONTROL BAR (for Video/Group Modes) ── */}
      {!isTextMode && (
        <footer className="h-[76px] shrink-0 border-t border-white/10 bg-slate-950/90 backdrop-blur-md flex items-center justify-center gap-3 sm:gap-4 px-4 z-40">
          
          {/* Toggle Microphone */}
          <button
            aria-label="Toggle Microphone"
            onClick={toggleAudio}
            className={`w-12 h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${
              !isAudioEnabled
                ? 'bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            {!isAudioEnabled ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Toggle Camera */}
          <button
            aria-label="Toggle Camera"
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${
              !isVideoEnabled
                ? 'bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            {!isVideoEnabled ? <VideoOff size={20} /> : <Video size={20} />}
          </button>

          {/* Toggle Screen Share */}
          <button
            aria-label="Toggle Screen Share"
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            className={`w-12 h-12 rounded-full border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${
              isScreenSharing
                ? 'bg-[#003cff] border-[#003cff] text-[#d8ff00] shadow-[0_0_16px_rgba(0,60,255,0.6)]'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
          </button>

          {/* Toggle Chat in Bottom Bar */}
          <button
            aria-label="Toggle Chat"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`w-12 h-12 rounded-full border relative flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${
              isChatOpen
                ? 'bg-[#003cff] border-[#003cff] text-white'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            <MessageCircle size={20} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-[#d8ff00] text-[#003cff] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Skip / Next Stranger */}
          <button
            aria-label="Skip Room"
            onClick={findStranger}
            className="w-14 h-12 rounded-full bg-[#d8ff00] text-[#003cff] font-extrabold flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-[0_4px_16px_rgba(216,255,0,0.3)]"
          >
            <SkipForward size={22} />
          </button>

          {/* Leave / Quit */}
          <button
            aria-label="Quit Chat"
            onClick={onQuit}
            className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          >
            <LogOut size={20} />
          </button>
        </footer>
      )}

      {/* ── SEARCHING / MATCHMAKING OVERLAY ── */}
      {(isWaiting || isConnecting) && (
        <div className="absolute inset-0 bg-[#003cff] flex flex-col items-center justify-center z-[60]">
          <div className="w-20 h-20 bg-[#d8ff00] rounded-full animate-[pulse-g_1.5s_infinite_ease-in-out] flex items-center justify-center shadow-[0_0_0_0_rgba(216,255,0,0.5)]">
            <Search size={32} color="#003cff" strokeWidth={2.5} />
          </div>
          <div className="text-white font-['Inter',system-ui,sans-serif] text-2xl font-bold mt-8 text-center px-4">
            {isConnecting
              ? 'Connecting mesh video streams...'
              : mode === 'group'
              ? 'Finding a group room...'
              : 'Looking for a stranger...'}
          </div>
          <div className="text-white/80 text-[15px] font-medium mt-2">
            {isConnecting ? 'Synchronizing participants…' : `Searching for ${waitSeconds}s...`}
          </div>
          <button
            onClick={onQuit}
            className="bg-transparent border border-white/30 text-white hover:bg-white/10 rounded-full px-8 py-2.5 text-sm font-bold mt-10 cursor-pointer transition-all duration-200"
          >
            Cancel Search
          </button>
        </div>
      )}

      {/* ── DISCONNECTED OVERLAY (1-on-1 Mode) ── */}
      {isDisconnected && mode !== 'group' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-8 flex flex-col items-center gap-5 max-w-sm w-full text-center shadow-2xl">
            <div className="text-white text-xl font-black">Stranger disconnected</div>
            <p className="text-slate-400 text-xs">Ready to meet someone new?</p>
            <button
              onClick={findStranger}
              className="w-full h-12 rounded-full bg-[#d8ff00] text-[#003cff] font-extrabold text-sm shadow-md transition-transform hover:scale-105"
            >
              Find new stranger
            </button>
            <button
              onClick={onQuit}
              className="w-full h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/10 transition-colors"
            >
              Go home
            </button>
          </div>
        </div>
      )}

      {/* ── ERROR OVERLAY ── */}
      {isError && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-[70] text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4 text-2xl font-bold">
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
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 p-6 rounded-2xl w-full max-w-[400px] shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Report User</h3>
            <p className="text-xs text-slate-400 mb-4">Please describe why you are reporting this user.</p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="w-full h-24 p-3 border border-white/10 rounded-xl mb-4 text-sm text-white bg-slate-800 outline-none focus:border-[#d8ff00] resize-none"
              placeholder="Inappropriate behavior or violation of community guidelines..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { submitReport(reportText); setReportText(''); }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors"
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
