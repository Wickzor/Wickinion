import React, { useRef, useState } from 'react';
import { CardDef, CardType } from '../types';
import { Coins, Crown, Zap, Skull, Shield, Sparkles } from 'lucide-react';

interface CardDisplayProps {
  card: CardDef;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  disabled?: boolean;
  count?: number;
  small?: boolean;
  shake?: boolean;
  selected?: boolean; 
}

export const CardDisplay: React.FC<CardDisplayProps> = ({ card, onClick, onMouseEnter, onMouseLeave, disabled, count, small, shake, selected }) => {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [glow, setGlow] = useState({ x: 50, y: 50 });

  // 3D Tilt & Holographic Logic
  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const factor = small ? 10 : 15;
      const rotateX = ((y - centerY) / centerY) * -factor; 
      const rotateY = ((x - centerX) / centerX) * factor;

      setRotate({ x: rotateX, y: rotateY });
      setGlow({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 });
  };

  const handleMouseLeave = () => {
      setRotate({ x: 0, y: 0 });
      if (onMouseLeave) onMouseLeave();
  };

  const getTheme = () => {
    switch (card.type) {
      case CardType.TREASURE: 
        return {
          frameGradient: 'bg-gradient-to-br from-[#b45309] via-[#fcd34d] to-[#78350f]',
          innerBorder: 'border-[#fef3c7]',
          bodyBg: 'bg-[#fffbeb]',
          gemClass: 'gem-gold',
          textColor: 'text-[#451a03]',
          icon: Coins
        };
      case CardType.VICTORY: 
        return {
          frameGradient: 'bg-gradient-to-br from-[#14532d] via-[#4ade80] to-[#064e3b]',
          innerBorder: 'border-[#dcfce7]',
          bodyBg: 'bg-[#f0fdf4]',
          gemClass: 'gem-emerald',
          textColor: 'text-[#064e3b]',
          icon: Crown
        };
      case CardType.ACTION: 
        return {
          frameGradient: 'bg-gradient-to-br from-[#334155] via-[#94a3b8] to-[#0f172a]',
          innerBorder: 'border-[#e2e8f0]',
          bodyBg: 'bg-[#f8fafc]',
          gemClass: 'gem-sapphire',
          textColor: 'text-[#0f172a]',
          icon: Zap
        };
      case CardType.REACTION: 
        return {
          frameGradient: 'bg-gradient-to-br from-[#1e3a8a] via-[#60a5fa] to-[#172554]',
          innerBorder: 'border-[#dbeafe]',
          bodyBg: 'bg-[#eff6ff]',
          gemClass: 'gem-sapphire',
          textColor: 'text-[#1e3a8a]',
          icon: Shield
        };
      case CardType.CURSE: 
        return {
          frameGradient: 'bg-gradient-to-br from-[#3b0764] via-[#a855f7] to-[#1e1b4b]',
          innerBorder: 'border-[#f3e8ff]',
          bodyBg: 'bg-[#faf5ff]',
          gemClass: 'gem-amethyst',
          textColor: 'text-[#3b0764]',
          icon: Skull
        };
      default: 
        return {
          frameGradient: 'bg-stone-600',
          innerBorder: 'border-stone-400',
          bodyBg: 'bg-stone-100',
          gemClass: 'gem-gold',
          textColor: 'text-stone-900',
          icon: Sparkles
        };
    }
  };

  const theme = getTheme();
  const IconComp = theme.icon;

  // --- RESPONSIVE SCALING ENGINE ---
  // Increased "small" dimensions by approx 25% for better buying board visibility
  const sizeClasses = small 
    ? 'w-24 h-36 md:w-28 md:h-44 lg:w-24 lg:h-36 xl:w-28 xl:h-44 2xl:w-56 2xl:h-80 rounded-md lg:rounded-lg' 
    : 'w-24 h-36 md:w-32 md:h-48 lg:w-24 lg:h-36 xl:w-32 xl:h-48 2xl:w-72 2xl:h-[28rem] rounded-lg lg:rounded-xl'; 

  // Gem (Cost)
  const gemSize = small 
    ? 'w-6 h-6 md:w-7 md:h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 2xl:w-14 2xl:h-14 top-1 left-1' 
    : 'w-6 h-6 md:w-8 md:h-8 lg:w-7 lg:h-7 xl:w-8 xl:h-8 2xl:w-16 2xl:h-16 top-1 left-1 lg:top-1 lg:left-1 2xl:top-2 2xl:left-2';
  
  const gemText = small 
    ? 'text-[10px] md:text-xs lg:text-[10px] xl:text-xs 2xl:text-2xl' 
    : 'text-xs md:text-sm lg:text-xs xl:text-sm 2xl:text-4xl';

  // Name Plaque
  const plaqueSize = small 
    ? 'h-6 md:h-7 lg:h-6 xl:h-7 2xl:h-12 -bottom-2 md:-bottom-2.5 2xl:-bottom-4' 
    : 'h-6 md:h-8 lg:h-7 xl:h-8 2xl:h-16 -bottom-2 lg:-bottom-2.5 2xl:-bottom-5';
  
  const titleSize = small 
    ? 'text-[8px] md:text-[9px] lg:text-[8px] xl:text-[9px] 2xl:text-base tracking-wide' 
    : 'text-[7px] md:text-[9px] lg:text-[7px] xl:text-[9px] 2xl:text-2xl tracking-widest';

  // Body Content
  const bodyPadding = small 
    ? 'pt-3 md:pt-4 lg:pt-3 2xl:pt-10 pb-1 px-1 lg:px-1.5' 
    : 'pt-3 md:pt-4 lg:pt-3 xl:pt-4 2xl:pt-12 pb-1 px-1 lg:px-2 2xl:px-6';
  
  const descSize = small 
    ? 'text-[7px] md:text-[8px] lg:text-[7px] xl:text-[8px] 2xl:text-sm leading-tight' 
    : 'text-[6px] md:text-[8px] lg:text-[6px] xl:text-[8px] 2xl:text-xl leading-2 lg:leading-3 2xl:leading-6';
  
  const typeSize = small 
    ? 'text-[6px] md:text-[7px] lg:text-[6px] xl:text-[7px] 2xl:text-xs tracking-wider mb-0.5' 
    : 'text-[5px] md:text-[6px] lg:text-[5px] xl:text-[6px] 2xl:text-base tracking-[0.2em] mb-0.5 lg:mb-1 2xl:mb-4';

  const iconWatermarkSize = small 
    ? 'w-8 h-8 md:w-10 md:h-10 lg:w-8 lg:h-8 2xl:w-24 2xl:h-24 -bottom-1 -right-1' 
    : 'w-8 h-8 md:w-10 md:h-10 lg:w-8 lg:h-8 xl:w-10 xl:h-10 2xl:w-32 2xl:h-32 -bottom-1 -right-1 lg:-bottom-2 lg:-right-2';

  const countBadgeSize = small
    ? 'w-5 h-5 text-[8px] md:w-6 md:h-6 md:text-[10px] lg:w-5 lg:h-5 lg:text-[8px] 2xl:w-14 2xl:h-14 2xl:text-xl border lg:border-2 2xl:border-4'
    : 'w-5 h-5 text-[8px] md:w-6 md:h-6 md:text-[10px] lg:w-5 lg:h-5 lg:text-[8px] xl:w-6 xl:h-6 xl:text-[10px] 2xl:w-14 2xl:h-14 2xl:text-2xl border lg:border-2 2xl:border-4';

  return (
    <button
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={onMouseEnter}
      disabled={disabled && !shake} 
      className={`
        relative flex flex-col
        ${sizeClasses} transition-all duration-150 ease-out
        ${disabled ? 'opacity-80 grayscale-[0.3] cursor-not-allowed' : 'cursor-pointer hover:z-50'}
        card-3d-wrapper
        ${shake ? 'animate-shake' : ''}
        ${selected ? 'ring-2 lg:ring-4 ring-[#4ade80] -translate-y-4 2xl:-translate-y-8 scale-105 z-50 shadow-[0_0_80px_rgba(74,222,128,0.4)]' : ''}
        ${!disabled && !selected ? 'hover:scale-[1.02] hover:-translate-y-2' : ''}
      `}
      style={{
          transform: !disabled ? `perspective(1000px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) scale(${selected ? 1.05 : 1})` : undefined
      }}
    >
      {/* 1. Base Shadow Layer */}
      <div className={`absolute inset-0 ${small ? 'rounded-md lg:rounded-lg' : 'rounded-lg lg:rounded-xl'} bg-black shadow-card-hover transform translate-z-[-2px]`}></div>

      {/* 2. The Frame */}
      <div className={`absolute inset-0 ${small ? 'rounded-md lg:rounded-lg' : 'rounded-lg lg:rounded-xl'} ${theme.frameGradient} p-[1.5px] md:p-[2px] lg:p-[1.5px] 2xl:p-[6px] shadow-inner-deep overflow-hidden card-face`}>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] opacity-20 mix-blend-overlay pointer-events-none"></div>

        {/* 3. Inner Border */}
        <div className={`w-full h-full border lg:border-[1.5px] 2xl:border-2 ${theme.innerBorder} ${small ? 'rounded-sm lg:rounded-md' : 'rounded-md lg:rounded-lg'} bg-[#0f0a06] relative flex flex-col shadow-2xl`}>

             {/* 4. Art Section (Top 55%) */}
             <div className="h-[55%] w-full relative shrink-0">
                 <img src={card.image} alt={card.name} className={`w-full h-full object-cover ${small ? 'rounded-t-sm' : 'rounded-t-md'}`} loading="lazy" />
                 <div className="absolute inset-0 bg-gradient-to-t from-[#0f0a06] via-transparent to-black/30 pointer-events-none"></div>
                 <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] pointer-events-none"></div>

                 {/* COST GEM */}
                 <div className={`absolute ${gemSize} rounded-full ${theme.gemClass} flex items-center justify-center shadow-heavy z-30 border border-white/30 group`}>
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent to-white/60 opacity-50"></div>
                    <span className={`font-sans font-black ${gemText} text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] z-10`}>{card.cost}</span>
                 </div>
             </div>

             {/* NAME PLAQUE */}
             <div className={`absolute top-[55%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90%] z-20 ${plaqueSize} flex items-center justify-center`}>
                 <div className={`absolute inset-0 ${theme.frameGradient} transform skew-x-12 rounded-[1px] lg:rounded-sm shadow-heavy border border-white/20`}></div>
                 <div className={`absolute inset-[1px] lg:inset-[2px] bg-[#1c1917] transform skew-x-12 flex items-center justify-center overflow-hidden`}>
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-30"></div>
                    <span className={`font-serif font-bold ${titleSize} text-[#e6c888] uppercase text-shadow-heavy transform -skew-x-12 text-center leading-none px-0.5 w-full break-words whitespace-pre-wrap`}>
                        {card.name}
                    </span>
                 </div>
             </div>

             {/* 5. Text Body (Bottom 45%) */}
             <div className={`flex-1 ${theme.bodyBg} relative flex flex-col items-center ${bodyPadding} text-center ${small ? 'rounded-b-sm lg:rounded-b-md' : 'rounded-b-md lg:rounded-b-lg'}`}>
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] opacity-50 mix-blend-multiply rounded-b-lg"></div>
                
                {/* Type Line */}
                <div className="relative z-10 flex items-center gap-1 lg:gap-1.5 2xl:gap-2 opacity-80 w-full justify-center">
                    <div className="h-[1px] flex-1 bg-current opacity-30"></div>
                    <span className={`${typeSize} font-sans font-bold ${theme.textColor} flex items-center gap-0.5 lg:gap-1 uppercase whitespace-nowrap`}>
                       {!small && <IconComp size={10} className="hidden 2xl:block" />} {card.type}
                    </span>
                    <div className="h-[1px] flex-1 bg-current opacity-30"></div>
                </div>

                {/* Description Text */}
                <div className="flex-1 flex items-center justify-center w-full overflow-hidden">
                    <p className={`font-body font-semibold ${descSize} ${theme.textColor} relative z-10 drop-shadow-sm`}>
                      {card.description}
                    </p>
                </div>
                
                <IconComp className={`absolute ${iconWatermarkSize} text-black/5 rotate-12 pointer-events-none`} />
             </div>
        </div>

        {/* 6. Holographic Foil */}
        {!disabled && (
            <div 
              className={`absolute inset-0 ${small ? 'rounded-md lg:rounded-lg' : 'rounded-lg lg:rounded-xl'} z-40 pointer-events-none mix-blend-soft-light opacity-50`}
              style={{
                  background: `linear-gradient(${110 + rotate.x * 2}deg, transparent 30%, rgba(255,255,255,0.4) 45%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.4) 55%, transparent 70%)`,
                  backgroundSize: '200% 200%',
                  backgroundPosition: `${glow.x}% ${glow.y}%`
              }}
            ></div>
        )}
      </div>

      {/* Count Badge */}
      {count !== undefined && (
        <div className={`absolute -top-1 -right-1 lg:-top-1.5 lg:-right-1.5 2xl:-top-2 2xl:-right-2 ${countBadgeSize} bg-[#7f1d1d] text-white font-sans font-black flex items-center justify-center rounded-full border-[#450a0a] z-50 shadow-heavy`}>
          {count}
        </div>
      )}
    </button>
  );
};