import React from 'react';
import { AltitudeStage, GameRoundStatus } from '../../types';
import { ShieldCheck, PlaneTakeoff } from 'lucide-react';

import { RoundTimeline } from '../../services/authoritativeGame';

interface MultiplierDisplayProps {
  status: GameRoundStatus;
  multiplier: number;
  crashPoint: number;
  altitudeStage: AltitudeStage;
  timeline?: RoundTimeline | null;
  cashedOutMultiplier: number | null;
  cashedOutPayout: number | null;
  onOpenFairness: () => void;
}

export const MultiplierDisplay: React.FC<MultiplierDisplayProps> = ({
  status,
  multiplier,
  crashPoint,
  timeline,
  cashedOutMultiplier,
  cashedOutPayout,
  onOpenFairness,
}) => {
  // Progress bar & seconds derived purely from authoritative timeline
  const fillPct = (status === 'WAITING' || status === 'COUNTDOWN') && timeline
    ? Math.min(100, Math.max(0, timeline.progress * 100))
    : 0;
  const secLeft = timeline?.countdownSeconds ?? 0;

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
              <span>DECOLAGEM EM {secLeft}s</span>
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

      {/* Center Display */}
      <div className="flex flex-col items-center justify-center my-auto text-center">

        {/* WAITING or COUNTDOWN — local timer progress bar */}
        {(status === 'WAITING' || status === 'COUNTDOWN') && (
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="flex items-center gap-2 text-slate-200">
              <PlaneTakeoff className="w-5 h-5 text-red-500 animate-pulse" />
              <span className="text-xs font-bold tracking-widest uppercase">
                AGUARDE A PRÓXIMA RODADA
              </span>
            </div>
            {/* Real fill bar */}
            <div className="w-64 sm:w-80 h-3 bg-[#0e131d] rounded-full overflow-hidden border border-[#233045] p-0.5 shadow-2xl">
              <div
                className="h-full bg-gradient-to-r from-red-700 via-red-500 to-rose-400 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.8)] transition-all"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <span className="text-xs font-mono text-slate-400 font-semibold">
              Decolagem em {secLeft}s...
            </span>
          </div>
        )}

        {/* RUNNING — live multiplier */}
        {status === 'RUNNING' && (
          <div className="flex flex-col items-center">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-sans font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
              {multiplier.toFixed(2)}
              <span className="text-4xl sm:text-5xl lg:text-6xl text-red-500 ml-1">x</span>
            </div>
          </div>
        )}

        {/* CRASHED */}
        {status === 'CRASHED' && (
          <div className="flex flex-col items-center animate-scale-in space-y-1">
            <span className="text-sm sm:text-base font-black tracking-widest text-red-500 uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.7)]">
              VOOU PARA LONGE!
            </span>
            <div className="text-5xl sm:text-6xl lg:text-7xl font-sans font-black text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">
              {crashPoint.toFixed(2)}
              <span className="text-3xl sm:text-4xl text-red-400 ml-1">x</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="w-full flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>SKYBIRD ENGINE v2.6</span>
        <span>RTP: 97.0%</span>
      </div>
    </div>
  );
};
