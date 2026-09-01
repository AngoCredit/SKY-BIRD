import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowDownRight,
  CheckCircle,
  Clock,
  UserCheck,
  UserX,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { store } from '../../services/store';
import { audioManager } from '../../services/audioManager';
import { useTranslation } from '../../services/i18n';

interface WithdrawalModalProps {
  isOpen: boolean;
  availableBalance: number;
  onClose: () => void;
}

export const WithdrawalModal: React.FC<WithdrawalModalProps> = ({
  isOpen,
  availableBalance,
  onClose
}) => {
  const { t } = useTranslation();
  const currentUser = store.getCurrentUser();
  const [rules, setRules] = useState(store.getWithdrawalRules(currentUser.id));
  const [amount, setAmount] = useState<number>(10);
  const [accountDetails, setAccountDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successRef, setSuccessRef] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const currentU = store.getCurrentUser();
      const currentRules = store.getWithdrawalRules(currentU.id);
      setRules(currentRules);
      setErrorMessage(null);
      setSuccessRef(null);
      const defaultAmt = currentRules.remainingDailyLimit > 0 ? Math.min(10, currentRules.remainingDailyLimit) : 10;
      setAmount(defaultAmt);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (amount < 10) {
      setErrorMessage('O valor mínimo para levantamento é de $10.00 USD.');
      return;
    }

    if (amount > availableBalance) {
      setErrorMessage('Saldo insuficiente para realizar este levantamento.');
      return;
    }

    if (amount > rules.remainingDailyLimit) {
      setErrorMessage(`Limite diário excedido. Limite disponível para hoje: $${rules.remainingDailyLimit.toFixed(2)} USD.`);
      return;
    }

    if (!accountDetails.trim()) {
      setErrorMessage('Por favor, introduza o seu e-mail cadastrado na conta Airtm.');
      return;
    }

    setIsSubmitting(true);
    audioManager.playButtonClick();

    setTimeout(() => {
      try {
        const tx = store.requestWithdrawal(amount, 'Airtm', accountDetails.trim());
        setIsSubmitting(false);
        setSuccessRef(tx.reference);
        const updatedRules = store.getWithdrawalRules(currentUser.id);
        setRules(updatedRules);
        audioManager.playCashOut();
      } catch (err: unknown) {
        setIsSubmitting(false);
        setErrorMessage(err instanceof Error ? err.message : 'Error processing withdrawal.');
      }
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-emerald-950/40 relative">
        <button
          id="btn-close-withdraw"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <ArrowDownRight className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-cyber font-bold text-white">
              {t('wallet.withdrawAirtmTitle', 'LEVANTAMENTO DE SALDO (AIRTM)')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('wallet.withdrawAirtmDesc', 'Retiradas oficiais de 15 a 30 minutos em sua conta Airtm.')}
            </p>
          </div>
        </div>

        {successRef ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto animate-pulse">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-cyber font-bold text-white">
              {t('notif.withdrawRequestedTitle', 'Solicitação de Saque Enviada')}
            </h4>
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 text-xs text-slate-300 space-y-2 text-left">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">{t('game.betAmount', 'Aposta')}:</span>
                <strong className="text-emerald-400 font-mono text-sm">${amount.toFixed(2)} USD</strong>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">{t('wallet.airtmEmail', 'Conta Airtm')}:</span>
                <strong className="text-white font-mono">{accountDetails}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Ref:</span>
                <span className="text-cyan-400 font-mono">{successRef}</span>
              </div>
              <div className="flex items-start gap-2 pt-1 text-amber-300">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-tight">
                  {t('wallet.processingTime', 'Tempo de Crédito: 15 a 30 minutos')}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setSuccessRef(null);
                onClose();
              }}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-cyber font-bold uppercase transition cursor-pointer mt-4"
            >
              {t('wallet.close', 'CONCLUIR')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleWithdrawal} className="space-y-4 text-xs">
            {/* Verification Status & Daily Limit Badge */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {rules.isVerified ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold">
                      <UserCheck className="w-3.5 h-3.5" />
                      Verificado — $500/dia
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-400 text-[11px] font-bold">
                      <UserX className="w-3.5 h-3.5" />
                      Não Verificado — $100/dia
                    </span>
                  )}
                </div>
                {!rules.isVerified && (
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-cyan-500" />
                    Verifique via Carteira
                  </span>
                )}
              </div>

              {/* Daily Limit Bar */}
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>{t('wallet.dailyLimitVerified', 'Limite Diário')}:</span>
                  <span className="font-mono font-semibold text-white">
                    ${rules.usedToday.toFixed(2)} / ${rules.maxDailyLimit.toFixed(2)} USD
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      rules.usedToday >= rules.maxDailyLimit
                        ? 'bg-rose-500'
                        : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (rules.usedToday / rules.maxDailyLimit) * 100)}%`
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>{t('wallet.balanceAvailable', 'Disponível')}:</span>
                  <strong className="text-emerald-400 font-bold">${rules.remainingDailyLimit.toFixed(2)} USD</strong>
                </div>
              </div>
            </div>

            {/* Balance info */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">{t('wallet.balanceAvailable', 'Saldo Disponível')}:</span>
              <span className="font-cyber font-bold text-lg text-emerald-400">
                ${availableBalance.toFixed(2)} USD
              </span>
            </div>

            {/* Amount input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-300 font-semibold">{t('wallet.withdrawAmount', 'Valor do Saque (USD)')}</label>
                <span className="text-slate-400 text-[11px]">{t('wallet.minWithdraw', 'Mínimo: $10.00 USD')}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[10, 25, 50, 100].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setAmount(quick)}
                    className={`py-2 rounded-xl font-mono font-bold text-xs transition cursor-pointer ${
                      amount === quick
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-950 text-slate-300 border border-slate-800'
                    }`}
                  >
                    ${quick}
                  </button>
                ))}
              </div>
              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-emerald-500">
                <span className="text-emerald-400 font-cyber font-bold text-lg mr-2">$</span>
                <input
                  type="number"
                  min={10}
                  max={rules.remainingDailyLimit}
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-cyber font-bold text-lg text-white outline-none"
                />
                <span className="text-slate-400 font-mono text-xs font-bold">USD</span>
              </div>
            </div>

            {/* Airtm Email */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                {t('wallet.airtmEmail', 'E-mail cadastrado na Airtm')}
              </label>
              <input
                type="email"
                required
                value={accountDetails}
                onChange={(e) => setAccountDetails(e.target.value)}
                placeholder="sua-conta@airtm.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:border-emerald-500 outline-none"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs">
                {errorMessage}
              </div>
            )}

            <button
              id="btn-confirm-withdraw"
              type="submit"
              disabled={isSubmitting || amount < 10 || amount > availableBalance}
              className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-cyber font-bold text-sm tracking-wider uppercase shadow-lg shadow-emerald-500/30 transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? '...' : `${t('wallet.confirmWithdraw', 'CONFIRMAR SAQUE')} ($${amount.toFixed(2)} USD)`}
            </button>
          </form>
        )}

      </div>
    </div>
  );
};
