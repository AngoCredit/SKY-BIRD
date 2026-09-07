import React, { useState } from 'react';
import {
  ShieldAlert,
  Lock,
  Mail,
  ShieldCheck,
  ArrowLeft,
  Eye,
  EyeOff,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  KeyRound,
} from 'lucide-react';
import { store } from '../../services/store';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { audioManager } from '../../services/audioManager';

interface AdminLoginPageProps {
  onLoginSuccess: () => void;
  onBackToApp: () => void;
}

const AUTH_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms = AUTH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: O serviço de autenticação demorou demasiado tempo.')), ms),
    ),
  ]);
}

function friendlyAdminError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) return 'Email ou palavra-passe administrativa incorretos.';
  if (message === 'ADMIN_REQUIRED' || normalized.includes('admin_required')) return 'Esta conta não possui permissões administrativas ativas.';
  if (message === 'SUPABASE_NOT_CONFIGURED') return 'O serviço de autenticação não está configurado. Contacte o administrador técnico.';
  if (normalized.includes('timeout')) return 'O servidor de autenticação não respondeu. Tente novamente em alguns segundos.';
  return message || 'Falha na autenticação administrativa.';
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLoginSuccess, onBackToApp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [securityChecked, setSecurityChecked] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim()) return setErrorMsg('Informe o email do administrador.');
    if (!password) return setErrorMsg('Informe a palavra-passe administrativa.');
    if (!securityChecked) return setErrorMsg('Confirme a autorização de segurança do terminal.');
    if (!isSupabaseConfigured) return setErrorMsg('Supabase Auth não configurado. O login administrativo local foi desativado por segurança.');

    setIsLoading(true);
    audioManager.playButtonClick();

    try {
      // store.loginAdmin authenticates against Supabase Auth and verifies the
      // persisted server-side profile role/status.
      const profile = await withTimeout(store.loginAdmin(email.trim().toLowerCase(), password));

      if (!profile || profile.role !== 'admin' || profile.status !== 'active') throw new Error('ADMIN_REQUIRED');

      audioManager.playNotification();
      setSuccessMsg('Acesso administrativo validado. A abrir o Console...');

      // IMPORTANT: App.tsx also listens to the URL hash. Keep the URL and React
      // state synchronized before invoking the success callback; otherwise the
      // hash remains #admin-login and the hash effect immediately sends the UI
      // back to the login screen.
      localStorage.setItem('skybird_current_view', 'admin');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin`);

      window.setTimeout(() => onLoginSuccess(), 150);
    } catch (error) {
      console.error('[AdminLogin] authentication failed:', error);
      setErrorMsg(friendlyAdminError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecovery = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) return setErrorMsg('Informe primeiro o email administrativo para recuperar o acesso.');
    if (!isSupabaseConfigured) return setErrorMsg('Recuperação indisponível: Supabase Auth não está configurado.');

    setIsRecovering(true);
    try {
      const redirectTo = `${window.location.origin}/#recover-password`;
      const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo }));
      if (error) throw error;
      setSuccessMsg('Se existir uma conta com este email, enviámos as instruções de recuperação. Verifique a caixa de entrada.');
    } catch (error) {
      console.error('[AdminLogin] password recovery failed:', error);
      setErrorMsg(friendlyAdminError(error));
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#03060E] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-br from-amber-500/20 via-orange-600/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293d08_1px,transparent_1px),linear-gradient(to_bottom,#1f293d08_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      <header className="relative z-10 w-full border-b border-amber-500/20 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 p-0.5 shadow-lg shadow-amber-500/20"><div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center"><ShieldAlert className="w-5 h-5 text-amber-400" /></div></div>
          <div><span className="font-cyber font-black text-lg tracking-wider text-white flex items-center gap-2">SKY<span className="text-amber-400">BIRD</span><span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">ADMIN CONSOLE</span></span><span className="text-[9px] uppercase tracking-widest text-slate-400 block font-mono">Terminal de Controle & Auditoria</span></div>
        </div>
        <button onClick={() => { audioManager.playButtonClick(); onBackToApp(); }} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"><ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Voltar ao Portal do Jogador</span><span className="sm:hidden">Voltar</span></button>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-slate-950/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-950/40 backdrop-blur-2xl">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-amber-500/20"><div className="flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" /><span className="font-cyber font-bold text-xs tracking-wider text-amber-300 uppercase">Acesso Restrito</span></div><div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/30"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />AUTH SECURE</div></div>
          <div className="text-center mb-6"><div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3 text-amber-400 shadow-inner"><Terminal className="w-6 h-6" /></div><h1 className="text-xl sm:text-2xl font-cyber font-black text-white tracking-wide">LOGIN ADMINISTRATIVO</h1><p className="text-xs text-slate-400 mt-2">Autenticação através do Supabase Auth + perfil administrativo persistido.</p></div>
          {errorMsg && <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{errorMsg}</div>}
          {successMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-300 text-xs flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{successMsg}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="text-slate-300 font-semibold block mb-1 text-xs">Email administrativo</label><div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 focus-within:border-amber-500"><Mail className="w-4 h-4 text-slate-400" /><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@dominio.com" className="w-full bg-transparent text-white outline-none text-sm" /></div></div>
            <div><label className="text-slate-300 font-semibold block mb-1 text-xs">Palavra-passe</label><div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 focus-within:border-amber-500"><KeyRound className="w-4 h-4 text-slate-400" /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-transparent text-white outline-none text-sm" /><button type="button" onClick={() => setShowPassword(v => !v)} className="text-slate-500 hover:text-white cursor-pointer" aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
            <label className="flex items-start gap-3 p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 cursor-pointer"><input type="checkbox" checked={securityChecked} onChange={e => setSecurityChecked(e.target.checked)} className="mt-0.5 accent-amber-500" /><span className="text-[11px] text-slate-300">Confirmo que estou autorizado a aceder ao Console Administrativo do SKY-BIRD.</span></label>
            <button type="submit" disabled={isLoading || isRecovering} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-cyber font-black text-xs tracking-widest shadow-lg shadow-amber-900/30 disabled:opacity-60 disabled:cursor-wait hover:brightness-110 transition flex items-center justify-center gap-2">{isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> A AUTENTICAR...</> : <><ShieldCheck className="w-4 h-4" /> ENTRAR NO CONSOLE</>}</button>
          </form>
          <button type="button" onClick={handleRecovery} disabled={isLoading || isRecovering} className="w-full mt-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/30 text-xs transition disabled:opacity-50 flex items-center justify-center gap-2">{isRecovering ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> A ENVIAR RECUPERAÇÃO...</> : 'Esqueci a palavra-passe'}</button>
          <div className="mt-5 flex items-center justify-center gap-2 text-[9px] font-mono text-slate-500 uppercase tracking-wider"><Lock className="w-3 h-3" /> Sem fallback local • Role verificada no servidor</div>
        </div>
      </main>
    </div>
  );
};
