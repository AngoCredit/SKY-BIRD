import React, { useState } from 'react';
import { Bet } from '../../types';
import { Users, User as UserIcon, Trophy, TrendingUp } from 'lucide-react';
import { store } from '../../services/store';
import { useTranslation } from '../../services/i18n';

interface LiveBetsListProps {
  bets: Bet[];
  currentMultiplier: number;
  currency?: 'USD';
}

const isPresentationBot = (bet: Bet) => bet.userName.startsWith('BOT •');

export const LiveBetsList: React.FC<LiveBetsListProps> = ({
  bets,
  currentMultiplier,
  currency = 'USD'
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'top'>('all');
  const userHistory = store.getUserBetHistory();
  const topWinners = store.getTopWinners();

  // Simulated BOT activity is presentation-only and must never inflate real
  // financial metrics such as betting volume, RTP, GGR or deposits.
  const realBets = bets.filter((bet) => !isPresentationBot(bet));
  const totalRealBetsAmount = realBets.reduce((acc, b) => acc + b.amount, 0);
  const currencySymbol = '$';

  return (
    <div className="w-full bg-[#121620] border border-[#212938] rounded-xl flex flex-col h-full overflow-hidden shadow-lg select-none">
      {/* Aviator Tab Bar: Todas | Minhas | Top */}
      <div className="flex items-center border-b border-[#212938] bg-[#0e121a]">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2.5 px-2 text-center text-xs font-bold uppercase transition flex items-center justify-center gap-1.5 cursor-pointer border-b-2 ${
            activeTab === 'all'
              ? 'border-cyan-400 text-white bg-[#151c2a]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>{t('game.allBets', 'Todas')} ({bets.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('my')}
          className={`flex-1 py-2.5 px-2 text-center text-xs font-bold uppercase transition flex items-center justify-center gap-1.5 cursor-pointer border-b-2 ${
            activeTab === 'my'
              ? 'border-cyan-400 text-white bg-[#151c2a]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          <span>{t('game.myBets', 'Minhas')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('top')}
          className={`flex-1 py-2.5 px-2 text-center text-xs font-bold uppercase transition flex items-center justify-center gap-1.5 cursor-pointer border-b-2 ${
            activeTab === 'top'
              ? 'border-amber-400 text-amber-300 bg-[#151c2a]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>{t('game.topWinners', 'Top')}</span>
        </button>
      </div>

      {/* Tab 1: ALL BETS */}
      {activeTab === 'all' && (
        <div className="flex flex-col flex-1">
          <div className="px-3 py-2 bg-[#0a0d13] border-b border-[#1b2230] flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Participantes: {bets.length}</span>
            <span className="text-cyan-400 font-bold">
              Volume real: {totalRealBetsAmount.toFixed(2)} {currencySymbol}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[300px] sm:max-h-[380px] p-1.5 space-y-1 scrollbar-thin">
            {bets.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-mono">
                Aguardando apostas para a rodada...
              </div>
            ) : (
              bets.map((bet) => {
                const isBot = isPresentationBot(bet);
                const isCashed = bet.status === 'cashed_out';
                const isCrashed = bet.status === 'crashed';

                return (
                  <div
                    key={bet.id}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between transition ${
                      bet.isCurrentUser
                        ? 'bg-[#1b283d] border-cyan-500/50 shadow-sm'
                        : isCashed
                        ? 'bg-[#0f241a] border-emerald-500/30'
                        : isCrashed
                        ? 'bg-[#1e1319] border-rose-500/20 opacity-60'
                        : 'bg-[#131823] border-[#1f2838]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={bet.userAvatar}
                        alt={bet.userName}
                        className="w-5 h-5 rounded-full bg-slate-800 object-cover"
                      />
                      <div className="flex flex-col">
                        <span className={`font-semibold text-[11px] ${bet.isCurrentUser ? 'text-cyan-300 font-bold' : isBot ? 'text-slate-300' : 'text-slate-300'}`}>
                          {bet.userName} {bet.isCurrentUser && '(Você)'}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">
                          {isBot ? 'Participação simulada • não financeira' : `${bet.amount.toFixed(2)} ${currencySymbol}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCashed ? (
                        <div className="flex flex-col items-end">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[10px]">
                            @{bet.cashOutMultiplier?.toFixed(2)}x
                          </span>
                          {!isBot && <span className="text-emerald-300 font-bold font-mono text-xs mt-0.5">+{bet.payout?.toFixed(2)} {currencySymbol}</span>}
                        </div>
                      ) : isCrashed ? (
                        <span className="text-rose-400 text-xs font-mono font-bold">
                          Voou longe
                        </span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold font-mono text-[10px] border border-cyan-500/30">
                            @{currentMultiplier.toFixed(2)}x
                          </span>
                          {!isBot && <span className="text-cyan-400 font-bold font-mono text-xs mt-0.5">{(bet.amount * currentMultiplier).toFixed(2)} {currencySymbol}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: MY BETS */}
      {activeTab === 'my' && (
        <div className="flex-1 overflow-y-auto max-h-[340px] sm:max-h-[420px] p-2 space-y-1.5 scrollbar-thin">
          {userHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono">
              Você ainda não realizou apostas nesta sessão.
            </div>
          ) : (
            userHistory.map((h) => {
              const won = h.status === 'cashed_out';
              return (
                <div key={h.id} className={`p-2 rounded-lg border text-xs flex items-center justify-between ${won ? 'bg-[#0f241a] border-emerald-500/40' : 'bg-[#1a1317] border-rose-500/30'}`}>
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-[11px]">Aposta: {h.amount.toFixed(2)} {currencySymbol}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {won ? (
                      <div className="flex flex-col items-end">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[10px]">@{h.cashOutMultiplier?.toFixed(2)}x</span>
                        <span className="text-emerald-300 font-bold font-mono text-xs mt-0.5">+{h.payout?.toFixed(2)} {currencySymbol}</span>
                      </div>
                    ) : <span className="text-rose-400 text-xs font-mono font-bold">Perdeu</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: TOP */}
      {activeTab === 'top' && (
        <div className="flex-1 overflow-y-auto max-h-[340px] sm:max-h-[420px] p-2 space-y-1.5 scrollbar-thin">
          <div className="text-[11px] text-amber-400/90 font-semibold px-1 pb-1 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />Maiores Multiplicadores Recentes</div>
          {topWinners.map((winner, idx) => (
            <div key={winner.id} className="p-2 rounded-lg bg-[#141923] border border-[#263143] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold font-mono text-[10px] flex items-center justify-center border border-amber-500/30">{idx + 1}</span>
                <img src={winner.userAvatar} alt={winner.userName} className="w-5 h-5 rounded-full bg-slate-800 object-cover" />
                <div className="flex flex-col"><span className="font-semibold text-slate-200 text-[11px]">{winner.userName}</span><span className="text-[9px] text-slate-500">{winner.date}</span></div>
              </div>
              <div className="flex flex-col items-end"><span className="px-1.5 py-0.5 rounded bg-fuchsia-950 text-fuchsia-300 font-bold font-mono text-[10px] border border-fuchsia-500/30">{winner.multiplier.toFixed(2)}x</span><span className="text-amber-400 font-mono font-bold text-xs mt-0.5">+{winner.payout.toFixed(2)} {currencySymbol}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
