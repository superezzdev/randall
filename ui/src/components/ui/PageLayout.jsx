import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from './Footer';
import randallLogoText from '../../assets/randall.png';

export const PageLayout = ({ children, title }) => {
  useEffect(() => {
    if (title) {
      document.title = `${title} — Randall`;
    }
    return () => {
      document.title = "Randall — Free Random Video Chat App | Best Omegle Alternative";
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex flex-col font-['Inter',system-ui,sans-serif] antialiased">
      {/* Simple Navbar for pages */}
      <nav className="bg-[#003cff] relative z-20 flex items-center justify-between px-4 sm:px-6 md:px-8 py-4 md:py-5 w-full">
        <Link to="/" className="flex items-center gap-2">
          <img src={randallLogoText} alt="randall" width="95" height="24" className="h-[20px] md:h-[24px] w-auto" />
        </Link>
        <div className="flex gap-4">
          <Link to="/" className="px-[18px] py-[8px] rounded-full border border-white/30 text-white text-[13px] font-bold no-underline transition-colors hover:bg-white/10 hover:border-white">
            Back to Home
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-[900px] mx-auto w-full px-6 py-12 md:py-16">
        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm">
          <h1 className="text-3xl md:text-4xl font-black text-[#0a0908] mb-8">{title}</h1>
          <div className="prose prose-blue max-w-none text-[#4b5563] leading-relaxed flex flex-col gap-4">
            {children}
          </div>
        </div>
      </main>

      {/* Footer in a white section to match Home */}
      <section className="bg-white text-[#0a0908] rounded-t-[40px] px-6 py-12 md:p-12 shadow-[0_-20px_60px_rgba(0,0,0,0.05)] mt-auto w-full">
        <Footer />
      </section>
    </div>
  );
};

