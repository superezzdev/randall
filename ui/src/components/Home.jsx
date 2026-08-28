import { useState } from 'react';
import { m, LazyMotion, domAnimation } from 'motion/react';
import { ArrowLeft } from './ui/ArrowLeft';
import { ArrowRight } from './ui/ArrowRight';
import { CircularBadge } from './ui/CircularBadge';
import { FloatingCard } from './ui/FloatingCard';
import { Footer } from './ui/Footer';
import randallLogoText from '../assets/randall.png';

export default function Home({ onStart, onlineCount = 0 }) {
  const [mode, setMode] = useState('video');
  const [interests, setInterests] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [shareToast, setShareToast] = useState(false);
  const [pressed, setPressed] = useState(false);

  const handleInputKey = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) {
      e.preventDefault();
      if (interests.length < 10) {
        setInterests([...interests, inputVal.trim().replace(/,$/, '')]);
        setInputVal('');
      }
    }
  };

  const removeTag = (i) => setInterests(interests.filter((_,idx)=>idx!==i));

  const handleShare = async () => {
    const data = { title:'randall', text:'Meet someone new, right now.', url:window.location.origin };
    try {
      if (navigator.share && navigator.canShare?.(data)) await navigator.share(data);
      else { await navigator.clipboard.writeText(window.location.origin); setShareToast(true); setTimeout(()=>setShareToast(false),2000); }
    } catch {}
  };

  const handleStart = () => onStart?.({ mode, interests });

  const typeShadowClass = "[text-shadow:1px_1px_0_#0026a3,2px_2px_0_#0026a3,3px_3px_0_#0026a3,4px_4px_0_#0026a3,5px_5px_0_#0026a3,6px_6px_0_#0026a3,7px_7px_0_#0026a3,8px_8px_0_#0026a3,9px_9px_0_#0026a3,10px_10px_0_#0026a3,11px_11px_0_#0026a3,12px_12px_0_#0026a3]";

  return (
    <div className="min-h-[100dvh] bg-[#003cff] flex flex-col font-['Inter',system-ui,sans-serif] antialiased relative overflow-x-hidden">
      
      {/* Background grid */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:4rem_4rem]"/>

      {/* Toast */}
      {shareToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-[#d8ff00] text-[#003cff] px-[22px] py-[10px] rounded-full text-[13px] font-bold z-[9999] shadow-[0_4px_20px_rgba(216,255,0,0.5)] whitespace-nowrap animate-[toast-in_0.2s_ease]">
          Link copied!
        </div>
      )}

      {/* ── NAVBAR ── */}
      <nav className="relative z-20 flex items-center justify-between px-4 sm:px-6 md:px-8 py-4 md:py-5 max-w-[1440px] mx-auto w-full border-b border-white/10">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img src={randallLogoText} alt="randall" className="h-[20px] md:h-[24px]" fetchpriority="high" />
        </div>

        {/* Nav links */}
        <div className="hidden md:flex gap-4">
          {[
            {label:'How it works',href:'#'},
            {label:'Open source',href:'https://github.com/superezzdev/randall'},
          ].map(l=>(
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" 
              className="px-[18px] py-[8px] rounded-full border border-white/30 text-white text-[13px] font-bold no-underline transition-colors hover:bg-white/10 hover:border-white whitespace-nowrap">
              {l.label}
            </a>
          ))}
        </div>

        {/* Right side pills */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-[6px] text-white/80 text-[12px] md:text-[13px] font-bold bg-white/10 border border-white/20 rounded-full px-3 py-1.5 md:px-[14px] md:py-[6px] whitespace-nowrap">
            <div className="w-[8px] h-[8px] rounded-full bg-[#4ade80] animate-[pulse-g_2s_infinite]"/>
            {onlineCount} online
          </div>
          
          <button onClick={handleShare} className="flex items-center gap-[5px] bg-[#d8ff00] hover:bg-[#ccee00] text-[#003cff] rounded-full px-3 py-1.5 md:px-5 md:py-2.5 text-[12px] md:text-[13px] font-bold cursor-pointer transition-colors shadow-sm whitespace-nowrap">
            ↑ Share
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <main className="flex-1 relative z-10 px-4 pt-10 pb-[100px] md:pb-[160px] flex flex-col items-center justify-center max-w-[1440px] mx-auto w-full min-h-[clamp(300px,60vw,600px)]">
        <LazyMotion features={domAnimation}>
          <div className="relative w-full max-w-[1000px] flex flex-col items-center">
          
          {/* ── STACKED GIANT TYPE ── */}
          <div className="w-full flex flex-col gap-0 md:gap-2 relative z-50 md:z-10 mt-8 md:mt-0">
            <m.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="w-full flex justify-center md:justify-start md:pl-[15%] relative z-[3]">
              <h1 className={`font-['Inter',system-ui,sans-serif] text-[clamp(3.5rem,11vw,160px)] font-black leading-[0.9] tracking-[-0.04em] text-[#d8ff00] uppercase m-0 p-0 ${typeShadowClass}`}>
                MEET
              </h1>
            </m.div>

            <m.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              className="w-full flex justify-center md:justify-start md:pl-[clamp(8px,2vw,20px)] relative z-[2]">
              <h1 className={`font-['Inter',system-ui,sans-serif] text-[clamp(3.8rem,13vw,180px)] font-black leading-[0.9] tracking-[-0.04em] text-white uppercase m-0 p-0 overflow-visible whitespace-nowrap ${typeShadowClass}`}>
                SOMEONE
              </h1>
            </m.div>

            <m.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              className="w-full flex justify-center md:justify-start md:pl-[25%] relative z-[1]">
              <h1 className={`font-['Inter',system-ui,sans-serif] text-[clamp(3.5rem,11vw,160px)] font-black leading-[0.9] tracking-[-0.04em] text-[#d8ff00] italic uppercase m-0 p-0 ${typeShadowClass}`}>
                NEW
              </h1>
            </m.div>
            
            <p className="text-[12px] sm:text-[14px] text-white/50 tracking-[0.08em] uppercase text-center md:text-left md:pl-[15%] mt-6 md:mt-4 font-bold drop-shadow-md">
              One click · A real person · No accounts
            </p>
          </div>

          {/* ── FLOATING CARDS + DECORATIONS ── */}
          <div className="absolute inset-0 w-full h-full pointer-events-none">
            
            {/* Card 1 */}
            <m.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, y: [0, -15, 0] }}
              transition={{ scale: { duration: 0.5, delay: 0.3 }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
              className="absolute top-[0%] left-[-2%] md:bottom-[-5%] md:top-auto md:left-[2%] z-30 pointer-events-auto">
              <FloatingCard
                name="Alex, 24" country="Brazil" flag="🇧🇷"
                seed="Felix" rotateClass="rotate-[-8deg]"/>
            </m.div>

            {/* Card 2 */}
            <m.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, y: [0, -20, 0] }}
              transition={{ scale: { duration: 0.5, delay: 0.4 }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 } }}
              className="absolute bottom-[10%] right-[0%] md:top-[10%] md:bottom-auto md:right-[5%] z-30 pointer-events-auto">
              <FloatingCard
                name="Maya, 21" country="Japan" flag="🇯🇵"
                seed="Maya" rotateClass="rotate-12"/>
            </m.div>

            {/* Arrow decorations */}
            <m.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              className="absolute bottom-[2%] left-[2%] w-12 h-12 md:w-28 md:h-28 md:bottom-[10%] md:left-[-5%] z-20">
              <ArrowLeft/>
            </m.div>
            <m.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              className="absolute top-[10%] right-[0%] w-10 h-10 md:w-20 md:h-20 md:top-[10%] md:right-[5%] z-20">
              <ArrowRight/>
            </m.div>

            {/* Spinning badge */}
            <m.div 
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.8 }}
              className="absolute bottom-[-15%] right-[5%] md:bottom-[-5%] md:right-[15%] z-40 pointer-events-auto transform scale-75 md:scale-100">
              <CircularBadge onClick={handleStart}/>
            </m.div>
          </div>
        </div>
        </LazyMotion>
      </main>

      {/* ── BOTTOM WHITE SECTION ── */}
      <section className="bg-white text-[#0a0908] rounded-t-[40px] px-6 py-12 md:p-12 relative z-20 shadow-[0_-20px_60px_rgba(0,0,0,0.2)] mt-auto w-full">
        <div className="max-w-[560px] mx-auto flex flex-col gap-5">
          
          <div className="text-center">
            <p className="text-[12px] font-black tracking-[0.1em] text-[#003cff] uppercase mb-3">
              Your interests (optional)
            </p>
            
            {interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5 justify-center">
                {interests.map((t,i)=>(
                  <span key={i} className="bg-[#003cff]/10 border border-[#003cff]/20 rounded-full px-2.5 py-1 text-xs text-[#003cff] font-bold flex items-center gap-1.5">
                    {t}
                    <button onClick={()=>removeTag(i)} className="bg-transparent border-none cursor-pointer text-[#003cff] text-sm p-0 leading-none hover:opacity-70">×</button>
                  </span>
                ))}
              </div>
            )}
            
            <input
              value={inputVal}
              onChange={e=>setInputVal(e.target.value)}
              onKeyDown={handleInputKey}
              placeholder="music, gaming, art…"
              className="w-full bg-[#f4f6f8] border-2 border-[#e2e8f0] rounded-xl px-4 py-4 text-base text-[#0f172a] font-semibold outline-none transition-colors focus:border-[#003cff] focus:bg-white"
            />
          </div>

          {/* Mode tabs */}
          <div className="flex bg-[#f1f5f9] rounded-xl p-1.5 border border-[#e2e8f0]">
            {[
              {id:'video',label:'📹 1-on-1 Video'},
              {id:'group',label:'👥 Group (5 Max)'},
              {id:'text', label:'💬 Text only'},
            ].map(m=>(
              <button key={m.id} onClick={()=>setMode(m.id)} 
                className={`flex-1 py-[10px] px-1.5 rounded-lg border-none text-[13px] cursor-pointer font-[inherit] transition-all duration-150 ${mode === m.id ? 'font-bold bg-white text-[#003cff] shadow-sm' : 'font-semibold bg-transparent text-[#64748b] hover:text-[#0f172a]'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            onMouseDown={()=>setPressed(true)}
            onMouseUp={()=>setPressed(false)}
            onMouseLeave={()=>setPressed(false)}
            className={`w-full h-[60px] bg-[#d8ff00] hover:bg-[#ccee00] border-2 border-transparent hover:border-[#003cff] rounded-2xl flex items-center justify-between pl-6 pr-2.5 cursor-pointer font-[inherit] transition-all duration-150 shadow-[0_8px_24px_rgba(216,255,0,0.3)] ${pressed ? 'scale-[0.98]' : 'scale-100'}`}>
            <span className="text-lg font-black text-[#003cff] uppercase tracking-wide">Start chatting</span>
            <div className="w-[46px] h-[46px] rounded-full bg-[#003cff] flex items-center justify-center text-white shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
          </button>

          {/* Rules */}
          <div className="flex justify-center flex-wrap text-[11px] text-[#9ca3af]">
            {['Be kind','18+ only','No nudity','No harassment'].map((r,i,a)=>(
              <span key={r}>
                {r}{i<a.length-1 && <span className="mx-1.5 opacity-50">·</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </section>
    </div>
  );
}
