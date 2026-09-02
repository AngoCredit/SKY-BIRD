import React from 'react';
import { AltitudeStage, GameRoundStatus } from '../../types';
import { ShieldCheck, Sparkles, PlaneTakeoff } from 'lucide-react';

interface MultiplierDisplayProps {
  status: GameRoundStatus;
  multiplier: number;
  crashPoint: number;
  altitudeStage: AltitudeStage;
  countdown: number;
  cashedOutMultiplier: number | null;
  cashedOutPayout: number | null;
  onOpenFairness: () => void;
}

export const MultiplierDisplay: React.FC<MultiplierDisplayProps> = ({
  status,
  multiplier,
  crashPoint,
  countdown,
  cashedOutMultiplier,
  cashedOutPayout,
  onOpenFairness
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-3 sm:p-4 z-10 select-none">
      {/* Top Bar inside Canvas */}
      <div className="w-full flex items-center justify-between pointer-events-auto">
        {/* Provably Fair Badge */}
        <button
          id="btn-open-fairness-hud"
          onClick={onOpenFairness}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#101520]/80 hover:bg-[#182132] border border-[#233045] text-[11px] font-mono text-slate-400 hover:text-cyan-300 transition cursor-pointer backdrop-blur-md"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Provably Fair</span>
        </button>

        {/* Status Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#101520]/80 border border-[#233045] text-[11px] font-mono text-slate-300 backdrop-blur-md">
          {status === 'RUNNING' ? (
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>EM VOO</span>
            </div>
          ) : status === 'COUNTDOWN' ? (
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>DECOLAGEM EM {countdown}s</span>
            </div>
          ) : status === 'CRASHED' ? (
            <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>ENCERRADO</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
              <span>AGUARDANDO</span>
            </div>
          )}
        </div>
      </div>

      {/* Center Aviator Multiplier Display */}
      <div className="flex flex-col items-center justify-center my-auto text-center">
        {status === 'COUNTDOWN' && (
          <div className="flex flex-col items-center animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <PlaneTakeoff className="w-5 h-5 text-red-500 animate-bounce" />
              <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                ESPERANDO A PRÓXIMA RODADA
              </span>
            </div>
            <div className="w-48 sm:w-60 h-2 bg-[#171d2a] rounded-full overflow-hidden border border-[#263348] p-0.5">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, ((5 - countdown) / 5) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {status === 'WAITING' && (
          <div className="flex flex-col items-center animate-fade-in text-slate-400 text-xs">
            <span className="uppercase tracking-widest font-semibold text-slate-400 mb-1">
              CONECTANDO AO RADAR
            </span>
            <span className="text-sm font-mono text-cyan-400 animate-pulse">
              Aguardando início...
            </span>
          </div>
        )}

        {status === 'RUNNING' && (
          <div className="flex flex-col items-center">
            {/* Aviator Giant Multiplier Font */}
            <div className="text-6xl sm:text-7xl lg:text-8xl font-sans font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
              {multiplier.toFixed(2)}
              <span className="text-4xl sm:text-5xl lg:text-6xl text-red-500 ml-1">x</span>
            </div>
          </div>
        )}

        {status === 'CRASHED' && (
          <div className="flex flex-col items-center animate-scale-in">
            <span className="text-sm sm:text-base font-black tracking-widest text-red-500 uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.7)] mb-1">
              VOOU PARA LONGE!
            </span>
            <div className="text-5xl sm:text-6xl lg:text-7xl font-sans font-black text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">
              {crashPoint.toFixed(2)}
              <span className="text-3xl sm:text-4xl text-red-400 ml-1">x</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Subtle Overlay */}
      <div className="w-full flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>SKYBIRD ENGINE v2.6</span>
        <span>RTP: 97.0%</span>
      </div>
    </div>
  );
};
