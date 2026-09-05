import React, { useState, useEffect } from 'react';
import { GameRoundStatus } from '../../types';
import { Minus, Plus, Zap, CheckCircle2 } from 'lucide-react';
import { audioManager } from '../../services/audioManager';
import { useTranslation } from '../../services/i18n';

interface BettingPanelProps {
  panelId: number;
  status: GameRoundStatus;
  currentMultiplier: number;
  userBalance: number;
  hasActiveBet: boolean;
  betAmount: number;
  isQueued?: boolean;
  queuedAmount?: number;
  hasCashedOut: boolean;
  cashedOutMultiplier: number | null;
  cashedOutPayout: number | null;
  currency?: 'USD';
  autoBetEnabled: boolean;
  onToggleAutoBet: (enabled: boolean) => void;
  autoCashOutEnabled: boolean;
  onToggleAutoCashOut: (enabled: boolean) => void;
  autoCashOutMultiplier: number;
  onChangeAutoCashOutMultiplier: (value: number) => void;
  onPlaceBet: (amount: number, autoCashOut: number | null, panelId: number) => void;
  onCancelBet?: (panelId: number) => void;
  onCancelQueuedBet?: (panelId: number) => void;
  onCashOut: (panelId: number) => void;
  onOpenDeposit: () => void;
  onRemovePanel?: () => void;
}

