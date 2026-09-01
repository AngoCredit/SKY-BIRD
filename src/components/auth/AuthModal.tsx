import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, ShieldAlert, Phone, Calendar, CheckCircle, AlertTriangle } from 'lucide-react';
import { store } from '../../services/store';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { audioManager } from '../../services/audioManager';
import { useTranslation } from '../../services/i18n';
import { AvatarSelectorModal, ANIMAL_AVATARS } from '../common/AvatarSelectorModal';

const COUNTRY_CODES = [
  { code: '+244', country: 'Angola 🇦🇴', flag: '🇦🇴' },
  { code: '+351', country: 'Portugal 🇵🇹', flag: '🇵🇹' },
  { code: '+55', country: 'Brasil 🇧🇷', flag: '🇧🇷' },
  { code: '+258', country: 'Moçambique 🇲🇿', flag: '🇲🇿' },
  { code: '+238', country: 'Cabo Verde 🇨🇻', flag: '🇨🇻' },
  { code: '+239', country: 'São Tomé e Príncipe 🇸🇹', flag: '🇸🇹' },
  { code: '+245', country: 'Guiné-Bissau 🇬🇼', flag: '🇬🇼' },
  { code: '+1', country: 'Estados Unidos / Canadá 🇺🇸', flag: '🇺🇸' },
  { code: '+34', country: 'Espanha 🇪🇸', flag: '🇪🇸' },
  { code: '+33', country: 'França 🇫🇷', flag: '🇫🇷' },
  { code: '+44', country: 'Reino Unido 🇬🇧', flag: '🇬🇧' },
];

interface AuthModalProps {
  isOpen: boolean;
  initialTab?: 'login' | 'register';
  onClose: () => void;
  onSuccess: () => void;
  onOpenAdminLogin?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialTab = 'login',
  onClose,
  onSuccess,
  onOpenAdminLogin
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>(initialTab);

