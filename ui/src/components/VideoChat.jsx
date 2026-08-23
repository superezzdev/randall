import React, { useState, useRef, useEffect } from 'react';
import { useVideoChat } from '../hooks/useVideoChat.js';
import { Mic, MicOff, Video, VideoOff, SkipForward, LogOut, Flag, MessageCircle, X, Send, Search } from 'lucide-react';
import { useDraggable } from '../hooks/useDraggable.js';
import { useVisualViewport } from '../hooks/useVisualViewport.js';

const VideoChat = ({ onQuit, interests = [], mode = 'video', question = '' }) => {
  const {
    localVideoRef, remoteVideoRef, messagesEndRef,
    status, isVideoEnabled, isAudioEnabled, messages, chatInput,
    isStrangerTyping, commonInterests, userCount, showReportModal, setShowReportModal,
    spyState, remoteVideoEnabled, remoteAudioEnabled, toastMessage,
    toggleVideo, toggleAudio, handleChatInputChange, sendMessage, submitReport, findStranger
  } = useVideoChat(interests, mode, question);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);

  const prevMessagesLength = useRef(messages.length);
  
  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
    } else if (messages.length > prevMessagesLength.current) {
      const newMessages = messages.slice(prevMessagesLength.current);
      const newReceived = newMessages.filter(m => m.sender !== 'me' && m.sender !== 'system').length;
      if (newReceived > 0) {
         setUnreadCount(prev => prev + newReceived);
      }
    }
    prevMessagesLength.current = messages.length;
    // Auto-scroll to latest message
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen, messagesEndRef]);


  const messageTimestamps = useRef(new WeakMap());
  const getTimestamp = (msg) => {
    if (!messageTimestamps.current.has(msg)) {
      messageTimestamps.current.set(msg, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
    return messageTimestamps.current.get(msg);
  };

  const { containerRef: localContainerRef, onMouseDown } = useDraggable();

  useVisualViewport();


  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const isWaiting = status === 'idle' || status === 'searching' || status === 'waiting';
  const isDisconnected = status === 'disconnected';
  const isTextMode = mode === 'text';

  useEffect(() => {
    let interval;
    if (isWaiting) {
      interval = setInterval(() => {
        setWaitSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setWaitSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isWaiting]);

  return (
    <main className={`fixed inset-0 ${isTextMode ? 'bg-white' : 'bg-black'} flex flex-col font-['Inter',system-ui,sans-serif] overflow-hidden`}>
      
      {isTextMode && (
        <header className="h-[60px] shrink-0 border-b border-slate-100 flex items-center justify-between px-5 bg-white z-40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#d8ff00] flex items-center justify-center text-[#003cff] font-extrabold text-sm">S</div>
            <div className="text-slate-900 font-bold">Stranger</div>
            {isConnected && <div className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.5)]"></div>}
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Report User" onClick={() => setShowReportModal(true)} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-50 transition-colors">
              <Flag size={18} />
            </button>
            <button aria-label="Quit Chat" onClick={onQuit} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-50 transition-colors">
              <LogOut size={18} />
            </button>
            <button aria-label="Skip to next stranger" onClick={findStranger} className="px-3 py-1.5 bg-[#d8ff00] text-[#003cff] font-bold rounded-full text-sm flex items-center gap-1.5 hover:bg-[#ccee00] transition-colors">
              <SkipForward size={16} /> Skip
            </button>
          </div>
        </header>
      )}

      {/* Top panel */}
      {!isTextMode && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <video
            id="remote-video"
            ref={remoteVideoRef}
            playsInline
            autoPlay
            className="absolute inset-0 w-full h-full object-cover bg-gray-900"
          />
          <div
            id="local-video"
            ref={localContainerRef}
            onMouseDown={onMouseDown}
            onTouchStart={onMouseDown}
            className="absolute top-[72px] right-3 w-24 h-32 rounded-2xl border-[3px] border-[#d8ff00] z-10 cursor-grab overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.2)] pointer-events-auto"
          >
            <video
              ref={localVideoRef}
              playsInline
              autoPlay
              muted
              className="w-full h-full object-cover scale-x-[-1] bg-gray-900"
            />
          </div>

          <header className="absolute top-0 left-0 right-0 z-20 px-5 py-4 bg-gradient-to-b from-black/70 via-black/30 to-transparent flex items-center gap-2.5 pointer-events-auto">
            <div className="w-9 h-9 rounded-full bg-[#d8ff00] flex items-center justify-center text-[#003cff] font-extrabold text-base">S</div>
            <div className="text-white text-base font-bold font-['Inter',system-ui,sans-serif] drop-shadow-md">Stranger</div>
            {isConnected && <div className="w-2 h-2 rounded-full bg-[#4ade80] ml-1 shadow-[0_0_8px_#4ade80]"></div>}
            <button aria-label="Report User" onClick={() => setShowReportModal(true)} className="ml-auto w-9 h-9 rounded-full bg-white/15 border-none text-white text-base cursor-pointer flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-red-500 hover:scale-105">
              <Flag size={18} />
            </button>
          </header>

          <div className="absolute bottom-0 left-0 right-0 h-[500px] z-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

          <div className="absolute bottom-[280px] left-0 right-0 z-20 p-4 flex justify-center gap-5 items-center pointer-events-auto">
            <button aria-label="Toggle Microphone" onClick={toggleAudio} className="w-14 h-14 rounded-full bg-white/20 border border-white/30 text-white text-[22px] cursor-pointer flex items-center justify-center transition-all duration-200 backdrop-blur-md hover:bg-white hover:text-[#003cff] hover:scale-105">
              {!isAudioEnabled ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <button aria-label="Toggle Camera" onClick={toggleVideo} className="w-14 h-14 rounded-full bg-white/20 border border-white/30 text-white text-[22px] cursor-pointer flex items-center justify-center transition-all duration-200 backdrop-blur-md hover:bg-white hover:text-[#003cff] hover:scale-105">
              {!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
            </button>
            <button aria-label="Quit Chat" onClick={onQuit} className="w-14 h-14 rounded-full bg-red-500 border-none text-white text-[22px] cursor-pointer flex items-center justify-center shadow-[0_8px_24px_rgba(239,68,68,0.4)] transition-transform duration-200 hover:scale-105">
              <LogOut size={24} />
            </button>
            <button aria-label="Skip to next stranger" onClick={findStranger} className="w-16 h-16 rounded-full bg-[#d8ff00] border-none text-[#003cff] text-[26px] font-bold cursor-pointer flex items-center justify-center shadow-[0_8px_24px_rgba(216,255,0,0.4)] transition-transform duration-200 hover:scale-105">
              <SkipForward size={28} />
            </button>
          </div>

          {isDisconnected && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-md z-40 flex flex-col items-center justify-center gap-4 pointer-events-auto">
              <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 px-8 py-9 flex flex-col items-center gap-5 shadow-[0_24px_48px_rgba(0,0,0,0.2)]">
                <div className="text-white text-xl font-extrabold">Stranger disconnected</div>
                <button onClick={findStranger} className="h-[52px] rounded-full bg-[#d8ff00] border-none text-[#003cff] px-9 cursor-pointer text-base font-extrabold shadow-[0_8px_20px_rgba(216,255,0,0.3)] transition-transform duration-200 hover:scale-105">Find new stranger</button>
                <button onClick={onQuit} className="h-[52px] rounded-full bg-transparent border-2 border-white/30 text-white px-9 cursor-pointer text-base font-semibold transition-all duration-200 hover:border-white hover:bg-white/10">Go home</button>
              </div>
            </div>
          )}
        </div>
      )}

      {toastMessage && (
        <div className={`absolute ${isTextMode ? 'top-20' : 'top-[72px]'} left-1/2 -translate-x-1/2 bg-[#d8ff00] text-[#003cff] px-4 py-2 rounded-full shadow-[0_4px_16px_rgba(216,255,0,0.3)] z-[100] flex items-center gap-2 text-sm font-bold animate-[slide-down_0.3s_ease-out_forwards] whitespace-nowrap`}>
          {toastMessage}
          {commonInterests.length > 0 && commonInterests.map((interest, i) => (
            <span key={i} className="bg-[#003cff] text-white px-2 py-0.5 rounded-full text-xs font-semibold">
              {interest}
            </span>
          ))}
        </div>
      )}

      {isTextMode && isDisconnected && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center gap-5 shadow-[0_24px_48px_rgba(0,0,0,0.1)]">
            <div className="text-slate-900 text-xl font-extrabold">Stranger disconnected</div>
            <button onClick={findStranger} className="h-[52px] rounded-full bg-[#d8ff00] border-none text-[#003cff] px-9 cursor-pointer text-base font-extrabold shadow-md transition-transform hover:scale-105">Find new stranger</button>
            <button onClick={onQuit} className="h-[52px] rounded-full bg-slate-100 border-none text-slate-700 px-9 cursor-pointer text-base font-semibold transition-all duration-200 hover:bg-slate-200">Go home</button>
          </div>
        </div>
      )}

      {/* Spacer to push chat panel down when video is absolute */}
      {!isTextMode && <div className="flex-1 pointer-events-none" />}

      {/* BOTTOM CHAT PANEL */}
      <footer className={`${isTextMode ? 'flex-1 bg-white' : 'h-[280px] shrink-0 bg-transparent'} flex flex-col z-30 relative pointer-events-none`}>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 pointer-events-auto">
          {messages.map((msg, idx) => {
            if (msg.sender === 'system') {
              return (
                <div key={idx} className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-slate-100" />
                  <div className="text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    {msg.text}
                  </div>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
              );
            }
            const isMe = msg.sender === 'me';
            return (
              <div key={idx} className={`px-4 py-2.5 max-w-[75%] text-[15px] font-medium leading-relaxed ${isMe ? 'self-end bg-[#d8ff00] text-[#003cff] rounded-[20px_4px_20px_20px] shadow-[0_4px_12px_rgba(216,255,0,0.3)]' : 'self-start bg-slate-100 text-slate-900 rounded-[4px_20px_20px_20px] border border-slate-200'}`}>
                <div>{msg.text}</div>
                <span className={`block text-[11px] text-right mt-1 font-semibold ${isMe ? 'text-[#003cff]/50' : 'text-slate-400'}`}>
                  {getTimestamp(msg)}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
          {isStrangerTyping && (
             <div className={`text-xs font-semibold italic self-start px-2 ${isTextMode ? 'text-slate-400' : 'text-white/80 drop-shadow-md'}`}>Stranger is typing…</div>
          )}
        </div>
        
        <div className={`${isTextMode ? 'bg-white border-t border-slate-100' : 'bg-transparent'} pb-[max(12px,env(safe-area-inset-bottom))] flex items-center px-4 py-3 pointer-events-auto`}>
          <form onSubmit={(e) => { e.preventDefault(); if (chatInput.trim()) sendMessage(); }} className="flex gap-2.5 w-full items-center">
            <input
              type="text"
              value={chatInput}
              onChange={handleChatInputChange}
              placeholder="Type a message…"
              disabled={!isConnected}
              aria-label="Message Input"
              className={`flex-1 ${isTextMode ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/30 border-white/20 text-white placeholder-white/60 backdrop-blur-md'} border-2 rounded-full px-4 py-3 text-[15px] font-medium outline-none transition-colors duration-200 focus:border-[#d8ff00] focus:bg-black/50 disabled:opacity-50`}
            />
            <button type="submit" aria-label="Send Message" disabled={!isConnected || !chatInput.trim()} className={`w-12 h-12 rounded-full border-none text-[20px] flex shrink-0 items-center justify-center transition-all duration-200 ${!isConnected || !chatInput.trim() ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-[#003cff] text-white cursor-pointer shadow-[0_4px_16px_rgba(0,60,255,0.4)]'}`}>
              <Send size={20} />
            </button>
          </form>
        </div>
      </footer>

      {(isWaiting || isConnecting) && (
        <div className="absolute inset-0 bg-[#003cff] flex flex-col items-center justify-center z-[60]">
          <div className="w-20 h-20 bg-[#d8ff00] rounded-full animate-[pulse-g_1.5s_infinite_ease-in-out] flex items-center justify-center shadow-[0_0_0_0_rgba(216,255,0,0.5)]">
            <Search size={32} color="#003cff" strokeWidth={2.5} />
          </div>
          <div className="text-white font-['Inter',system-ui,sans-serif] text-2xl font-bold mt-8">
            {isConnecting ? 'Connecting video...' : 'Looking for a stranger...'}
          </div>
          <div className="text-white/80 text-[15px] font-medium mt-2">
            {isConnecting ? 'Establishing secure media connection…' : `Searching for ${waitSeconds}s...`}
          </div>
          <button onClick={onQuit} className="bg-transparent border border-[#3b82f6] text-white hover:bg-white/5 rounded-full px-8 py-2.5 text-[15px] font-bold mt-10 cursor-pointer transition-all duration-200">Stop Search</button>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-full max-w-[400px]">
            <h3 className="text-lg font-bold text-slate-900 m-0 mb-2 font-['Inter',system-ui,sans-serif]">Report User</h3>
            <p className="text-sm text-slate-500 m-0 mb-4 font-['Inter',system-ui,sans-serif]">Please describe why you are reporting this user.</p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="w-full h-24 p-3 border border-slate-200 rounded-lg mb-4 text-sm text-slate-900 bg-slate-50 box-border font-['Inter',system-ui,sans-serif] outline-none focus:border-[#003cff]"
              placeholder="Inappropriate behavior..."
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowReportModal(false)} className="px-4 py-2 rounded-lg font-medium text-slate-700 bg-slate-100 border-none cursor-pointer font-['Inter',system-ui,sans-serif] hover:bg-slate-200">Cancel</button>
              <button onClick={() => { submitReport(reportText); setReportText(''); }} className="px-4 py-2 rounded-lg font-medium text-white bg-red-500 border-none cursor-pointer font-['Inter',system-ui,sans-serif] hover:bg-red-600">Submit Report</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default VideoChat;
