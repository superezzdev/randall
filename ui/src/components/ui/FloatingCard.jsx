import avatarFelix from '../../assets/avatar-felix.svg';
import avatarMaya from '../../assets/avatar-maya.svg';

const avatarMap = {
  Felix: avatarFelix,
  Maya: avatarMaya,
};

export const FloatingCard = ({ name, country, flag, seed, rotateClass }) => {
  const avatarSrc = avatarMap[seed] || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=003cff`;

  return (
    <div className={`w-[120px] p-[14px] rounded-3xl md:w-[180px] bg-white/20 backdrop-blur-2xl border border-white/30 md:rounded-[32px] md:p-6 flex flex-col items-center shadow-[0_24px_48px_rgba(0,0,0,0.15)] transition-transform duration-500 ease-out cursor-default hover:rotate-0 hover:scale-105 ${rotateClass}`}>
      <div className="w-[52px] h-[52px] mb-2 md:w-[84px] md:h-[84px] rounded-full bg-[#003cff] overflow-hidden border-[3px] border-white/30 md:mb-3 shrink-0 shadow-inner">
        <img 
          src={avatarSrc}
          alt={`${name}'s avatar`}
          width="84"
          height="84"
          className="w-full h-full object-cover"
        />
      </div>
      <p className="font-black text-xs md:text-[17px] text-white m-0 font-['Inter',system-ui,sans-serif] drop-shadow-md tracking-tight">{name}</p>
      <p className="text-[9px] mt-1 md:text-[12px] font-bold text-white md:mt-1 font-['Inter',system-ui,sans-serif] truncate w-full text-center drop-shadow-sm">{flag} {country}</p>
      <p className="text-[9px] md:text-[10px] text-[#4ade80] mt-1.5 flex items-center justify-center gap-1 font-['Inter',system-ui,sans-serif] font-bold whitespace-nowrap drop-shadow-md">
        <span className="w-1 h-1 md:w-[5px] md:h-[5px] rounded-full bg-[#4ade80] inline-block"/>
        online now
      </p>
    </div>
  );
};
