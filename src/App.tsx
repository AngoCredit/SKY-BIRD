import React, { useState, useEffect } from 'react';
import {
  Rocket,
  Wallet as WalletIcon,
  Headphones,
  ShieldAlert,
  Gamepad2,
  LogOut,
  PlusCircle,
  Volume2,
  VolumeX,
  Sparkles,
} from 'lucide-react';
import { store } from './services/store';
import { supabase, isSupabaseConfigured } from './services/supabase';
import { audioManager } from './services/audioManager';
import { User, Wallet } from './types';

// Views & Components
import { LandingPage } from './components/landing/LandingPage';
import { GameView } from './components/game/GameView';
import { WalletView } from './components/wallet/WalletView';
import { SupportChat } from './components/support/SupportChat';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { DepositModal } from './components/wallet/DepositModal';
import { WithdrawalModal } from './components/wallet/WithdrawalModal';
import { AuthModal } from './components/auth/AuthModal';
import { AvatarSelectorModal } from './components/common/AvatarSelectorModal';
import { AirtmNotification } from './components/common/AirtmNotification';
import { LanguageSelector } from './components/common/LanguageSelector';
import { NotificationToast } from './components/common/NotificationToast';
import { useTranslation } from './services/i18n';
import { usePreventDevTools } from './hooks/usePreventDevTools';

