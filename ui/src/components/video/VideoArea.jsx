import React, { useEffect, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, SkipForward, LogOut, Flag, SwitchCamera } from 'lucide-react';

export const VideoArea = ({
  remoteVideoRef, localVideoRef, status, remoteVideoEnabled, isVideoEnabled,
  isAudioEnabled, userCount, commonInterests, toggleVideo, toggleAudio,
  switchCamera, facingMode = 'user', isSwitchingCamera = false,
  findStranger, onQuit, setShowReportModal, showReportModal, submitReport
}) => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (status === 'connected') {
      setShowBanner(true);
      const timer = setTimeout(() => setShowBanner(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowBanner(false);
    }
  }, [status]);

  return (
    <div className="relative h-[60%] md:h-full md:flex-1 flex items-center justify-center shrink-0 bg-black">
      {/* Remote Video Background */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${!remoteVideoEnabled ? 'hidden' : ''}`}
      />
      {!remoteVideoEnabled && status === 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
           <div className="w-32 h-32 md:w-48 md:h-48 bg-gray-600 rounded-full flex items-center justify-center">
              <VideoOff size={48} className="text-gray-400" />
           </div>
        </div>
      )}

      {/* Overlay Status: Waiting */}
      {status === 'waiting' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-md">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-6"></div>
          <h2 className="text-white text-lg font-medium tracking-wide">Looking for strangers...</h2>
        </div>
      )}

      {/* Overlay Status: Connected Banner */}
      {showBanner && status === 'connected' && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md border border-white/10 text-white text-sm py-2 px-6 rounded-full font-medium z-10 shadow-lg animate-fade-in-down">
          You're now chatting with a stranger
        </div>
      )}

      {/* Overlay Status: Disconnected */}
      {status === 'disconnected' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-md transition-opacity duration-300">
          <h2 className="text-white text-xl font-medium mb-6">Stranger has disconnected</h2>
          <button 
            onClick={findStranger}
            className="bg-white text-black hover:bg-gray-200 px-6 py-3 rounded-full font-medium transition-colors shadow-lg"
          >
            Find new stranger
          </button>
        </div>
      )}
      
      {status === 'error' && (
        <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center z-10 text-white font-bold p-8 text-center">
          <h2>Could not access Camera or Microphone. Please check permissions.</h2>
        </div>
      )}

      {/* Report Button */}
      {status === 'connected' && (
        <button
          onClick={() => setShowReportModal(true)}
          className="absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-6 z-30 bg-red-500/20 hover:bg-red-500/40 text-red-500 border border-red-500/30 rounded-full px-4 py-2 min-h-[44px] flex items-center justify-center gap-2 transition-colors backdrop-blur-md text-sm font-bold shadow-sm"
        >
          <Flag size={16} />
          Report
        </button>
      )}

      {/* Local Video PIP */}
      <div className="absolute bottom-4 right-4 md:bottom-24 md:right-6 w-24 sm:w-32 md:w-48 aspect-[3/4] bg-gray-900 rounded-xl md:rounded-2xl overflow-hidden border-2 border-white shadow-xl z-20">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-transform ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
        />
        {!isVideoEnabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="w-12 h-12 md:w-20 md:h-20 bg-gray-600 rounded-full flex items-center justify-center">
              <VideoOff className="text-white opacity-50 w-6 h-6 md:w-10 md:h-10" />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="fixed md:absolute bottom-0 md:bottom-8 left-0 md:left-1/2 md:-translate-x-1/2 w-full md:w-auto flex justify-center items-center gap-3 md:gap-4 z-[60] bg-[#111] md:bg-black/50 p-3 md:p-3 md:rounded-full md:backdrop-blur-md border-t md:border-t-0 md:border border-white/10 pb-[max(12px,env(safe-area-inset-bottom))] md:pb-3">
        <button 
          onClick={toggleAudio}
          className={`p-3 md:p-4 min-w-[44px] min-h-[44px] rounded-full transition-colors ${isAudioEnabled ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
        >
          {isAudioEnabled ? <Mic size={20} className="md:w-6 md:h-6" /> : <MicOff size={20} className="md:w-6 md:h-6" />}
        </button>
        
        <button 
          onClick={toggleVideo}
          className={`p-3 md:p-4 min-w-[44px] min-h-[44px] rounded-full transition-colors ${isVideoEnabled ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
        >
          {isVideoEnabled ? <Video size={20} className="md:w-6 md:h-6" /> : <VideoOff size={20} className="md:w-6 md:h-6" />}
        </button>

        {switchCamera && (
          <button 
            onClick={switchCamera}
            disabled={!isVideoEnabled || isSwitchingCamera}
            title={facingMode === 'user' ? "Switch to back camera" : "Switch to front camera"}
            className={`p-3 md:p-4 min-w-[44px] min-h-[44px] rounded-full transition-colors disabled:opacity-40 ${
              facingMode === 'environment' ? 'bg-[#003cff] text-[#d8ff00]' : 'bg-gray-800 hover:bg-gray-700 text-white'
            }`}
          >
            <SwitchCamera size={20} className={`md:w-6 md:h-6 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
          </button>
        )}

        <div className="w-px h-6 md:h-8 bg-white/20 mx-1 md:mx-2"></div>

        <button 
          onClick={findStranger}
          className="bg-primary hover:bg-primary-dark text-black font-bold p-3 md:p-4 min-w-[44px] min-h-[44px] rounded-full flex items-center gap-2 transition-transform hover:scale-105 shadow-[0_4px_0_0_#111]"
        >
          <SkipForward size={20} className="md:w-6 md:h-6" fill="currentColor" />
          <span className="hidden sm:inline pr-2 tracking-wide uppercase">Next</span>
        </button>

        <div className="w-px h-6 md:h-8 bg-white/20 mx-1 md:mx-2"></div>

        <button 
          onClick={onQuit}
          className="bg-red-600 hover:bg-red-700 text-white font-bold p-3 md:p-4 min-w-[44px] min-h-[44px] rounded-full flex items-center gap-2 transition-transform hover:scale-105 shadow-[0_4px_0_0_#111]"
        >
          <LogOut size={20} className="md:w-6 md:h-6" />
          <span className="hidden sm:inline pr-2 tracking-wide uppercase">Quit</span>
        </button>
      </div>

      {/* Logo */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20">
        <h1 className="text-primary text-2xl md:text-3xl font-black tracking-tighter drop-shadow-lg flex items-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <circle cx="9" cy="12" r="5" />
            <circle cx="15" cy="12" r="5" />
          </svg>
          randall
        </h1>
        
        {status === 'connected' && commonInterests.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <span className="text-white/80 text-sm font-medium mr-1 shadow-sm">You both like:</span>
            {commonInterests.map((interest, i) => (
              <span key={i} className="bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs px-3 py-1.5 rounded-full shadow-sm capitalize">
                {interest}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* User Count */}
      <div className="absolute top-4 right-4 md:top-6 md:right-6 z-20 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1 md:px-4 md:py-1.5 flex items-center gap-2 shadow-sm">
        <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-white text-xs md:text-sm font-medium">{userCount} <span className="hidden sm:inline">people</span> online</span>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-fade-in-up">
            <h3 className="text-white text-xl font-bold mb-3 flex items-center gap-2">
              <Flag size={20} className="text-red-500" />
              Report Stranger
            </h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Why are you reporting this user? We will immediately disconnect you and log this report for review.
            </p>
            <div className="flex flex-col gap-3">
              {['Nudity', 'Harassment', 'Spam'].map(reason => (
                <button
                  key={reason}
                  onClick={() => submitReport(reason)}
                  className="bg-gray-800 hover:bg-gray-700 hover:bg-red-900/40 hover:text-red-400 hover:border-red-900/50 text-white font-medium py-3.5 rounded-xl transition-colors border border-white/5 shadow-sm"
                >
                  {reason}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setShowReportModal(false)}
              className="mt-6 w-full text-gray-500 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
