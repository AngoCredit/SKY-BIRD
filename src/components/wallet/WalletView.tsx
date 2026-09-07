import React, { useState } from 'react';
import { User, WalletTransaction, VerificationRequest } from '../../types';
import { store } from '../../services/store';
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownRight,
  History,
  ShieldCheck,
  Zap,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  UserCheck,
  UserX,
  Info,
  Share2,
  Users,
  Copy,
  Gift,
  FileText,
  AlertCircle
} from 'lucide-react';
import { audioManager } from '../../services/audioManager';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useTranslation } from '../../services/i18n';

import { DeleteAccountModal } from './DeleteAccountModal';
import { KYCVerificationModal } from './KYCVerificationModal';
import { AvatarSelectorModal } from '../common/AvatarSelectorModal';
import { Bird } from 'lucide-react';

interface WalletViewProps {
  currentUser: User;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onAccountDeleted?: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  currentUser,
  onOpenDeposit,
  onOpenWithdraw,
  onAccountDeleted
}) => {
  const { t } = useTranslation();
  const userId = currentUser?.id || store.getCurrentUser()?.id || 'player_1';
  const [wallet, setWallet] = useState(store.getWallet(userId));
  const [rules, setRules] = useState(
    store.getWithdrawalRules(userId) || {
      minWithdrawal: 10,
      maxDailyLimit: 100,
      usedToday: 0,
      remainingDailyLimit: 100,
      isVerified: false,
      processingTimeText: '15 a 30 minutos'
    }
  );
  const [transactions, setTransactions] = useState<WalletTransaction[]>(
    store.getTransactions(userId) || []
  );
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'bet' | 'cashout'>('all');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isKYCOpen, setIsKYCOpen] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [kycRequest, setKycRequest] = useState<VerificationRequest | null>(
    store.getUserVerificationRequest(userId)
  );

  // ================================
// REFERAL SYSTEM - SUPABASE REAL
// ================================

const [referralCode, setReferralCode] =
    useState<string>('');

const [referralLink, setReferralLink] =
    useState<string>('');

const [referralStats, setReferralStats] =
    useState({

        guests: 0,

        pending: 0,

        approved: 0,

        total: 0

    });

  // Listen for changes
  React.useEffect(() => {
    const unsub = store.subscribe(() => {
      const u = store.getCurrentUser();
      const activeId = u?.id || userId;
      if (activeId) {
        setWallet(store.getWallet(activeId));
        setRules(
          store.getWithdrawalRules(activeId) || {
            minWithdrawal: 10,
            maxDailyLimit: 100,
            usedToday: 0,
            remainingDailyLimit: 100,
            isVerified: false,
            processingTimeText: '15 a 30 minutos'
          }
        );
        setTransactions(store.getTransactions(activeId) || []);
        setKycRequest(store.getUserVerificationRequest(activeId));
      }
    });
    return () => unsub();
  }, [userId]);

  // ================================
// LOAD REFERRAL DATA
// ================================
// LOAD REFERRAL DATA
// ================================