export function App() {
  const { isDevToolsOpen } = usePreventDevTools();
  const { t } = useTranslation();
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const [currentUser, setCurrentUser] = useState<User>(store.getCurrentUser());
  const [wallet, setWallet] = useState<Wallet>(store.getWallet(currentUser.id));
  const [currentView, setCurrentView] = useState<'landing' | 'game' | 'wallet' | 'support' | 'admin' | 'admin-login'>(() => {
    const user = store.getCurrentUser();
    const isGuestUser = user.id === 'usr_guest' || !user.email;
    const isAdminUser = user.role === 'admin';
    const hash = window.location.hash.toLowerCase().replace('#', '');

    if (['landing', 'game', 'wallet', 'support', 'admin', 'admin-login'].includes(hash)) {
      if (hash === 'admin' && !isAdminUser && !isSupabaseConfigured) return 'admin-login';
      if ((hash === 'game' || hash === 'wallet') && isGuestUser && !isSupabaseConfigured) return 'landing';
      return hash as any;
    }

    const savedView = localStorage.getItem('skybird_current_view');
    if (savedView && ['landing', 'game', 'wallet', 'support', 'admin', 'admin-login'].includes(savedView)) {
      if (savedView === 'admin' && !isAdminUser && !isSupabaseConfigured) return 'admin-login';
      if ((savedView === 'game' || savedView === 'wallet') && isGuestUser && !isSupabaseConfigured) return 'landing';
      return savedView as any;
    }

    if (isAdminUser) return 'admin';
    return isGuestUser ? 'landing' : 'game';
  });

  // Modal States
  const [isDepositOpen, setIsDepositOpen] = useState<boolean>(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [autoRequestExpress, setAutoRequestExpress] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(audioManager.getConfig().muted);

  // Persist view state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('skybird_current_view', currentView);
  }, [currentView]);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      const u = store.getCurrentUser();
      setCurrentUser(u);
      setWallet(store.getWallet(u.id));
    });

    if (isSupabaseConfigured) {
      // Helper para garantir a existência de perfil e carteira no Supabase
      const syncUserProfile = async (su: any) => {
        let userRole: 'player' | 'admin' = (su.user_metadata?.role as any) || 'player';
        let userName = su.user_metadata?.name || su.user_metadata?.full_name || su.email?.split('@')[0] || 'Piloto';
        let userAvatar = su.user_metadata?.avatar_url || su.user_metadata?.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${su.id}`;

        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', su.id)
            .maybeSingle();

          if (profile) {
            userRole = profile.role as any || userRole;
            userName = profile.name || userName;
            userAvatar = profile.avatar_url || userAvatar;
          } else {
            // Se o perfil não existe (ex: login com Google 1ª vez), criar automaticamente
            await supabase.from('profiles').upsert({
              id: su.id,
              name: userName,
              email: su.email || '',
              avatar_url: userAvatar,
              role: userRole,
              status: 'active',
              is_verified: false,
              verification_status: 'unverified',
              created_at: su.created_at || new Date().toISOString(),
              last_login_at: new Date().toISOString()
            }, { onConflict: 'id' });

            // Criar a carteira inicial ($0) se não existir
            await supabase.from('wallets').upsert({
              user_id: su.id,
              available_balance: 0,
              locked_balance: 0,
              currency: 'USD',
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
          }
        } catch (err) {
          console.error('[Supabase Auth Sync] Erro ao sincronizar perfil:', err);
        }

        const u: User = {
          id: su.id,
          name: userName,
          email: su.email || '',
          avatar: userAvatar,
          role: userRole,
          status: 'active',
          createdAt: su.created_at || new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };
        store.setCurrentUser(u);
        return u;
      };

      // Monitor Supabase Auth Session Changes
      // Safety timeout: guarantee loading clears within 10s even if Supabase hangs
      const safetyTimeout = setTimeout(() => {
        setIsAuthLoading(false);
      }, 10000);

      const initAuthSession = async () => {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) {
            console.warn('[Supabase Auth Init] Token expirado ou inválido. A limpar sessão local:', error.message);
            // Limpar tokens do Supabase expirados do localStorage se a sessão for inválida
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
                localStorage.removeItem(key);
              }
            }
          } else if (session?.user) {
            const u = await syncUserProfile(session.user);
            const hash = window.location.hash.toLowerCase().replace('#', '');
            const savedView = localStorage.getItem('skybird_current_view');
            const targetView = hash || savedView;

            if (targetView === 'admin') {
              setCurrentView(u.role === 'admin' ? 'admin' : 'admin-login');
            } else if (targetView === 'game' || targetView === 'wallet' || targetView === 'support') {
              setCurrentView(targetView as any);
            } else {
              setCurrentView(u.role === 'admin' ? 'admin' : 'game');
            }
          }
        } catch (err) {
          console.error('[Supabase Auth Init] Erro:', err);
        } finally {
          clearTimeout(safetyTimeout);
          setIsAuthLoading(false);
        }
      };

      initAuthSession();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const u = await syncUserProfile(session.user);
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            setIsAuthOpen(false);
            if (currentView === 'admin-login' && u.role === 'admin') {
              setCurrentView('admin');
            }
          }
        } else if (event === 'SIGNED_OUT') {
          store.logout();
          setCurrentView('landing');
        }
        setIsAuthLoading(false);
      });

      return () => {
        clearTimeout(safetyTimeout);
        unsub();
        subscription.unsubscribe();
      };
    }

    setIsAuthLoading(false);
    return () => unsub();
  }, []);

  // ── 5-Minute Inactivity Auto-Logout for Admin Sessions ─────────────────────
  useEffect(() => {
    if (currentUser.role !== 'admin' || (currentView !== 'admin' && currentView !== 'admin-login')) {
      return;
    }

    const INACTIVITY_LIMIT_MS = 5 * 60 * 1000; // 5 minutos
    let inactivityTimer: ReturnType<typeof setTimeout>;

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        console.warn('[Admin Security] 5 minutos sem atividade detectados. Desconectando admin...');
        store.logoutAdmin();
        if (isSupabaseConfigured) {
          supabase.auth.signOut().catch(() => {});
        }
        setCurrentView('admin-login');
      }, INACTIVITY_LIMIT_MS);
    };

    // Events to track user activity (mouse movement, keypresses, clicks, touches)
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetInactivityTimer, { passive: true }));

    // Start timer on mount
    resetInactivityTimer();

    return () => {
      clearTimeout(inactivityTimer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetInactivityTimer));
    };
  }, [currentUser.role, currentView]);

  // Hash Navigation Handler (supports bookmarking #admin-login, #admin, etc.)
  useEffect(() => {
    const handleHash = () => {
      const isGuestUser = currentUser.id === 'usr_guest' || !currentUser.email;
      const hash = window.location.hash.toLowerCase();
      if (hash === '#admin-login') {
        setCurrentView('admin-login');
      } else if (hash === '#admin') {
        setCurrentView(isGuestUser ? 'admin-login' : 'admin');
      } else if (hash === '#game') {
        setCurrentView(isGuestUser ? 'landing' : 'game');
      } else if (hash === '#wallet') {
        setCurrentView(isGuestUser ? 'landing' : 'wallet');
      } else if (hash === '#support') {
        setCurrentView('support');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [currentUser]);

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  const handleStartGame = () => {
    // Guests must log in or register before accessing the game
    if (isGuest) {
      setAuthMode('register');
      setIsAuthOpen(true);
      return;
    }
    setCurrentView('game');
  };

  const handleOpenSupportExpress = () => {
    if (isGuest) {
      setAuthMode('register');
      setIsAuthOpen(true);
      return;
    }
    setAutoRequestExpress(true);
    setCurrentView('support');
  };

  const toggleSound = () => {
    const muted = audioManager.toggleMute();
    setIsMuted(muted);
  };

  // A user is a guest (not authenticated) when their id is 'usr_guest' or they have no email
  const isGuest = currentUser.id === 'usr_guest' || !currentUser.email;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#05070D] flex flex-col items-center justify-center p-6 text-center font-sans selection:bg-cyan-500/30">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 shadow-xl shadow-cyan-500/30 animate-pulse mb-4">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <Rocket className="w-8 h-8 text-cyan-400 transform -rotate-45" />
          </div>
        </div>
        <h2 className="font-cyber font-black text-xl text-white tracking-wider mb-2">
          SKY<span className="text-cyan-400">BIRD</span> 3D
        </h2>
        <p className="text-xs text-slate-400 font-mono animate-pulse">
          A inicializar sessão e dados do sistema...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070D] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Header Bar (when not in landing page and not in dedicated admin login) */}
      {currentView !== 'landing' && currentView !== 'admin-login' && (
        <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
            {/* Top-Left: Language Selector + Brand Logo */}
            <div className="flex items-center gap-3 sm:gap-4">
              <LanguageSelector />
              <div className="h-6 w-px bg-slate-800 hidden sm:block" />
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setCurrentView('landing')}
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 shadow-lg shadow-cyan-500/30">
                  <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                    <Rocket className="w-4 h-4 text-cyan-400 transform -rotate-45" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-cyber font-black text-xl tracking-wider text-white">
                    SKY<span className="text-cyan-400">BIRD</span>
                  </span>
                  <span className="text-[8px] uppercase tracking-widest text-cyan-400/80 -mt-1 font-mono">
                    3D Crash Game
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 sm:gap-2">
              {currentUser.role !== 'admin' && (
                <>
                  <button
                    id="nav-tab-game"
                    onClick={() => {
                      audioManager.playButtonClick();
                      if (isGuest) {
                        setAuthMode('register');
                        setIsAuthOpen(true);
                      } else {
                        setCurrentView('game');
                      }
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                      currentView === 'game'
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    <Gamepad2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('nav.play', 'Jogar')}</span>
                  </button>

                  <button
                    id="nav-tab-wallet"
                    onClick={() => {
                      audioManager.playButtonClick();
                      if (isGuest) {
                        setAuthMode('register');
                        setIsAuthOpen(true);
                      } else {
                        setCurrentView('wallet');
                      }
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                      currentView === 'wallet'
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    <WalletIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('nav.wallet', 'Carteira')}</span>
                  </button>
                </>
              )}

              <button
                id="nav-tab-support"
                onClick={() => {
                  audioManager.playButtonClick();
                  if (isGuest) {
                    setAuthMode('register');
                    setIsAuthOpen(true);
                  } else {
                    setAutoRequestExpress(false);
                    setCurrentView('support');
                  }
                }}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                  currentView === 'support'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Headphones className="w-4 h-4" />
                <span className="hidden sm:inline">{t('nav.support', 'Suporte')}</span>
              </button>

              {currentUser.role === 'admin' && (
                <button
                  id="nav-tab-admin"
                  onClick={() => {
                    audioManager.playButtonClick();
                    setCurrentView('admin');
                  }}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                    currentView === 'admin'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                      : 'text-amber-400 hover:bg-amber-950/40 border border-amber-500/30'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">{t('nav.admin', 'Admin Console')}</span>
                </button>
              )}
            </nav>

            {/* Right: Balance Pill (Players only) & Profile/Logout */}
            <div className="flex items-center gap-3">
              {/* Balance & Deposit Button — HIDDEN FOR ADMIN */}
              {currentUser.role !== 'admin' && (
                <div className="flex items-center p-1 rounded-2xl bg-slate-950/90 border border-cyan-500/30 shadow-inner">
                  <div className="px-3 py-1 text-right">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-mono">
                      {t('game.balance', 'Saldo USD')}
                    </span>
                    <span className="font-cyber font-black text-xs sm:text-sm text-emerald-400">
                      ${wallet.availableBalance.toFixed(2)}
                    </span>
                  </div>
                  <button
                    id="btn-header-deposit"
                    type="button"
                    onClick={() => {
                      audioManager.playButtonClick();
                      setIsDepositOpen(true);
                    }}
                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold text-xs flex items-center gap-1 transition shadow-md shadow-cyan-500/30 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('nav.deposit', 'DEPOSITAR')}</span>
                  </button>
                </div>
              )}

              {/* User Profile Badge & Universal Logout */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    audioManager.playButtonClick();
                    setIsAvatarOpen(true);
                  }}
                  title="Alterar Avatar de Ave / Animal"
                  className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 transition cursor-pointer group"
                >
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-lg object-cover border border-cyan-500/30 group-hover:scale-105 transition-transform"
                  />
                  <div className="flex flex-col text-left">
                    <span className="text-[11px] font-bold text-white leading-tight max-w-[100px] truncate">
                      {currentUser.name}
                    </span>
                    <span className="text-[9px] font-mono text-cyan-400 capitalize flex items-center gap-1">
                      <span>{currentUser.role === 'admin' ? '⚡ ADMIN' : '🎮 JOGADOR'}</span>
                      <span className="text-[8px] text-slate-500 group-hover:text-cyan-300">✏️</span>
                    </span>
                  </div>
                </button>

                <button
                  id="btn-header-logout"
                  type="button"
                  onClick={() => {
                    audioManager.playButtonClick();
                    if (isSupabaseConfigured) {
                      supabase.auth.signOut();
                    }
                    // Use the correct logout method based on current role
                    if (currentUser.role === 'admin') {
                      store.logoutAdmin();
                    } else {
                      store.logout();
                    }
                    setCurrentView('landing');
                  }}
                  title="Sair / Desconectar Conta"
                  className="p-2 rounded-xl bg-slate-900 hover:bg-red-950/70 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-800 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                >
                  <LogOut className="w-4 h-4 text-red-400" />
                  <span className="hidden lg:inline">{t('nav.logout', 'Sair')}</span>
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* View Content Renderer */}
      <main className={`flex-1 w-full flex flex-col ${currentView === 'admin-login' || currentView === 'landing' ? 'p-0' : 'p-3 sm:p-6'}`}>
        {currentView === 'landing' && (
          <LandingPage
            onStartGame={handleStartGame}
            onOpenAuth={handleOpenAuth}
            onOpenSupport={() => setCurrentView('support')}
            onOpenAdminLogin={() => setCurrentView('admin-login')}
          />
        )}

        {currentView === 'admin-login' && (
          <AdminLoginPage
            onLoginSuccess={() => setCurrentView('admin')}
            onBackToApp={() => setCurrentView('game')}
          />
        )}

        {currentView === 'game' && (
          <GameView
            currentUser={currentUser}
            onOpenDeposit={() => setIsDepositOpen(true)}
            onOpenSupport={() => setCurrentView('support')}
          />
        )}

        {currentView === 'wallet' && (
          <WalletView
            currentUser={currentUser}
            onOpenDeposit={() => setIsDepositOpen(true)}
            onOpenWithdraw={() => setIsWithdrawOpen(true)}
            onAccountDeleted={() => setCurrentView('landing')}
          />
        )}

        {currentView === 'support' && (
          <SupportChat
            currentUser={currentUser}
            autoRequestExpress={autoRequestExpress}
          />
        )}

        {currentView === 'admin' && (
          currentUser.role === 'admin' ? (
            <AdminDashboard
              currentUser={currentUser}
              onExitAdmin={() => setCurrentView('game')}
              onLogoutAdmin={() => {
                store.logoutAdmin();
                setCurrentView('admin-login');
              }}
            />
          ) : (
            <AdminLoginPage
              onLoginSuccess={() => setCurrentView('admin')}
              onBackToApp={() => setCurrentView('game')}
            />
          )
        )}
      </main>

      {/* Global Modals */}
      <DepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
      />

      <WithdrawalModal
        isOpen={isWithdrawOpen}
        availableBalance={wallet.availableBalance}
        onClose={() => setIsWithdrawOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        initialTab={authMode}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => setCurrentView('game')}
        onOpenAdminLogin={() => {
          setIsAuthOpen(false);
          setCurrentView('admin-login');
        }}
      />

      <AvatarSelectorModal
        isOpen={isAvatarOpen}
        onClose={() => setIsAvatarOpen(false)}
        currentAvatarUrl={currentUser.avatar}
      />

      {/* Automated Airtm Notification & System Visual/Sound Notifications */}
      <AirtmNotification />
      <NotificationToast />

      {/* ── DevTools Blocker Overlay ─────────────────────────────────────── */}
      {isDevToolsOpen && (
        <div
          aria-modal="true"
          role="alertdialog"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483647,
            background: '#000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            userSelect: 'none',
            pointerEvents: 'all',
          }}
        >
          {/* Animated warning icon */}
          <div style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            border: '3px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'devtools-pulse 1.6s ease-in-out infinite',
          }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
            <p style={{
              fontFamily: 'monospace',
              fontSize: 11,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: '#ef4444',
              marginBottom: 12,
            }}>⛔ Acesso Restrito</p>

            <h1 style={{
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(22px, 4vw, 32px)',
              color: '#fff',
              margin: '0 0 16px',
              lineHeight: 1.2,
            }}>
              Feche o DevTools
            </h1>

            <p style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 15,
              color: '#94a3b8',
              lineHeight: 1.6,
              margin: 0,
            }}>
              Esta plataforma detectou que as ferramentas de programador estão abertas.
              <br />
              Por favor, feche-as para continuar a usar o Skybird.
            </p>
          </div>

          {/* Inline keyframes via style tag */}
          <style>{`
            @keyframes devtools-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
              50% { box-shadow: 0 0 0 18px rgba(239,68,68,0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('Captured runtime error:', event.error);
    };
    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-cyan-400 mb-4 animate-bounce">
          <Rocket className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-cyber font-bold text-white mb-2">SKYBIRD 3D CRASH</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          A aplicação encontrou uma pequena instabilidade temporária.
        </p>
        <button
          onClick={() => {
            setHasError(false);
            window.location.reload();
          }}
          className="px-6 py-3 rounded-xl bg-cyan-500 text-slate-950 font-cyber font-bold text-sm hover:bg-cyan-400 transition cursor-pointer"
        >
          RECARREGAR APLICAÇÃO
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export default function RootApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

