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

const isPresentationBot = (bet: Bet) => bet.userId?.startsWith('bot-') || bet.id?.startsWith('bot-');

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
  // Simulated BOT activity vs Real user bets separation
  const realBets = bets.filter((bet) => !isPresentationBot(bet));
  const botBets = bets.filter((bet) => isPresentationBot(bet));
  
  const totalRealBetsAmount = realBets.reduce((acc, b) => acc + b.amount, 0);
  const totalRealPayoutAmount = realBets.reduce((acc, b) => {
    if (b.status === 'cashed_out' && b.payout) return acc + b.payout;
    return acc;
  }, 0);

  const totalBotBetsAmount = botBets.reduce((acc, b) => acc + b.amount, 0);
  const totalBotPayoutAmount = botBets.reduce((acc, b) => {
    if (b.status === 'cashed_out' && b.payout) return acc + b.payout;
    return acc;
  }, 0);

  const totalRealLostAmount = realBets.reduce((acc, b) => {
    if (b.status === 'crashed') return acc + b.amount;
    return acc;
  }, 0);

  const totalBotLostAmount = botBets.reduce((acc, b) => {
    if (b.status === 'crashed') return acc + b.amount;
    return acc;
  }, 0);

  // Lucro da Casa = Total Apostado por Utilizadores Reais - Total Pago aos Utilizadores Reais
  // Se for positivo, a casa lucrou. Se for negativo, os jogadores lucraram.
  const houseProfit = totalRealBetsAmount - totalRealPayoutAmount;

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
          <div className="px-3 py-2 bg-[#0a0d13] border-b border-[#1b2230] flex flex-col gap-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>Participantes: {bets.length}</span>
              <div className="flex items-center gap-3">
                <span>
                  Vol. Real: <strong className="text-cyan-400 font-bold">{totalRealBetsAmount.toFixed(2)}{currencySymbol}</strong>
                </span>
                <span>
                  Lucro Casa: <strong className={houseProfit >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {houseProfit >= 0 ? `+${houseProfit.toFixed(2)}` : houseProfit.toFixed(2)}{currencySymbol}
                  </strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex flex-col bg-emerald-950/20 border border-emerald-500/20 rounded p-1.5">
                <div className="flex justify-between items-center text-emerald-400 font-bold">
                  <span>Apostado Real:</span>
                  <span>{totalRealBetsAmount.toFixed(2)}{currencySymbol}</span>
                </div>
                <div className="flex justify-between items-center text-rose-400 text-[9px] mt-0.5">
                  <span>Perdido Real:</span>
                  <span>{totalRealLostAmount.toFixed(2)}{currencySymbol}</span>
                </div>
              </div>

              <div className="flex flex-col bg-slate-900/40 border border-slate-700/40 rounded p-1.5">
                <div className="flex justify-between items-center text-slate-300 font-bold">
                  <span>Vol. Bots:</span>
                  <span>{totalBotBetsAmount.toFixed(2)}{currencySymbol}</span>
                </div>
                <div className="flex justify-between items-center text-rose-400/80 text-[9px] mt-0.5">
                  <span>Perdido Bots:</span>
                  <span>{totalBotLostAmount.toFixed(2)}{currencySymbol}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[300px] sm:max-h-[380px] p-1.5 space-y-1 scrollbar-thin">
            {bets.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-mono">
                Aguardando apostas para a rodada...
              </div>
            ) : (
              bets.map((bet) => {
                const isCashed = bet.status === 'cashed_out';
                const isCrashed = bet.status === 'crashed';
                const displayName = bet.userName.replace(/^BOT\s*•\s*/i, '');

                return (
                  <div
                    key={bet.id}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between transition-all duration-300 transform animate-in fade-in slide-in-from-top-1 ${
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
                        alt={displayName}
                        className="w-5 h-5 rounded-full bg-slate-800 object-cover"
                      />
                      <div className="flex flex-col">
                        <span className={`font-semibold text-[11px] ${bet.isCurrentUser ? 'text-cyan-300 font-bold' : 'text-slate-300'}`}>
                          {displayName} {bet.isCurrentUser && '(Você)'}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">
                          {bet.amount.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCashed ? (
                        <div className="flex flex-col items-end">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[10px]">
                            @{bet.cashOutMultiplier?.toFixed(2)}x
                          </span>
                          <span className="text-emerald-300 font-bold font-mono text-xs mt-0.5">+{bet.payout?.toFixed(2)} {currencySymbol}</span>
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
                          <span className="text-cyan-400 font-bold font-mono text-xs mt-0.5">{(bet.amount * currentMultiplier).toFixed(2)} {currencySymbol}</span>
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
          {topWinners.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono">
              Nenhum grande vencedor registrado nesta sessão ainda.
            </div>
          ) : (
            topWinners.map((winner, idx) => (
              <div key={winner.id} className="p-2 rounded-lg bg-[#141923] border border-[#263143] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold font-mono text-[10px] flex items-center justify-center border border-amber-500/30">{idx + 1}</span>
                  <img src={winner.userAvatar} alt={winner.userName} className="w-5 h-5 rounded-full bg-slate-800 object-cover" />
                  <div className="flex flex-col"><span className="font-semibold text-slate-200 text-[11px]">{winner.userName}</span><span className="text-[9px] text-slate-500">{winner.date}</span></div>
                </div>
                <div className="flex flex-col items-end"><span className="px-1.5 py-0.5 rounded bg-fuchsia-950 text-fuchsia-300 font-bold font-mono text-[10px] border border-fuchsia-500/30">{winner.multiplier.toFixed(2)}x</span><span className="text-amber-400 font-mono font-bold text-xs mt-0.5">+{winner.payout.toFixed(2)} {currencySymbol}</span></div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
