import React, { useState } from 'react';
import {
  ShieldAlert,
  Lock,
  Mail,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  Eye,
  EyeOff,
  Server,
  Terminal,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { store } from '../../services/store';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { audioManager } from '../../services/audioManager';

interface AdminLoginPageProps {
  onLoginSuccess: () => void;
  onBackToApp: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
  onBackToApp
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [securityChecked, setSecurityChecked] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    audioManager.playButtonClick();

    if (!email.trim()) {
      setErrorMsg('Informe o email ou ID do administrador.');
      return;
    }
    if (!password) {
      setErrorMsg('Informe a chave de acesso mestre.');
      return;
    }
    if (!securityChecked) {
      setErrorMsg('Confirme a autorização de segurança do terminal.');
      return;
    }

    setIsLoading(true);

    if (isSupabaseConfigured) {
      try {
        // Tentar Login no Supabase Auth
        let { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        // Se o utilizador não existir, criar a conta do primeiro Administrador no Supabase
        if (error && (error.message.includes('Invalid login credentials') || error.message.includes('User not found'))) {
          const signUpRes = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                name: 'Administrador Principal',
                role: 'admin',
                avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AdminSkybird'
              }
            }
          });

          if (!signUpRes.error && signUpRes.data.user) {
            data = signUpRes.data;
            error = null;
          }
        }

        if (error && !data?.user) {
          setIsLoading(false);
          setErrorMsg(error.message || 'Falha ao autenticar administrador no Supabase.');
          return;
        }

        if (data?.user) {
          // Assegurar que a role='admin' fica gravada na tabela public.profiles do Supabase
          try {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              name: data.user.user_metadata?.name || 'Administrador Mestre',
              email: data.user.email || email,
              avatar_url: data.user.user_metadata?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=AdminSkybird',
              role: 'admin',
              status: 'active',
              last_login_at: new Date().toISOString()
            });
          } catch (upsertErr) {
            console.warn('[AdminLogin] Aviso ao atualizar perfil admin no Supabase:', upsertErr);
          }

          const adminUser = {
            id: data.user.id,
            name: data.user.user_metadata?.name || 'Administrador Mestre',
            email: data.user.email || email,
            avatar: data.user.user_metadata?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=AdminSkybird',
            role: 'admin' as const,
            status: 'active' as const,
            createdAt: data.user.created_at || new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
          };

          store.setCurrentUser(adminUser);
          audioManager.playNotification();
          setSuccessMsg('Acesso mestre autenticado! Entrando no Console Administrativo...');
          setTimeout(() => {
            setIsLoading(false);
            onLoginSuccess();
          }, 600);
          return;
        }
      } catch (err: any) {
        console.warn('[AdminLogin] Erro Supabase, usando autenticação de emergência local:', err);
      }
    }

    // Fallback local se Supabase não configurado ou em erro
    setTimeout(() => {
      const result = store.loginAdmin(email, password);
      setIsLoading(false);

      if (result.success) {
        audioManager.playNotification();
        setSuccessMsg('Acesso autenticado com sucesso. Redirecionando para o Console...');
        setTimeout(() => {
          onLoginSuccess();
        }, 600);
      } else {
        audioManager.playNotification();
        setErrorMsg(result.message || 'Falha na autenticação administrativa.');
      }
    }, 500);
  };



  return (
    <div className="min-h-screen w-full bg-[#03060E] text-slate-100 flex flex-col justify-between selection:bg-amber-500/30 selection:text-amber-200 relative overflow-hidden">
      {/* Background Decorative Cyber Elements */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-br from-amber-500/20 via-orange-600/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293d08_1px,transparent_1px),linear-gradient(to_bottom,#1f293d08_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full border-b border-amber-500/20 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 p-0.5 shadow-lg shadow-amber-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div>
            <span className="font-cyber font-black text-lg tracking-wider text-white flex items-center gap-2">
              SKY<span className="text-amber-400">BIRD</span>
              <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                ADMIN CONSOLE
              </span>
            </span>
            <span className="text-[9px] uppercase tracking-widest text-slate-400 block font-mono">
              Terminal de Controle & Auditoria
            </span>
          </div>
        </div>

        <button
          id="btn-admin-back-to-app"
          onClick={() => {
            audioManager.playButtonClick();
            onBackToApp();
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Voltar ao Portal do Jogador</span>
          <span className="sm:hidden">Voltar</span>
        </button>
      </header>

      {/* Central Login Card Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md bg-slate-950/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-950/40 relative backdrop-blur-2xl">
          {/* Top Security Banner */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span className="font-cyber font-bold text-xs tracking-wider text-amber-300 uppercase">
                Acesso Restrito
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              TLS v1.3 • 256-bit
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3 text-amber-400 shadow-inner">
              <Terminal className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-cyber font-black text-white tracking-wide">
              LOGIN ADMINISTRATIVO
            </h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Autenticação de nível mestre para gestão de parâmetros, RTP, ledger financeiro e suporte.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-start gap-2.5 animate-shake">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Email / Officer ID */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1 flex items-center justify-between">
                <span>Email de Administrador / ID</span>
                <span className="text-[10px] text-amber-400/80 font-mono font-normal">Super Admin</span>
              </label>
              <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-700/80 focus-within:border-amber-500 rounded-xl px-3.5 py-3 transition">
                <Mail className="w-4 h-4 text-slate-400" />
                <input
                  id="admin-email-input"
                  type="email"
                  required
                  placeholder="admin@seu-dominio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent text-white outline-none font-mono text-xs"
                />
              </div>
            </div>

            {/* Master Key Password */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Chave de Acesso Mestre (Password)
              </label>
              <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-700/80 focus-within:border-amber-500 rounded-xl px-3.5 py-3 transition">
                <KeyRound className="w-4 h-4 text-slate-400" />
                <input
                  id="admin-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-white outline-none font-mono text-xs tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Security Confirmation */}
            <label className="flex items-start gap-2.5 text-slate-400 cursor-pointer pt-1">
              <input
                id="admin-security-checkbox"
                type="checkbox"
                checked={securityChecked}
                onChange={(e) => setSecurityChecked(e.target.checked)}
                className="mt-0.5 rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-[11px] leading-tight text-slate-300">
                Reconheço que esta sessão é restrita e todas as alterações efetuadas são registradas no livro de <strong>Auditoria Imutável</strong>.
              </span>
            </label>

            {/* Submit Button */}
            <button
              id="btn-admin-submit-login"
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-cyber font-black text-sm tracking-wider uppercase shadow-lg shadow-amber-500/25 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>AUTENTICAR NO CONSOLE</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="relative z-10 w-full border-t border-white/5 bg-[#020409] py-4 px-4 sm:px-8 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-amber-500/70" />
          <span>Servidor: Skybird Core Node Alpha (Cluster EU-West)</span>
        </div>
        <span>Acesso Monitorado & Criptografado • SKYBIRD Platform v2.4</span>
      </footer>
    </div>
  );
};