  React.useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setErrorMsg('');
    }
  }, [isOpen, initialTab]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+244');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(ANIMAL_AVATARS[0].url);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [loading, setLoading] = useState(false);

  // Helper for Google OAuth Login
  const handleGoogleLogin = async () => {
    setErrorMsg('');
    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase não configurado para autenticação Google.');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) {
        setErrorMsg(error.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao conectar com a conta Google.');
    } finally {
      setLoading(false);
    }
  };

  // Verification helper for 18+ years
  const checkIsAdult = (dobString: string): boolean => {
    if (!dobString) return false;
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age >= 18;
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (tab === 'register') {
      if (!name.trim()) return setErrorMsg('Nome de utilizador é obrigatório');
      if (!email.includes('@')) return setErrorMsg('Endereço de email inválido');
      if (!phone.trim() || phone.replace(/\D/g, '').length < 6) {
        return setErrorMsg('Por favor introduza um contacto do WhatsApp válido');
      }
      if (!birthDate) return setErrorMsg('Data de nascimento é obrigatória');
      if (!checkIsAdult(birthDate)) {
        return setErrorMsg('Acesso restrito: Deve ter pelo menos 18 anos de idade para se registar.');
      }
      if (password.length < 6) return setErrorMsg('A palavra-passe deve ter pelo menos 6 caracteres');
      if (password !== confirmPassword) return setErrorMsg('As palavras-passe não coincidem');
      if (!acceptedTerms) return setErrorMsg('Aceite os termos e condições');

      // Security Anti-Fraud Validation (Duplicate WhatsApp phone number & Device Fingerprint limit)
      const fp = store.getDeviceFingerprint();

      // Verificar no Supabase se existem contas com este email — se a conta foi eliminada,
      // limpar dados locais antes de validar anti-fraude
      if (isSupabaseConfigured) {
        const { data: existingSession } = await supabase.auth.getSession();
        if (!existingSession?.session) {
          // Não há sessão ativa — limpar utilizadores locais stale com mesmo fingerprint
          // para garantir que contas eliminadas não bloqueiam novo registo
          store.clearStaleLocalUsers(fp);
        }
      }

      const antiFraudCheck = store.validateRegistrationAntiFraud({
        email,
        phone: `${countryCode} ${phone}`,
        birthDate,
        deviceFingerprint: fp
      });

      if (!antiFraudCheck.valid) {
        return setErrorMsg(antiFraudCheck.reason || 'Registo bloqueado por motivos de segurança.');
      }

      setLoading(true);
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                name,
                avatar_url: selectedAvatar
              }
            }
          });

          if (error) {
            setLoading(false);
            return setErrorMsg(error.message);
          }

          if (data.user) {
            // ✅ Gravar perfil completo na tabela profiles do Supabase
            const profilePayload = {
              id: data.user.id,
              name,
              email: data.user.email || email,
              phone: `${countryCode} ${phone}`,
              birth_date: birthDate,
              device_fingerprint: fp,
              avatar_url: selectedAvatar,
              role: 'player',
              status: 'active',
              is_verified: false,
              verification_status: 'unverified',
              referral_count: 0,
              referral_earnings: 0,
              created_at: data.user.created_at || new Date().toISOString(),
              last_login_at: new Date().toISOString()
            };

            const { error: profileErr } = await supabase
              .from('profiles')
              .upsert(profilePayload, { onConflict: 'id' });

            if (profileErr) {
              console.error('[AuthModal] Erro ao gravar perfil no Supabase:', profileErr);
            }

            // ✅ Criar carteira inicial do jogador (saldo 0)
            const { error: walletErr } = await supabase
              .from('wallets')
              .upsert({
                user_id: data.user.id,
                available_balance: 0,
                locked_balance: 0,
                currency: 'USD',
                updated_at: new Date().toISOString()
              }, { onConflict: 'user_id' });

            if (walletErr) {
              console.error('[AuthModal] Erro ao gravar carteira no Supabase:', walletErr);
            }

            // ⚡ Forçar Login Automático com a Senha para obter token JWT de sessão ativo
            let activeSessionUser = data.user;
            const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
              email,
              password
            });

            if (!signInErr && signInData?.user) {
              activeSessionUser = signInData.user;
            }

            const newUser = {
              id: activeSessionUser.id,
              name,
              email: activeSessionUser.email || email,
              phone: `${countryCode} ${phone}`,
              deviceFingerprint: fp,
              avatar: selectedAvatar,
              role: 'player' as const,
              status: 'active' as const,
              isVerified: false,
              verificationStatus: 'unverified' as const,
              referralCount: 0,
              referralEarnings: 0,
              createdAt: activeSessionUser.created_at || new Date().toISOString(),
              lastLoginAt: new Date().toISOString()
            };

            store.setCurrentUser(newUser, referralCodeInput);
            audioManager.playNotification();
            onSuccess();
            onClose();
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Erro ao realizar registo.');
        } finally {
          setLoading(false);
        }
        return;
      }

      // Fallback local caso chave anon não esteja definida
      const newUser = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        name,
        email,
        phone: `${countryCode} ${phone}`,
        countryCode,
        birthDate,
        deviceFingerprint: fp,
        avatar: selectedAvatar,
        role: 'player' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      store.setCurrentUser(newUser, referralCodeInput);
      audioManager.playNotification();
      onSuccess();
      onClose();
    } else if (tab === 'login') {
      if (!email || !password) return setErrorMsg('Preencha o email e a palavra-passe');

      if (email.toLowerCase().includes('admin')) {
        setErrorMsg('Contas administrativas devem usar o Portal Admin dedicado.');
        return;
      }

      setLoading(true);
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (error) {
            setLoading(false);
            return setErrorMsg(error.message);
          }

          if (data.user) {
            // ✅ Buscar perfil completo do Supabase (fonte de verdade) — ignorar localStorage stale
            let profileName = data.user.user_metadata?.name || email.split('@')[0];
            let profileAvatar = data.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`;
            let profilePhone = data.user.user_metadata?.phone || '';
            let profileRole: 'player' | 'admin' = (data.user.user_metadata?.role as any) || 'player';
            let profileIsVerified = false;
            let profileVerificationStatus: 'verified' | 'unverified' = 'unverified';
            let profileReferralCode: string | undefined;
            let profileReferralCount = 0;
            let profileReferralEarnings = 0;
            let profileCreatedAt = data.user.created_at || new Date().toISOString();

            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();

              if (profile) {
                profileName = profile.name || profileName;
                profileAvatar = profile.avatar_url || profileAvatar;
                profilePhone = profile.phone || profilePhone;
                profileRole = profile.role || profileRole;
                profileIsVerified = profile.is_verified || false;
                profileVerificationStatus = profile.is_verified ? 'verified' : 'unverified';
                profileReferralCode = profile.referral_code;
                profileReferralCount = profile.referral_count || 0;
                profileReferralEarnings = Number(profile.referral_earnings || 0);
                profileCreatedAt = profile.created_at || profileCreatedAt;

                // Atualizar last_login_at no Supabase
                await supabase
                  .from('profiles')
                  .update({ last_login_at: new Date().toISOString() })
                  .eq('id', data.user.id);
              }
            } catch {
              // Se falhar, usar dados do token (fallback seguro)
            }

            const loggedUser = {
              id: data.user.id,
              name: profileName,
              email: data.user.email || email,
              phone: profilePhone,
              avatar: profileAvatar,
              role: profileRole,
              status: 'active' as const,
              isVerified: profileIsVerified,
              verificationStatus: profileVerificationStatus,
              referralCode: profileReferralCode,
              referralCount: profileReferralCount,
              referralEarnings: profileReferralEarnings,
              createdAt: profileCreatedAt,
              lastLoginAt: new Date().toISOString()
            };
            store.setCurrentUser(loggedUser);
            audioManager.playNotification();
            onSuccess();
            onClose();
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Erro ao efetuar login.');
        } finally {
          setLoading(false);
        }
        return;
      }

      store.switchRole('player');
      audioManager.playNotification();
      onSuccess();
      onClose();
    } else {
      if (!email) return setErrorMsg('Insira o seu email');
      setLoading(true);
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        setLoading(false);
        if (error) return setErrorMsg(error.message);
      } else {
        setLoading(false);
      }
      alert('Instruções para redefinir a palavra-passe enviadas para ' + email);
      setTab('login');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/40 relative">
        <button
          id="btn-close-auth"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-950 border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-cyber font-bold tracking-wider transition cursor-pointer ${
              tab === 'login' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('nav.login', 'ENTRAR')}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-cyber font-bold tracking-wider transition cursor-pointer ${
              tab === 'register' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('nav.register', 'CRIAR CONTA')}
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {tab === 'register' ? (
            <>
              {/* Email */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">{t('auth.email', 'Endereço de E-mail')}</label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="email@dominio.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-white outline-none"
                  />
                </div>
              </div>

              {/* Senha e Confirmar Senha Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Senha de Acesso</label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                    <Lock className="w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Confirmar Senha</label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                    <Lock className="w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-transparent text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Nome de Utilizador */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">{t('auth.username', 'Nome de Usuário / Apelido')}</label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Seu Apelido no Jogo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent text-white outline-none"
                  />
                </div>
              </div>

              {/* Avatar Selection Row */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1 flex items-center justify-between">
                  <span>Escolha a sua Ave / Mascote Avatar</span>
                  <span className="text-[10px] text-cyan-400 font-mono">🦅 Aves & Fauna</span>
                </label>
                <div className="flex items-center justify-between gap-3 bg-slate-950 border border-cyan-500/30 rounded-xl p-2.5">
                  <div className="flex items-center gap-3">
                    <img
                      src={selectedAvatar}
                      alt="Avatar"
                      className="w-10 h-10 rounded-xl object-cover border-2 border-cyan-400 shadow-md shadow-cyan-500/30"
                    />
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-white leading-tight">
                        {ANIMAL_AVATARS.find(a => a.url === selectedAvatar)?.name || 'Avatar de Voo'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {ANIMAL_AVATARS.find(a => a.url === selectedAvatar)?.emoji || '🦅'} Clique para alterar
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      audioManager.playButtonClick();
                      setIsAvatarModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-cyber font-bold text-[11px] transition cursor-pointer"
                  >
                    ALTERAR
                  </button>
                </div>
              </div>

              {/* WhatsApp Contact with Country Code Selector */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Contacto via WhatsApp</label>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl p-1 focus-within:border-cyan-500">
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white">
                    <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="bg-transparent text-white text-xs font-semibold outline-none cursor-pointer"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code + c.country} value={c.code} className="bg-slate-900 text-white">
                          {c.flag} {c.code} ({c.country.split(' ')[0]})
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="tel"
                    required
                    placeholder="923 000 000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-transparent text-white outline-none px-2 py-1.5"
                  />
                </div>
              </div>

              {/* Birth Date & Auto 18+ Verification */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold block">Data de Nascimento</label>
                  {birthDate && (
                    checkIsAdult(birthDate) ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-md">
                        <CheckCircle className="w-3 h-3" /> maior de 18 anos
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-950/60 border border-red-800 px-2 py-0.5 rounded-md">
                        <AlertTriangle className="w-3 h-3" /> menor de 18 anos
                      </span>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-transparent text-white outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Referral Code (Optional) */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Código de Referência / Convite (Opcional)</label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                  <span className="text-amber-400 font-bold text-xs font-mono">🎁</span>
                  <input
                    type="text"
                    placeholder="EX: SKY-ALEX1"
                    value={referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                    className="w-full bg-transparent text-white outline-none font-mono uppercase text-xs"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="rounded accent-cyan-500 cursor-pointer"
                />
                <label htmlFor="terms" className="text-slate-400 text-[11px] cursor-pointer">
                  +18 / Declaro ter idade legal e aceito os {t('footer.rights', 'Termos & Condições')}
                </label>
              </div>
            </>
          ) : (
            <>
              {/* Form de Login */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">{t('auth.email', 'Email')}</label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="email@dominio.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">{t('auth.password', 'Senha de Acesso')}</label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-cyan-500">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-white outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-cyber font-bold tracking-wider uppercase shadow-lg shadow-cyan-500/30 transition cursor-pointer mt-2 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading
              ? 'A PROCESSAR...'
              : tab === 'login'
              ? t('auth.submitLogin', 'ENTRAR AGORA')
              : t('auth.submitRegister', 'CRIAR CONTA & RECEBER BÔNUS')}
          </button>

          {/* Separador e Botão de Login com Google / Cloud */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono">
              <span className="bg-slate-900 px-3 text-slate-500 font-bold">OU ENTRAR COM</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-white font-cyber font-bold text-xs tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-3 shadow-md hover:border-cyan-500/50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.6 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            <span>ENTRAR COM GOOGLE / CLOUD</span>
          </button>
        </form>
      </div>

      <AvatarSelectorModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatarUrl={selectedAvatar}
        onSelectAvatar={(url) => {
          setSelectedAvatar(url);
          setIsAvatarModalOpen(false);
        }}
      />
    </div>
  );
};