React.useEffect(() => {
  async function loadReferral() {
    try {
      const code = currentUser?.referralCode || store.getCurrentUser()?.referralCode || '';
      const activeUserId = currentUser?.id || store.getCurrentUser()?.id;

      let finalCode = code;
      let count = currentUser?.referralCount || 0;
      let earnings = currentUser?.referralEarnings || 0;

      if (!finalCode && activeUserId && isSupabaseConfigured) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('referral_code, referral_count, referral_earnings')
          .eq('id', activeUserId)
          .maybeSingle();

        if (profile) {
          finalCode = profile.referral_code || '';
          count = Number(profile.referral_count || 0);
          earnings = Number(profile.referral_earnings || 0);
        }
      }

      if (finalCode) {
        setReferralCode(finalCode);
        setReferralLink(`${window.location.origin}/#register?ref=${encodeURIComponent(finalCode)}`);
      }

      setReferralStats({
        guests: count,
        pending: 0,
        approved: earnings,
        total: earnings
      });
    } catch (err) {
      console.warn('[WalletView] Erro ao carregar dados de referência:', err);
    }
  }

  loadReferral();
}, [currentUser]);

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'all') return true;
    return tx.type === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 font-mono">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Concluído
          </span>
        );
      case 'processing':
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/30 font-mono" title="Tempo estimado: 15 a 30 minutos">
            <Clock className="w-3 h-3 text-amber-400" />
            Em Análise (15-30 min)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/30 font-mono">
            <XCircle className="w-3 h-3 text-rose-400" />
            Falha / Estornado
          </span>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownRight className="w-4 h-4 text-cyan-400" />;
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4 text-amber-400" />;
      case 'cashout':
        return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      case 'referral_bonus':
        return <Gift className="w-4 h-4 text-amber-400" />;
      case 'bet':
        return <Zap className="w-4 h-4 text-rose-400" />;
      default:
        return <WalletIcon className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Balance Cards & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Main Available Balance Card */}
        <div className="lg:col-span-8 glass-panel rounded-3xl p-6 sm:p-8 border border-cyan-500/30 relative overflow-hidden flex flex-col justify-between shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <WalletIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-cyber font-bold text-white tracking-wide">
                  CARTEIRA OFICIAL AIRTM
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  ID: {wallet.userId}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Proteção Segura</span>
            </div>
          </div>

          <div className="my-6">
            <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1 font-semibold">
              {t('wallet.available', 'Saldo Disponível para Apostas')}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-cyber font-black text-white tracking-tight">
                ${wallet.availableBalance.toFixed(2)}
              </span>
              <span className="text-lg font-cyber font-bold text-cyan-400">
                {wallet.currency}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800">
            <button
              id="btn-open-deposit-wallet"
              onClick={() => {
                audioManager.playButtonClick();
                onOpenDeposit();
              }}
              className="flex-1 min-w-[140px] py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-cyber font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>{t('wallet.deposit', 'Depositar (Airtm)')}</span>
            </button>

            <button
              id="btn-open-withdraw-wallet"
              onClick={() => {
                audioManager.playButtonClick();
                onOpenWithdraw();
              }}
              className="flex-1 min-w-[140px] py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-200 hover:text-white font-cyber font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              <span>{t('wallet.withdraw', 'Sacar (Airtm)')}</span>
            </button>
          </div>
        </div>


        {/* Withdrawal Policy & Limits Card */}
        <div className="lg:col-span-4 glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 flex flex-col justify-between shadow-2xl space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Status da Conta & Saque
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    audioManager.playButtonClick();
                    setIsAvatarOpen(true);
                  }}
                  className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition cursor-pointer flex items-center gap-1 hover:underline"
                >
                  <Bird className="w-3.5 h-3.5 text-cyan-400" />
                  Alterar Avatar
                </button>
                {!rules.isVerified && kycRequest?.status !== 'pending' && (
                  <button
                    onClick={() => {
                      audioManager.playButtonClick();
                      setIsKYCOpen(true);
                    }}
                    className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition cursor-pointer flex items-center gap-1 hover:underline"
                  >
                    <FileText className="w-3 h-3 text-cyan-400" />
                    Verificar Conta
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {rules.isVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono">
                  <UserCheck className="w-4 h-4" />
                  Conta Verificada (KYC)
                </span>
              ) : kycRequest?.status === 'pending' ? (
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-400 text-xs font-bold font-mono">
                    <Clock className="w-4 h-4" />
                    Verificação em Análise
                  </span>
                  <p className="text-[11px] text-slate-500 pl-1">Seus documentos estão sendo revisados.</p>
                </div>
              ) : kycRequest?.status === 'rejected' ? (
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-400 text-xs font-bold font-mono">
                    <AlertCircle className="w-4 h-4" />
                    Verificação Recusada
                  </span>
                  <button
                    onClick={() => { audioManager.playButtonClick(); setIsKYCOpen(true); }}
                    className="text-[11px] text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    Enviar novos documentos
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-400 text-xs font-bold font-mono">
                    <UserX className="w-4 h-4" />
                    Conta Não Verificada
                  </span>
                  <button
                    onClick={() => { audioManager.playButtonClick(); setIsKYCOpen(true); }}
                    className="w-full py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-400 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verificar Identidade (KYC)
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Mínimo p/ saque:</span>
                <strong className="text-white font-mono">$10.00 USD</strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Limite diário:</span>
                <strong className="text-cyan-400 font-mono">${(rules?.maxDailyLimit ?? 100).toFixed(2)} USD/dia</strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Sacado hoje:</span>
                <strong className="text-slate-200 font-mono">${(rules?.usedToday ?? 0).toFixed(2)} USD</strong>
              </div>
              <div className="flex justify-between text-slate-300 border-t border-slate-800/80 pt-2">
                <span className="text-slate-400">Disponível hoje:</span>
                <strong className="text-emerald-400 font-mono font-bold">${(rules?.remainingDailyLimit ?? 100).toFixed(2)} USD</strong>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-amber-300/90 flex items-start gap-2">
            <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              Saques Airtm levam <strong>entre 15 a 30 minutos</strong> para constar na sua carteira.
            </span>
          </div>
        </div>
      </div>

      {/* KYC Verification Modal */}
      <KYCVerificationModal
        isOpen={isKYCOpen}
        onClose={() => setIsKYCOpen(false)}
        existingRequest={kycRequest}
      />


      {/* Referral Program Dashboard Banner (10 Convites = $1.00 USD) */}
      {/* ================================
    PROGRAMAS DE REFERÊNCIAS
================================ */}

<div
className="
rounded-2xl
border
border-cyan-500/20
bg-gradient-to-br
from-slate-900
to-slate-950
p-6
shadow-lg
"
>


<div
className="
flex
items-center
justify-between
mb-5
"
>


<div>

<h3
className="
text-lg
font-bold
text-white
"
>
Programa de Referências
</h3>


<p
className="
text-xs
text-slate-400
mt-1
"
>
Convide jogadores e ganhe comissões sobre o primeiro depósito qualificado.
</p>


</div>


<div
className="
text-cyan-400
"
>

<Users className="w-6 h-6"/>

</div>


</div>




{/* Código */}

<div
className="
bg-black/30
rounded-xl
p-4
border
border-white/10
"
>


<p
className="
text-xs
text-slate-400
"
>
Meu código
</p>


<div
className="
mt-2
text-xl
font-bold
text-cyan-400
"
>
{
referralCode || 
'A carregar...'
}
</div>


</div>




{/* Link */}

<div
className="
mt-4
"
>


<p
className="
text-xs
text-slate-400
mb-2
"
>
Meu link de convite
</p>



<div
className="
flex
gap-2
"
>


<input

readOnly

value={
referralLink
}

className="
flex-1
rounded-xl
bg-black/40
border
border-white/10
px-4
py-3
text-xs
text-white
outline-none
"

/>



<button

onClick={()=>{

navigator.clipboard.writeText(
referralLink
);

audioManager.playButtonClick();

}}

className="
rounded-xl
bg-cyan-500/20
border
border-cyan-500/30
px-4
text-cyan-400
hover:bg-cyan-500/30
transition
"

>

<Copy className="w-5 h-5"/>

</button>


</div>


</div>





{/* Estatísticas */}

<div
className="
grid
grid-cols-2
md:grid-cols-4
gap-3
mt-5
"
>


<div
className="
bg-black/30
rounded-xl
p-3
"
>

<p
className="
text-xs
text-slate-400
"
>
Convidados
</p>


<p
className="
text-xl
font-bold
text-white
"
>
{
referralStats.guests
}
</p>


</div>




<div
className="
bg-black/30
rounded-xl
p-3
"
>

<p
className="
text-xs
text-slate-400
"
>
Pendentes
</p>


<p
className="
text-xl
font-bold
text-yellow-400
"
>
$
{
referralStats.pending.toFixed(2)
}

</p>


</div>





<div
className="
bg-black/30
rounded-xl
p-3
"
>

<p
className="
text-xs
text-slate-400
"
>
Aprovadas
</p>


<p
className="
text-xl
font-bold
text-green-400
"
>
$
{
referralStats.approved.toFixed(2)
}

</p>


</div>





<div
className="
bg-black/30
rounded-xl
p-3
"
>

<p
className="
text-xs
text-slate-400
"
>
Total ganho
</p>


<p
className="
text-xl
font-bold
text-cyan-400
"
>
$
{
referralStats.total.toFixed(2)
}

</p>


</div>


</div>



</div>

      {/* Airtm Official Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900 border border-cyan-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-cyan-400 shrink-0 font-black">
            A
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Airtm: Carteira Oficial SKYBIRD</h4>
            <p className="text-xs text-slate-400">
              Processamento seguro de depósitos e saques com limite diário de até $500 USD e crédito em 15 a 30 minutos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              audioManager.playButtonClick();
              onOpenDeposit();
            }}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold text-xs uppercase tracking-wider transition cursor-pointer whitespace-nowrap"
          >
            DEPOSITAR COM AIRTM
          </button>
          <button
            onClick={() => {
              audioManager.playButtonClick();
              setIsDeleteModalOpen(true);
            }}
            className="px-3.5 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-semibold text-xs transition cursor-pointer whitespace-nowrap"
          >
            Excluir Conta
          </button>
        </div>
      </div>

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        userId={currentUser.id}
        onClose={() => setIsDeleteModalOpen(false)}
        onAccountDeleted={() => {
          if (onAccountDeleted) onAccountDeleted();
        }}
      />

      {/* Ledger Transactions Table */}
      <div className="glass-panel rounded-3xl p-6 border border-white/10 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-cyber font-bold text-white">
              EXTRATO DO LEDGER IMUTÁVEL
            </h3>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto text-xs">
            {(['all', 'deposit', 'withdrawal', 'bet', 'cashout'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg font-semibold uppercase tracking-wider transition cursor-pointer ${
                  filter === f
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f === 'all' ? 'Todas' : f === 'deposit' ? 'Depósitos' : f === 'withdrawal' ? 'Saques' : f === 'bet' ? 'Apostas' : 'Cashouts'}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800/80">
                <th className="pb-3 px-3">Tipo</th>
                <th className="pb-3 px-3">Referência</th>
                <th className="pb-3 px-3">Método</th>
                <th className="pb-3 px-3">Valor</th>
                <th className="pb-3 px-3">Saldo Antes/Depois</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-3 text-right">Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-mono">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500 font-sans">
                    Nenhuma transação encontrada no período.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isPositive = tx.type === 'deposit' || tx.type === 'cashout';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-900/50 transition">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                            {getTypeIcon(tx.type)}
                          </div>
                          <span className="font-semibold uppercase text-slate-200">
                            {tx.type}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {tx.reference}
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        {tx.method || 'Airtm'}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? '+' : '-'}${tx.amount.toFixed(2)} USD
                        </span>
                      </td>

                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        ${tx.balanceBefore.toFixed(2)} → <strong className="text-white">${tx.balanceAfter.toFixed(2)}</strong>
                      </td>

                      <td className="py-3 px-3">
                        {getStatusBadge(tx.status)}
                      </td>

                      <td className="py-3 px-3 text-right text-slate-400 text-[11px]">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AvatarSelectorModal
        isOpen={isAvatarOpen}
        onClose={() => setIsAvatarOpen(false)}
        currentAvatarUrl={currentUser.avatar}
        onSelectAvatar={(avatarUrl) => store.updateUserAvatar(avatarUrl)}
      />
    </div>
  );
};
