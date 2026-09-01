import React from 'react';
import { ShieldCheck, Clock, Users, ArrowUpRight } from 'lucide-react';

interface DesktopCockpitScreenProps {
  className?: string;
  multiplier?: number;
}

export const DesktopCockpitScreen: React.FC<DesktopCockpitScreenProps> = ({
  className = '',
  multiplier = 3.15
}) => {
  return (
    <div className={`relative w-full rounded-2xl overflow-hidden bg-[#060a12] border border-cyan-500/40 shadow-2xl font-sans select-none text-slate-100 ${className}`}>
      {/* Top Header Mockup / Multiplier Ribbon */}
      <div className="bg-[#090f1d] border-b border-slate-800/80 px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
        {/* Left Stats Header */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-bold border border-cyan-500/30 flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>TODAS (3)</span>
          </button>
          <span className="text-[11px] text-slate-400 hidden sm:inline font-mono">
            Total: <strong className="text-white">3</strong>
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline font-mono">
            Vol: <strong className="text-cyan-400">85.00 $</strong>
          </span>
        </div>

        {/* Multipliers History Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 text-[11px] font-mono font-bold">
          <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">45.39x</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">32.45x</span>
          <span className="px-2 py-0.5 rounded-md bg-blue-950/80 text-cyan-300 border border-blue-800/60">1.00x</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">31.62x</span>
          <span className="px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">2.23x</span>
          <span className="px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">2.68x</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">38.63x</span>
          <span className="px-2 py-0.5 rounded-md bg-blue-950/80 text-cyan-300 border border-blue-800/60">1.00x</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">36.62x</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">40.15x</span>
          <button className="p-1 rounded-md bg-slate-800/80 text-slate-400 hover:text-white">
            <Clock className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar + Canvas Arena */}
      <div className="grid grid-cols-12 gap-0 min-h-[300px] sm:min-h-[340px]">
        {/* Left Live Bets Column */}
        <div className="col-span-4 sm:col-span-3 bg-[#070c17] border-r border-slate-800/80 p-2.5 flex flex-col justify-between hidden xs:flex">
          <div className="space-y-2">
            <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pb-1 border-b border-slate-800">
              <span>Apostador</span>
              <span>Saque</span>
            </div>

            {/* Bet 1 */}
            <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1 text-[11px]">
                  🤖 CyberFalcon
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-black px-1.5 py-0.5 rounded bg-emerald-900/60">
                  @1.29x
                </span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] font-mono">
                <span className="text-slate-400">25.00 $</span>
                <span className="text-emerald-400 font-bold">+32.25 $</span>
              </div>
            </div>

            {/* Bet 2 */}
            <div className="p-2 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1 text-[11px]">
                  👾 NeoPilot
                </span>
                <span className="text-[10px] font-mono text-cyan-300 font-bold px-1.5 py-0.5 rounded bg-cyan-900/40">
                  @3.15x
                </span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] font-mono">
                <span className="text-slate-400">50.00 $</span>
                <span className="text-cyan-300 font-bold">157.50 $</span>
              </div>
            </div>

            {/* Bet 3 */}
            <div className="p-2 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1 text-[11px]">
                  🤠 Stratosphere
                </span>
                <span className="text-[10px] font-mono text-blue-300 font-bold px-1.5 py-0.5 rounded bg-blue-900/40">
                  @3.15x
                </span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] font-mono">
                <span className="text-slate-400">10.00 $</span>
                <span className="text-blue-300 font-bold">31.50 $</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono flex items-center justify-between">
            <span>Ao Vivo</span>
            <span className="text-emerald-400 font-bold">● Conectado</span>
          </div>
        </div>

        {/* Center Flight Canvas with 3.15x Multiplier */}
        <div className="col-span-12 xs:col-span-8 sm:col-span-9 relative bg-gradient-to-b from-[#0a101f] via-[#060a14] to-[#04060c] p-4 sm:p-6 flex flex-col justify-between overflow-hidden">
          {/* Asteroids & Stars Background Graphic */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Asteroids */}
            <div className="absolute top-12 right-20 w-44 h-24 bg-gradient-to-br from-slate-700 to-slate-900 rounded-[60px] opacity-70 blur-[1px] transform rotate-12" />
            <div className="absolute bottom-8 right-8 w-56 h-32 bg-gradient-to-tr from-slate-800 to-slate-700 rounded-[80px] opacity-80" />
            <div className="absolute bottom-4 left-16 w-48 h-24 bg-gradient-to-r from-slate-800 to-slate-900 rounded-[70px] opacity-75" />
            
            {/* Pixel Stars */}
            <div className="absolute top-6 left-1/4 w-1.5 h-1.5 bg-cyan-300 opacity-80" />
            <div className="absolute top-16 left-1/2 w-2 h-2 bg-white opacity-90 shadow-cyan-400" />
            <div className="absolute top-28 right-1/3 w-1.5 h-1.5 bg-sky-200 opacity-70" />
            <div className="absolute bottom-20 left-1/3 w-2 h-2 bg-cyan-400 opacity-60" />
            <div className="absolute top-36 left-12 w-1.5 h-1.5 bg-blue-300 opacity-80" />
            <div className="absolute top-8 right-12 w-1 h-1 bg-white opacity-90" />
          </div>

          {/* Top HUD Badges */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0c1626]/80 border border-cyan-500/40 text-[11px] text-cyan-300 backdrop-blur-md">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold font-mono">Provably Fair</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-[11px] text-emerald-300 font-mono font-bold backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>EM VOO</span>
            </div>
          </div>

          {/* Big Center Flying Plane & Multiplier 3.15x */}
          <div className="relative z-10 my-auto text-center flex flex-col items-center justify-center py-4">
            <div className="relative flex items-center justify-center">
              <span className="font-cyber font-black text-6xl sm:text-7xl text-white tracking-tight drop-shadow-[0_0_35px_rgba(255,255,255,0.4)]">
                {multiplier.toFixed(2)}
              </span>
              <span className="font-cyber font-black text-4xl sm:text-5xl text-rose-500 ml-1 drop-shadow-[0_0_25px_rgba(244,63,94,0.6)]">
                x
              </span>
            </div>

            {/* Flying Skybird Plane Silhouette */}
            <div className="mt-2 relative">
              <div className="w-12 h-6 relative flex items-center justify-center">
                {/* Plane Body */}
                <div className="w-6 h-6 bg-amber-500 rounded-sm transform rotate-45 border-2 border-white shadow-lg shadow-cyan-500/50" />
                {/* Left Wing */}
                <div className="absolute -left-6 w-7 h-1.5 bg-cyan-400 rounded-full transform -rotate-12 shadow-md shadow-cyan-400" />
                {/* Right Wing */}
                <div className="absolute -right-6 w-7 h-1.5 bg-cyan-400 rounded-full transform rotate-12 shadow-md shadow-cyan-400" />
              </div>
              <div className="w-16 h-1 bg-cyan-400/40 blur-[2px] mx-auto mt-2" />
            </div>
          </div>

          {/* Canvas Bottom Sub-bar */}
          <div className="relative z-10 flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-white/5">
            <span>SKYBIRD ENGINE v2.6</span>
            <span>RTP: 97.0%</span>
          </div>
        </div>
      </div>

      {/* Bottom Betting Bar Controller */}
      <div className="bg-[#090f1d] border-t border-slate-800 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left tabs & Amount Selector */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <span className="px-3 py-1 rounded-md bg-cyan-500/20 text-cyan-300 text-xs font-bold">
              APOSTA
            </span>
            <span className="px-3 py-1 rounded-md text-slate-400 text-xs">
              AUTO
            </span>
          </div>

          {/* Stepper with $25 */}
          <div className="flex items-center bg-slate-900 rounded-xl border border-slate-800 px-2 py-1 flex-1 sm:flex-initial">
            <span className="text-slate-400 text-xs px-1">$</span>
            <span className="font-mono font-bold text-white text-base px-3">25</span>
          </div>

          {/* Quick chips */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <span className="px-2 py-1 rounded bg-slate-800/80">2</span>
            <span className="px-2 py-1 rounded bg-slate-800/80">5</span>
            <span className="px-2 py-1 rounded bg-slate-800/80">10</span>
            <span className="px-2 py-1 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-500/30">25</span>
            <span className="px-2 py-1 rounded bg-slate-800/80">50</span>
          </div>
        </div>

        {/* Big Blue Queue Action Button */}
        <div className="w-full sm:w-72">
          <div className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#0284c7] via-[#0369a1] to-[#075985] border border-sky-400/50 shadow-lg shadow-sky-950/50 flex flex-col items-center justify-center cursor-pointer">
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-sky-100">
              APOSTAR (PRÓX. RODADA)
            </span>
            <span className="text-base font-black font-sans leading-none text-white mt-0.5">
              25.00 $
            </span>
            <span className="text-[9px] text-sky-200 font-medium">
              Voo atual em andamento
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
