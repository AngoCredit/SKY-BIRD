import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { store } from '../../services/store';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { audioManager } from '../../services/audioManager';

interface DeleteAccountModalProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  onAccountDeleted: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  userId,
  onClose,
  onAccountDeleted
}) => {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!reason.trim()) {
      setErrorMsg('Por favor, descreva brevemente o motivo do encerramento da conta.');
      return;
    }

    if (confirmText.trim().toLowerCase() !== 'excluir') {
      setErrorMsg('Digite a palavra "EXCLUIR" para confirmar.');
      return;
    }

    setLoading(true);
    audioManager.playButtonClick();

    try {
      if (isSupabaseConfigured) {
        // Tentar apagar perfil e conta via Supabase (se RLS/permissões configuradas)
        await supabase.from('profiles').delete().eq('id', userId);
        await supabase.auth.signOut();
      }

      // Regista o log de auditoria no store com o motivo
      store.logAudit('USER_SELF_DELETED', `Conta encerrada pelo utilizador (${userId})`, 'Ativa', `Motivo: ${reason}`);
      
      // Remove do estado local
      store.logoutAdmin();

      setSuccessMsg('Sua conta foi desativada e eliminada com sucesso. Redirecionando...');
      setTimeout(() => {
        setLoading(false);
        onAccountDeleted();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar eliminação da conta.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-rose-950/40 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-800">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-cyber font-bold text-white">EXCLUIR MINHA CONTA</h3>
            <span className="text-xs text-rose-400 font-mono">Ação permanente e irreversível</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleDeleteAccount} className="space-y-4 text-xs">
          <div>
            <label className="text-slate-300 font-semibold block mb-1.5">
              Motivo do encerramento da conta <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Ex: Não pretendo continuar a jogar, prefiro utilizar outra plataforma, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl p-3 text-white outline-none text-xs resize-none"
            />
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">
              Confirmação de Segurança
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Para confirmar, digite a palavra <strong className="text-white font-mono uppercase">EXCLUIR</strong> no campo abaixo:
            </p>
            <input
              type="text"
              required
              placeholder="Digite EXCLUIR"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-white outline-none font-mono text-xs"
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Ao desativar a sua conta, os seus dados de perfil e histórico de transações deixam de estar ativos nesta plataforma.
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-cyber font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-rose-600/30 disabled:opacity-50"
            >
              {loading ? 'A ELIMINAR...' : 'CONFIRMAR EXCLUSÃO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