export const BettingPanel: React.FC<BettingPanelProps> = ({
  panelId,
  status,
  currentMultiplier,
  userBalance,
  hasActiveBet,
  betAmount,
  isQueued = false,
  queuedAmount = 0,
  hasCashedOut,
  cashedOutMultiplier,
  cashedOutPayout,
  currency = 'USD',
  autoBetEnabled,
  onToggleAutoBet,
  autoCashOutEnabled,
  onToggleAutoCashOut,
  autoCashOutMultiplier,
  onChangeAutoCashOutMultiplier,
  onPlaceBet,
  onCancelBet,
  onCancelQueuedBet,
  onCashOut,
  onOpenDeposit,
  onRemovePanel
}) => {
  const { t } = useTranslation();
  const [betMode, setBetMode] = useState<'manual' | 'auto'>('manual');
  const [rawInput, setRawInput] = useState<string>('25');
  const [rawAutoMult, setRawAutoMult] = useState<string>(autoCashOutMultiplier ? autoCashOutMultiplier.toString() : '2.0');

  useEffect(() => {
    setRawAutoMult(autoCashOutMultiplier ? autoCashOutMultiplier.toString() : '2.0');
  }, [autoCashOutMultiplier]);

  const inputAmount = parseFloat(rawInput) || 0;

  // Quick preset buttons (USD)
  const quickAmounts = [2, 5, 10, 25, 50];
  const currencySymbol = '$';

  const handleQuickSelect = (amt: number) => {
    audioManager.playButtonClick();
    setRawInput(amt.toString());
  };

  const handleIncrement = (delta: number) => {
    audioManager.playButtonClick();
    const step = 1;
    const current = parseFloat(rawInput) || 0;
    const updated = Math.max(0.50, Math.round((current + delta * step) * 100) / 100);
    setRawInput(updated.toString());
  };

  const isInputDisabled = (hasActiveBet && status !== 'CRASHED') || status === 'RUNNING';

  const handleBetSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const amt = parseFloat(rawInput) || 0;
    if (amt <= 0 || amt > userBalance) return;
    onPlaceBet(amt, autoCashOutEnabled ? autoCashOutMultiplier : null, panelId);
  };

  const currentPayout = (betAmount * currentMultiplier).toFixed(2);

  return (
    <div className="w-full bg-[#141923] border border-[#232c3d] rounded-xl p-2.5 sm:p-3 flex flex-col gap-2 shadow-lg select-none">
      {/* Top Header Row: Mode Tabs & Auto Toggles */}
      <div className="flex items-center justify-between">
        {/* Manual / Auto Tabs */}
        <div className="flex items-center bg-[#0d1118] p-0.5 rounded-lg border border-[#212a3b]">
          <button
            type="button"
            onClick={() => {
              audioManager.playButtonClick();
              setBetMode('manual');
            }}
            className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase transition cursor-pointer ${
              betMode === 'manual'
                ? 'bg-[#252f42] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('game.manualMode', 'Manual')}
          </button>
          <button
            type="button"
            onClick={() => {
              audioManager.playButtonClick();
              setBetMode('auto');
            }}
            className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase transition cursor-pointer ${
              betMode === 'auto'
                ? 'bg-[#252f42] text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('game.autoMode', 'Auto')}
          </button>
        </div>

        {/* Panel label & Remove button if secondary */}
        <div className="flex items-center gap-2">
          {autoBetEnabled && (
            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AUTO ON
            </span>
          )}
          <span className="text-[10px] font-mono uppercase text-slate-500 font-bold">
            {t('game.round', 'Painel')} {panelId}
          </span>
          {onRemovePanel && (
            <button
              type="button"
              onClick={onRemovePanel}
              title={t('game.removePanel', 'Remover Painel')}
              className="text-slate-500 hover:text-red-400 text-xs px-1 hover:bg-[#1f2838] rounded cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Controls Grid: Left Inputs & Right Huge Aviator Button */}
      <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-center">
        {/* Left Inputs Section (Col 7 on desktop) */}
        <div className="col-span-7 sm:col-span-7 flex flex-col gap-1 sm:gap-1.5">
          {/* Stepper Input */}
          <div className="flex items-center bg-[#0b0e14] border border-[#222a3a] rounded-lg p-0.5 sm:p-1">
            <button
              type="button"
              onClick={() => handleIncrement(-1)}
              disabled={isInputDisabled}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded bg-[#18202d] hover:bg-[#222c3e] text-slate-300 hover:text-white font-bold transition disabled:opacity-40 cursor-pointer"
            >
              <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>

            <div className="flex-1 flex items-center justify-center px-1 sm:px-2">
              <span className="text-slate-400 font-bold mr-0.5 sm:mr-1 text-xs sm:text-sm font-sans">
                {currencySymbol}
              </span>
              <input
                type="number"
                min={0.50}
                max={5000}
                step={0.50}
                value={rawInput}
                disabled={isInputDisabled}
                onChange={(e) => setRawInput(e.target.value)}
                onBlur={() => {
                  const val = parseFloat(rawInput);
                  if (isNaN(val) || val < 0.50) setRawInput('0.50');
                }}
                className="w-full bg-transparent text-center font-mono font-bold text-xs sm:text-base text-white outline-none disabled:opacity-50"
              />
            </div>

            <button
              type="button"
              onClick={() => handleIncrement(1)}
              disabled={isInputDisabled}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded bg-[#18202d] hover:bg-[#222c3e] text-slate-300 hover:text-white font-bold transition disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>

          {/* Quick Preset Buttons (Optimized for small mobile displays) */}
          <div className="grid grid-cols-5 gap-0.5 sm:gap-1">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handleQuickSelect(amt)}
                disabled={isInputDisabled}
                className={`py-0.5 sm:py-1 rounded bg-[#0e1219] hover:bg-[#1b2332] border text-[10px] sm:text-[11px] font-mono font-bold transition disabled:opacity-40 cursor-pointer text-center ${
                  inputAmount === amt
                    ? 'border-cyan-500/60 text-cyan-300 bg-[#162232]'
                    : 'border-[#202837] text-slate-400 hover:text-slate-200'
                }`}
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Right Section: Giant Aviator Action Button (Col 5) */}
        <div className="col-span-5 sm:col-span-5 flex flex-col h-full justify-center">
          {/* STATE 1: RUNNING AND HAS ACTIVE BET -> BIG CASHOUT BUTTON */}
          {hasActiveBet && !hasCashedOut && status === 'RUNNING' ? (
            <button
              id={`btn-cashout-panel-${panelId}`}
              type="button"
              onClick={() => onCashOut(panelId)}
              className="w-full h-full min-h-[72px] rounded-xl bg-gradient-to-b from-[#eab308] via-[#ca8a04] to-[#a16207] hover:from-[#facc15] hover:to-[#ca8a04] active:scale-[0.98] text-slate-950 font-black border border-[#fef08a]/60 shadow-lg shadow-amber-950/50 flex flex-col items-center justify-center p-2 transition cursor-pointer animate-pulse"
            >
              <span className="text-xs uppercase tracking-wider font-extrabold text-slate-900">
                {t('game.cashout', 'SACAR')}
              </span>
              <span className="text-lg sm:text-xl font-black font-sans leading-none mt-0.5">
                {currentPayout} {currencySymbol}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-900/80">
                @{currentMultiplier.toFixed(2)}x
              </span>
            </button>
          ) : hasCashedOut ? (
            /* STATE 2: CASHED OUT CONFIRMATION */
            <div className="w-full h-full min-h-[72px] rounded-xl bg-[#0d2a1c] border border-emerald-500/50 flex flex-col items-center justify-center p-2 text-center shadow-inner">
              <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                {t('game.cashedOut', 'LUCRO SACADO!')}
              </span>
              <span className="text-base sm:text-lg font-black text-white leading-none mt-0.5">
                +{cashedOutPayout?.toFixed(2)} {currencySymbol}
              </span>
              <span className="text-[10px] font-mono text-emerald-300/80">
                @{cashedOutMultiplier?.toFixed(2)}x
              </span>
            </div>
          ) : hasActiveBet && status === 'CRASHED' ? (
            /* STATE 2B: CRASHED LOSS CONFIRMATION */
            <div className="w-full h-full min-h-[72px] rounded-xl bg-[#2a0d0d] border border-red-500/50 flex flex-col items-center justify-center p-2 text-center shadow-inner">
              <span className="text-[10px] uppercase font-bold text-red-400 flex items-center gap-1">
                {t('game.crashed', 'RODADA CRASHOU!')}
              </span>
              <span className="text-sm font-mono text-red-300 font-bold mt-0.5">
                {betAmount.toFixed(2)} {currencySymbol}
              </span>
            </div>
          ) : hasActiveBet && (status === 'COUNTDOWN' || status === 'WAITING') ? (
            /* STATE 3: BET PLACED WAITING FOR TAKEOFF -> CANCEL BUTTON */
            <button
              id={`btn-cancel-panel-${panelId}`}
              type="button"
              onClick={() => onCancelBet?.(panelId)}
              className="w-full h-full min-h-[72px] rounded-xl bg-[#881337] hover:bg-[#9f1239] text-rose-100 font-black border border-rose-500/40 shadow-lg flex flex-col items-center justify-center p-2 transition cursor-pointer"
            >
              <span className="text-xs uppercase tracking-wider font-bold">
                {t('game.cancelBet', 'CANCELAR APOSTA')}
              </span>
              <span className="text-sm font-mono mt-0.5 font-bold">
                {betAmount.toFixed(2)} {currencySymbol}
              </span>
              <span className="text-[9px] text-rose-300 font-normal">
                {t('game.waiting', 'Pronto para Decolagem')}
              </span>
            </button>
          ) : isQueued ? (
            /* STATE 4: QUEUED FOR NEXT ROUND -> CANCEL QUEUE BUTTON */
            <button
              id={`btn-cancel-queue-panel-${panelId}`}
              type="button"
              onClick={() => onCancelQueuedBet?.(panelId)}
              className="w-full h-full min-h-[72px] rounded-xl bg-[#7c2d12] hover:bg-[#9a3412] text-amber-100 font-black border border-amber-500/40 shadow-lg flex flex-col items-center justify-center p-2 transition cursor-pointer"
            >
              <span className="text-xs uppercase tracking-wider font-bold">
                {t('game.cancelBet', 'CANCELAR')}
              </span>
              <span className="text-sm font-mono mt-0.5 font-bold text-amber-200">
                {queuedAmount.toFixed(2)} {currencySymbol}
              </span>
              <span className="text-[9px] text-amber-300 font-normal">
                {t('game.waiting', 'Agendada p/ Próx. Rodada')}
              </span>
            </button>
          ) : status === 'RUNNING' ? (
            /* STATE 5: FLIGHT IS RUNNING -> SCHEDULE FOR NEXT ROUND */
            <button
              id={`btn-queue-panel-${panelId}`}
              type="button"
              onClick={() => handleBetSubmit()}
              disabled={userBalance < inputAmount}
              className={`w-full h-full min-h-[72px] rounded-xl font-black shadow-lg flex flex-col items-center justify-center p-2 transition cursor-pointer ${
                userBalance < inputAmount
                  ? 'bg-[#1a2332] text-slate-500 border border-[#28364c] cursor-not-allowed'
                  : 'bg-gradient-to-b from-[#0284c7] via-[#0369a1] to-[#075985] hover:from-[#38bdf8] hover:to-[#0284c7] text-white border border-sky-400/50 shadow-sky-950/40 active:scale-[0.98]'
              }`}
            >
              <span className="text-xs uppercase tracking-wider font-extrabold text-sky-100">
                {t('game.bet', 'APOSTAR')} ({t('game.round', 'PRÓX.')})
              </span>
              <span className="text-base sm:text-lg font-black font-sans leading-none mt-0.5">
                {(inputAmount || 0).toFixed(2)} {currencySymbol}
              </span>
              <span className="text-[9px] text-sky-200 font-medium">
                {t('game.flying', 'Voo em andamento')}
              </span>
            </button>
          ) : (
            /* STATE 6: READY TO BET (WAITING/COUNTDOWN) -> BIG GREEN AVIATOR BUTTON */
            <button
              id={`btn-bet-panel-${panelId}`}
              type="button"
              onClick={() => handleBetSubmit()}
              disabled={inputAmount <= 0 || userBalance < inputAmount}
              className={`w-full h-full min-h-[72px] rounded-xl font-black shadow-lg flex flex-col items-center justify-center p-2 transition cursor-pointer ${
                inputAmount <= 0 || userBalance < inputAmount
                  ? 'bg-[#1a2332] text-slate-500 border border-[#28364c] cursor-not-allowed'
                  : 'bg-gradient-to-b from-[#22c55e] via-[#16a34a] to-[#15803d] hover:from-[#4ade80] hover:to-[#16a34a] active:scale-[0.98] text-white border border-[#86efac]/50 shadow-emerald-950/40'
              }`}
            >
              <span className="text-xs uppercase tracking-wider font-extrabold">
                {t('game.bet', 'APOSTA')}
              </span>
              <span className="text-base sm:text-lg font-black font-sans leading-none mt-0.5">
                {(inputAmount || 0).toFixed(2)} {currencySymbol}
              </span>
              {userBalance < inputAmount && (
                <span className="text-[9px] text-amber-400 font-medium mt-0.5">
                  {t('game.balance', 'Saldo')}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Auto Settings Bar (when Auto mode is active) */}
      {betMode === 'auto' && (
        <div className="pt-2 border-t border-[#1f2838] flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Auto Bet Toggle */}
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoBetEnabled}
              onChange={(e) => onToggleAutoBet(e.target.checked)}
              className="rounded bg-[#0d1118] border-[#252f42] text-emerald-500 focus:ring-0 w-3.5 h-3.5"
            />
            <span className={`text-[11px] font-medium ${autoBetEnabled ? 'text-emerald-400 font-bold' : ''}`}>
              {t('game.autoBet', 'Auto Aposta')}
            </span>
          </label>

          {/* Auto Cashout Multiplier */}
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCashOutEnabled}
                onChange={(e) => onToggleAutoCashOut(e.target.checked)}
                className="rounded bg-[#0d1118] border-[#252f42] text-cyan-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className={`text-[11px] font-medium ${autoCashOutEnabled ? 'text-cyan-300 font-bold' : ''}`}>
                {t('game.autoCashOut', 'Auto Saque')}
              </span>
            </label>

            {autoCashOutEnabled && (
              <div className="flex items-center bg-[#0b0e14] border border-[#252f42] rounded px-1.5 py-0.5">
                <input
                  type="number"
                  min={1.05}
                  max={100}
                  step={0.1}
                  value={rawAutoMult}
                  onChange={(e) => {
                    setRawAutoMult(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 1.01) {
                      onChangeAutoCashOutMultiplier(Math.min(100, val));
                    }
                  }}
                  onBlur={() => {
                    const val = parseFloat(rawAutoMult);
                    if (isNaN(val) || val < 1.05) {
                      setRawAutoMult('1.05');
                      onChangeAutoCashOutMultiplier(1.05);
                    }
                  }}
                  className="w-12 bg-transparent text-right font-mono font-bold text-xs text-cyan-300 outline-none"
                />
                <span className="text-cyan-400 font-mono text-xs ml-0.5">x</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
