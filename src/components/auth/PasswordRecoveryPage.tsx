import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '../../services/supabase';

export const PasswordRecoveryPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('A nova palavra-passe deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    window.setTimeout(() => {
      window.location.hash = 'landing';
    }, 1800);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-cyan-500/20 bg-slate-900/90 p-7 shadow-2xl shadow-cyan-950/30">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
          {done ? <CheckCircle2 className="h-7 w-7 text-cyan-400" /> : <KeyRound className="h-7 w-7 text-cyan-400" />}
        </div>

        <h1 className="text-center text-xl font-bold tracking-wide">{done ? 'PALAVRA-PASSE ATUALIZADA' : 'RECUPERAR ACESSO'}</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          {done
            ? 'A sua nova palavra-passe foi definida. A entrar novamente no SKY-BIRD...'
            : 'Defina uma nova palavra-passe através do link seguro enviado para o seu email.'}
        </p>

        {!done && (
          <>
            {!ready && (
              <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                O link de recuperação ainda não foi validado. Abra o link recebido no email nesta aplicação.
              </div>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Nova palavra-passe</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 focus-within:border-cyan-500">
                  <Lock className="h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Confirmar palavra-passe</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 focus-within:border-cyan-500">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="Repita a palavra-passe"
                    required
                  />
                </div>
              </div>

              {error && <div className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-xs text-red-300">{error}</div>}

              <button
                type="submit"
                disabled={saving || !ready}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> A ATUALIZAR...</> : 'DEFINIR NOVA PALAVRA-PASSE'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
};
