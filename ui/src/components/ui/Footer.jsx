import { Mail, Shield, FileText, Activity, Info, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import randallLogoText from '../../assets/randall.png';

export const Footer = () => (
  <footer className="w-full max-w-[900px] mx-auto mt-16 pt-10 border-t border-[#e5e7eb] flex flex-col gap-8 pb-4">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
      <div className="flex flex-col gap-4 col-span-2 md:col-span-1">
        <div className="flex items-center gap-2">
           <img src={randallLogoText} alt="randall" width="71" height="18" className="h-[18px] w-auto mix-blend-multiply filter grayscale opacity-60" />
        </div>
        <p className="text-[13px] text-[#4b5563] leading-relaxed mt-2">
          Meet someone new, right now. No accounts, no friction. Just real conversations.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-bold text-[#0a0908] uppercase tracking-wider mb-1">Company</h3>
        <Link to="/about" className="text-[13px] text-[#4b5563] hover:text-[#003cff] transition-colors flex items-center gap-2 no-underline">
          <Info size={14}/> About Us
        </Link>
        <a href="https://github.com/superezzdev/randall" target="_blank" rel="noreferrer" className="text-[13px] text-[#4b5563] hover:text-[#003cff] transition-colors flex items-center gap-2 no-underline">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
          GitHub
        </a>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-bold text-[#0a0908] uppercase tracking-wider mb-1">Legal & Safety</h3>
        <Link to="/privacy" className="text-[13px] text-[#4b5563] hover:text-[#003cff] transition-colors flex items-center gap-2 no-underline">
          <Shield size={14}/> Privacy Policy
        </Link>
        <Link to="/terms" className="text-[13px] text-[#4b5563] hover:text-[#003cff] transition-colors flex items-center gap-2 no-underline">
          <FileText size={14}/> Terms of Service
        </Link>
        <Link to="/safety" className="text-[13px] text-[#4b5563] hover:text-[#003cff] transition-colors flex items-center gap-2 no-underline">
          <Heart size={14}/> Safety Center
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-bold text-[#0a0908] uppercase tracking-wider mb-1">Support</h3>
        <Link to="/contact" className="text-[13px] text-[#4b5563] hover:text-[#003cff] transition-colors flex items-center gap-2 no-underline">
          <Mail size={14}/> Contact Us
        </Link>
        <div className="text-[13px] text-[#4b5563] flex items-center gap-2 mt-1">
          <Activity size={14} className="text-[#15803d]"/> 
          <span>Status: <span className="text-[#15803d] font-bold">All systems operational</span></span>
        </div>
      </div>
    </div>

    <div className="flex flex-col items-center gap-6 pt-8 mt-4 border-t border-[#f1f3f5]">
      
      {/* Premium Open Source CTA */}
      <a href="https://github.com/superezzdev/randall" target="_blank" rel="noreferrer" 
         className="w-full sm:w-auto text-[13px] bg-[#0a0908] px-6 py-3 rounded-2xl text-[#f5f0e8] font-bold hover:bg-[#003cff] hover:text-white transition-all duration-300 flex items-center justify-center gap-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_20px_rgba(0,60,255,0.4)] hover:-translate-y-0.5">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
        Open Source — We welcome contributions!
      </a>

      <div className="flex flex-col items-center gap-3 w-full">
        <div className="text-[13px] text-[#4b5563] text-center flex flex-wrap justify-center items-center gap-x-1.5 gap-y-1">
          <span>Built & managed by</span>
          <a href="https://github.com/superezzdev/" target="_blank" rel="noreferrer" className="text-[#0a0908] font-bold hover:text-[#003cff] transition-colors">- ARYA RCB</a>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#4b5563] font-medium">
            © {new Date().getFullYear()} randall
          </span>
          <span className="w-1 h-1 rounded-full bg-[#d1d5db]"></span>
          <span className="text-[11px] text-[#4b5563] font-mono tracking-wider font-semibold">
            v1.0.0
          </span>
        </div>
      </div>
    </div>
  </footer>
);
