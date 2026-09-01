import React, { useState } from 'react';
import { X, Wallet, CheckCircle, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { store } from '../../services/store';
import { audioManager } from '../../services/audioManager';
import { useTranslation } from '../../services/i18n';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<number>(50);
  const [airtmEmail, setAirtmEmail] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successTx, setSuccessTx] = useState<{ reference: string; amount: number } | null>(null);

  if (!isOpen) return null;

  const quickAmounts = [10, 25, 50, 100, 250, 500];

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    setIsProcessing(true);
    audioManager.playButtonClick();

    setTimeout(() => {
      try {
        const tx = store.requestDeposit(amount, 'Airtm', {
          airtmEmail: airtmEmail.trim() || undefined
        });
        setIsProcessing(false);
        setSuccessTx({ reference: tx.reference, amount: tx.amount });
      } catch (err: unknown) {
        setIsProcessing(false);
        alert(err instanceof Error ? err.message : 'Error processing deposit');
      }
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/40 relative">
        <button
          id="btn-close-deposit"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-cyber font-bold text-white">
              {t('wallet.depositAirtmTitle', 'DEPOSITAR SALDO (USD)')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('wallet.depositAirtmDesc', 'Processamento oficial via carteira digital Airtm.')}
            </p>
          </div>
        </div>

        {successTx ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto animate-pulse">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-cyber font-bold text-white">
              {t('notif.depositRequestedTitle', 'Solicitação de Depósito Enviada!')}
            </h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto">
              {t('wallet.adminApprovalNotice', 'A validação, aprovação e liberação do saldo são de inteira responsabilidade do painel Administrativo.')}
            </p>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Ref:</span>
                <span className="font-mono text-cyan-400 font-bold">{successTx.reference}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">{t('admin.tabOverview', 'Status')}:</span>
                <span className="font-mono text-amber-400 font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t('wallet.statusPending', 'Aguardando Aprovação Admin')}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setSuccessTx(null);
                onClose();
              }}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold uppercase transition cursor-pointer mt-4"
            >
              {t('wallet.close', 'VOLTAR')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleDepositSubmit} className="space-y-5 text-xs">
            {/* Payment Method Banner */}
            <div>
              <label className="text-slate-300 font-semibold block mb-2">
                Airtm Wallet (USD)
              </label>
              <div className="p-3.5 rounded-2xl bg-cyan-950/60 border border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">
                    A
                  </div>
                  <div>
                    <span className="font-bold text-white block text-sm">Airtm Global (USD)</span>
                    <span className="text-[11px] text-cyan-300/90">Official SKYBIRD Wallet</span>
                  </div>
                </div>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-1 rounded-full font-mono font-bold">
                  USD
                </span>
              </div>

              {/* Airtm Registration Callout */}
              <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-r from-blue-950/70 to-slate-900 border border-blue-500/30 flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-300">
                  <span className="text-cyan-300 font-semibold block">Airtm</span>
                  {t('landing.airtmBannerDesc', 'Transações seguras e ágeis.')}
                </div>
                <a
                  href="https://app.airtm.com/ivt/makemone5ickwygj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] whitespace-nowrap transition cursor-pointer shadow-sm"
                >
                  {t('landing.airtmRegisterLink', 'Criar Conta')}
                </a>
              </div>
            </div>

            {/* Amount selection */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-slate-300 font-semibold">
                  {t('wallet.depositAmount', 'Valor do Depósito (USD)')}
                </label>
                <span className="text-slate-400 text-[11px]">Min: $1.00 USD</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(amt)}
                    className={`py-2.5 rounded-xl font-mono font-bold text-xs transition cursor-pointer ${
                      amount === amt
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                        : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-cyan-500">
                <span className="text-cyan-400 font-cyber font-bold text-lg mr-2">$</span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-cyber font-bold text-lg text-white outline-none"
                />
                <span className="text-slate-400 font-mono text-xs font-bold">USD</span>
              </div>
            </div>

            {/* User Airtm Email */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1.5">
                {t('wallet.airtmEmail', 'E-mail cadastrado na Airtm')}
              </label>
              <input
                type="email"
                value={airtmEmail}
                onChange={(e) => setAirtmEmail(e.target.value)}
                placeholder="seu-email@airtm.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:border-cyan-500 outline-none"
              />
            </div>

            {/* Admin confirmation notice */}
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-2.5 text-amber-200/90 text-[11px]">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 font-bold block">{t('admin.title', 'Painel Admin')}</strong>
                {t('wallet.adminApprovalNotice', 'A validação, aprovação e liberação do saldo são de inteira responsabilidade do painel Administrativo.')}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Airtm Fee:
              </span>
              <span className="text-emerald-400 font-bold font-mono">0.00%</span>
            </div>

            <button
              id="btn-confirm-deposit"
              type="submit"
              disabled={isProcessing || amount <= 0}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-cyber font-bold text-sm tracking-wider uppercase shadow-lg shadow-cyan-500/30 transition disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? '...' : `${t('wallet.confirmDeposit', 'CONFIRMAR DEPÓSITO')} ($${amount.toFixed(2)} USD)`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
