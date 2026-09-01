import React, { useState } from 'react';
import { GameRound } from '../../types';
import { Clock, ShieldCheck, ChevronDown, Sparkles } from 'lucide-react';

interface RoundHistoryProps {
  rounds: GameRound[];
  onSelectRound: (round: GameRound) => void;
}

export const RoundHistory: React.FC<RoundHistoryProps> = ({ rounds, onSelectRound }) => {
  const [showFullHistory, setShowFullHistory] = useState<boolean>(false);

  // Bantu Bet / Spribe Aviator Color Scheme for History Multipliers:
  // - Blue: < 2.00x
  // - Violet/Purple: 2.00x - 9.99x
  // - Hot Pink / Magenta: 10.00x+
  const getBadgeStyle = (crash: number) => {
    if (crash >= 10.0) {
      return 'bg-[#371329]/90 text-[#f472b6] border-[#8a2259] hover:border-[#f472b6] shadow-sm shadow-pink-950/40';
    }
    if (crash >= 2.0) {
      return 'bg-[#22153b]/90 text-[#c084fc] border-[#58298e] hover:border-[#c084fc] shadow-sm shadow-purple-950/40';
    }
    return 'bg-[#121c2e]/90 text-[#60a5fa] border-[#1e3a6a] hover:border-[#60a5fa]';
  };

  return (
    <div className="relative w-full bg-[#10141d] border-b border-[#212938] px-2 sm:px-3 py-1.5 flex items-center justify-between gap-2 select-none">
      {/* Scrollable Horizontal Multiplier Ribbon */}
      <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        {rounds.slice(0, 24).map((r) => (
          <button
            key={r.id}
            id={`btn-round-${r.roundNumber}`}
            onClick={() => onSelectRound(r)}
            title={`Rodada #${r.roundNumber} (@${r.crashPoint.toFixed(2)}x) - Clique para auditar`}
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold border transition-all shrink-0 cursor-pointer flex items-center gap-1 ${getBadgeStyle(
              r.crashPoint
            )}`}
          >
            <span>{r.crashPoint.toFixed(2)}x</span>
          </button>
        ))}
      </div>

      {/* History Toggle Button */}
      <div className="shrink-0 flex items-center gap-1 border-l border-[#212938] pl-2">
        <button
          id="btn-toggle-full-history"
          type="button"
          onClick={() => setShowFullHistory(!showFullHistory)}
          title="Ver histórico detalhado de rodadas"
          className="p-1 rounded-md bg-[#161c28] hover:bg-[#1f283a] text-slate-400 hover:text-cyan-300 border border-[#252f42] transition cursor-pointer flex items-center gap-1 text-[11px] font-medium"
        >
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <ChevronDown className={`w-3 h-3 transition-transform ${showFullHistory ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded Multiplier History Modal / Dropdown */}
      {showFullHistory && (
        <div className="absolute top-full left-0 right-0 z-30 bg-[#0e121a] border border-[#263143] rounded-b-xl shadow-2xl p-3 animate-fade-in backdrop-blur-xl max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-[#212938] mb-2 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Histórico Recente de Coeficientes
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Últimas {rounds.length} rodadas
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {rounds.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  onSelectRound(r);
                  setShowFullHistory(false);
                }}
                className={`p-2 rounded-lg text-xs font-mono font-bold border transition text-center flex flex-col items-center gap-0.5 cursor-pointer ${getBadgeStyle(
                  r.crashPoint
                )}`}
              >
                <span>{r.crashPoint.toFixed(2)}x</span>
                <span className="text-[9px] font-normal text-slate-400">#{r.roundNumber}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
