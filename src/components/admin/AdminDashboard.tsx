import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Users,
  Gamepad2,
  Wallet,
  Settings,
  Headphones,
  History,
  FileText,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  X,
  Send,
  Lock,
  Zap,
  RefreshCw,
  Sliders,
  DollarSign,
  LogOut,
  Trash2,
  ShieldCheck,
  ShieldX,
  Eye,
  Phone,
  Volume2,
  VolumeX,
  Music,
  Play,
  Square,
  Sparkles,
  Upload
} from 'lucide-react';
import { store } from '../../services/store';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { audioManager } from '../../services/audioManager';
import {
  User,
  GameRound,
  WalletTransaction,
  SupportConversation,
  AdminSettings,
  AuditLog,
  VerificationRequest
} from '../../types';

interface AdminDashboardProps {
  currentUser: User;
  onExitAdmin: () => void;
  onLogoutAdmin?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onExitAdmin,
  onLogoutAdmin
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'rounds' | 'transactions' | 'support' | 'audio' | 'settings' | 'audit' | 'kyc'
  >(() => {
    const savedTab = localStorage.getItem('skybird_admin_active_tab');
    if (savedTab && ['overview', 'users', 'rounds', 'transactions', 'support', 'audio', 'settings', 'audit', 'kyc'].includes(savedTab)) {
      return savedTab as any;
    }
    return 'overview';
  });

  useEffect(() => {
    localStorage.setItem('skybird_admin_active_tab', activeTab);
  }, [activeTab]);

  const [users, setUsers] = useState<User[]>(store.getAllUsers());
  const [rounds, setRounds] = useState<GameRound[]>(store.getPastRounds());
  const [transactions, setTransactions] = useState<WalletTransaction[]>(store.getAllTransactions());
  const [conversations, setConversations] = useState<SupportConversation[]>(store.getAllConversations());
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(store.getAdminSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(store.getAuditLogs());
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>(store.getVerificationRequests());
  const [kycRejectReason, setKycRejectReason] = useState('');
  const [kycPreviewImage, setKycPreviewImage] = useState<string | null>(null);
  const [adminToast, setAdminToast] = useState<{ title: string; message: string } | null>(null);

  // Support Reply State
  const [selectedConvId, setSelectedConvId] = useState<string>(conversations[0]?.id || '');
  const [replyText, setReplyText] = useState('');
  const [airtmLinkInput, setAirtmLinkInput] = useState('https://app.airtm.com/pay/skybird-official');

  // Audio & Sound Management State
  const [bgMusicUrlInput, setBgMusicUrlInput] = useState<string>(audioManager.getBackgroundMusicUrl() || '');
  const [audioEngineMode, setAudioEngineMode] = useState<'hybrid' | 'procedural' | 'external_only'>(audioManager.getAudioEngineMode());
  const [customSfxUrls, setCustomSfxUrls] = useState<Record<string, string>>(audioManager.getCustomSfxUrls());
  const [masterVolume, setMasterVolume] = useState<number>(audioManager.getConfig().masterVolume);
  const [musicVolume, setMusicVolume] = useState<number>(audioManager.getConfig().musicVolume);
  const [sfxVolume, setSfxVolume] = useState<number>(audioManager.getConfig().sfxVolume);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(audioManager.getConfig().muted);
  const [playingPreviewEvent, setPlayingPreviewEvent] = useState<string | null>(null);

  // Audio File Upload Refs & Handlers
  const bgMusicFileRef = useRef<HTMLInputElement>(null);
  const sfxFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Admin toast helper
  const showAdminToast = (title: string, message: string) => {
    setAdminToast({ title, message });
    audioManager.playNotification();
    setTimeout(() => setAdminToast(null), 6000);
  };

  const handleBgMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showAdminToast('⚠️ Ficheiro muito grande', 'A música de fundo deve ter no máximo 20 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      if (result) {
        setBgMusicUrlInput(result);
        audioManager.setBackgroundMusicUrl(result);
        showAdminToast('🎵 Música Carregada!', `Ficheiro "${file.name}" carregado com sucesso.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSfxFileUpload = (sfxKey: string, sfxLabel: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showAdminToast('⚠️ Ficheiro muito grande', 'O efeito sonoro deve ter no máximo 15 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      if (result) {
        setCustomSfxUrls((prev) => {
          const updated = { ...prev, [sfxKey]: result };
          audioManager.setCustomSfxUrl(sfxKey, result);
          return updated;
        });
        showAdminToast('🔊 Efeito Sonoro Carregado!', `Áudio personalizado para "${sfxLabel}" carregado com sucesso.`);
      }
    };
    reader.readAsDataURL(file);
  };

  // Realtime Supabase listener for Admin — direct channel subscriptions
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Notify admin on new transactions (deposits / withdrawals) from any player
    const txChannel = supabase
      .channel('admin_tx_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
        const tx = payload.new as any;
        if (tx.type === 'deposit' || tx.type === 'withdrawal') {
          const label = tx.type === 'deposit' ? 'Novo Depósito' : 'Novo Saque';
          showAdminToast(label + ' Solicitado!', `$${Number(tx.amount).toFixed(2)} USD — Ref: ${tx.reference}`);
          store.syncTransactionFromSupabase(tx);
          setTransactions(store.getAllTransactions());
        }
      })
      // Also listen for UPDATE events (approve/reject from another admin session)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions' }, (payload) => {
        const tx = payload.new as any;
        store.syncTransactionFromSupabase(tx);
        setTransactions(store.getAllTransactions());
      })
      .subscribe();

    // Notify admin on new support messages from players
    const supportChannel = supabase
      .channel('admin_support_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_role === 'player') {
          showAdminToast('💬 Nova Mensagem de Suporte', `${msg.sender_name}: ${String(msg.text).slice(0, 60)}`);
          store.syncSupportMessageFromSupabase(msg);
          setConversations(store.getAllConversations());
        }
      })
      .subscribe();

    // Notify admin on new KYC submissions
    const kycChannel = supabase
      .channel('admin_kyc_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kyc_verifications' }, (payload) => {
        const kyc = payload.new as any;
        showAdminToast('🛡️ Nova Verificação KYC', `${kyc.user_name}: documentos submetidos para revisão.`);
        // Sync into local store
        const req = {
          id: kyc.id,
          userId: kyc.user_id,
          userName: kyc.user_name,
          userEmail: kyc.user_email,
          userAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${kyc.user_id}`,
          idDocumentImage: kyc.id_document_url || '',
          selfieImage: kyc.selfie_url || '',
          airtmAccount: kyc.airtm_account || '',
          whatsappNumber: kyc.whatsapp_number || '',
          status: kyc.status as any,
          submittedAt: kyc.submitted_at,
          reviewedAt: kyc.reviewed_at,
          rejectionReason: kyc.rejection_reason
        };
        store.syncKycFromSupabase(req);
        setVerificationRequests(store.getVerificationRequests());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
      supabase.removeChannel(supportChannel);
      supabase.removeChannel(kycChannel);
    };
  }, []);

  useEffect(() => {
    let txPollInterval: ReturnType<typeof setInterval> | null = null;

    const unsub = store.subscribe(() => {
      setUsers(store.getAllUsers());
      setRounds(store.getPastRounds());
      setTransactions(store.getAllTransactions());
      setConversations(store.getAllConversations());
      setAdminSettings(store.getAdminSettings());
      setAuditLogs(store.getAuditLogs());
      setVerificationRequests(store.getVerificationRequests());
    });

    // Se o Supabase estiver configurado, carregar todos os dados diretamente do banco de dados
    if (isSupabaseConfigured) {
      // 1. Perfis de Utilizadores
      supabase
        .from('profiles')
        .select('*')
        .then(({ data, error }) => {
          if (error) {
            console.warn('[AdminDashboard] Erro ao procurar perfis no Supabase:', error);
          } else if (data) {
            const fetchedUsers: User[] = data.map((profileData: any) => ({
              id: profileData.id,
              name: profileData.name || 'Jogador',
              email: profileData.email || '',
              phone: profileData.phone,
              avatar: profileData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.id}`,
              role: profileData.role || 'player',
              status: profileData.status || 'active',
              isVerified: profileData.is_verified || false,
              verificationStatus: profileData.is_verified ? 'verified' : 'unverified',
              referralCode: profileData.referral_code,
              referralCount: profileData.referral_count || 0,
              referralEarnings: Number(profileData.referral_earnings || 0),
              deviceFingerprint: profileData.device_fingerprint,
              createdAt: profileData.created_at,
              lastLoginAt: profileData.last_login_at
            }));
            store.syncAllUsers(fetchedUsers);
          }
          setUsers(store.getAllUsers());
        });

      // 2. Transações Financeiras (Depósitos e Saques)
      const fetchTransactions = () => {
        supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) {
              console.warn('[AdminDashboard] Erro ao buscar transações:', error);
            } else if (data) {
              data.forEach((txData: any) => {
                store.syncTransactionFromSupabase(txData);
              });
            }
            setTransactions(store.getAllTransactions());
          });
      };
      fetchTransactions();
      // Polling every 15s so new player deposits appear in admin without page reload
      txPollInterval = setInterval(fetchTransactions, 15000);

      // 3. Conversas de Suporte
      supabase
        .from('support_conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            data.forEach((convData: any) => {
              store.syncConversationFromSupabase(convData);
            });
            setConversations(store.getAllConversations());
          }
        });

      // 4. Mensagens de Suporte
      supabase
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            data.forEach((msgData: any) => {
              store.syncSupportMessageFromSupabase(msgData);
            });
          }
        });

      // 5. Verificações KYC — CRITICAL: Admin must see all submissions on load
      supabase
        .from('kyc_verifications')
        .select('*')
        .order('submitted_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.warn('[AdminDashboard] Erro ao buscar KYC do Supabase:', error);
          } else if (data && data.length > 0) {
            data.forEach((kyc: any) => {
              const req = {
                id: kyc.id,
                userId: kyc.user_id,
                userName: kyc.user_name,
                userEmail: kyc.user_email,
                userAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${kyc.user_id}`,
                idDocumentImage: kyc.id_document_url || '',
                selfieImage: kyc.selfie_url || '',
                airtmAccount: kyc.airtm_account || '',
                whatsappNumber: kyc.whatsapp_number || '',
                status: kyc.status as any,
                submittedAt: kyc.submitted_at,
                reviewedAt: kyc.reviewed_at,
                rejectionReason: kyc.rejection_reason
              };
              store.syncKycFromSupabase(req);
            });
            setVerificationRequests(store.getVerificationRequests());
          }
        });
    }

    return () => {
      unsub();
      if (txPollInterval !== null) clearInterval(txPollInterval);
    };
  }, []);

  // Summary Metrics
  const totalDeposits = transactions
    .filter((t) => t.type === 'deposit' && t.status === 'completed')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalWithdrawals = transactions
    .filter((t) => t.type === 'withdrawal' && t.status === 'completed')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalBetsVolume = rounds.reduce((acc, r) => acc + r.totalBetsAmount, 0);
  const totalPayouts = rounds.reduce((acc, r) => acc + r.totalPayoutAmount, 0);
  const grossRevenue = totalBetsVolume - totalPayouts;

  const handleUpdateSettings = (e: React.FormEvent) => {
    e.preventDefault();
    store.updateAdminSettings(adminSettings);
    audioManager.playNotification();
    alert('Configurações salvas e auditadas com sucesso!');
  };

  const handleAdminSupportReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvId || !replyText.trim()) return;

    store.adminReplyToSupport(selectedConvId, replyText);
    setReplyText('');
    audioManager.playNotification();
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 items-start">
      {/* Admin Realtime Toast Notification */}
      {adminToast && (
        <div className="fixed top-4 right-4 z-[9999] max-w-sm animate-in slide-in-from-right">
          <div className="bg-slate-900 border border-amber-500/60 rounded-2xl p-4 shadow-2xl shadow-amber-950/40 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-300 font-cyber">{adminToast.title}</p>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{adminToast.message}</p>
            </div>
            <button onClick={() => setAdminToast(null)} className="text-slate-500 hover:text-slate-300 transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Admin Sidebar */}
      <aside className="w-full lg:w-64 glass-panel rounded-3xl p-4 border border-cyan-500/30 shrink-0 space-y-1.5">
        <div className="p-3 mb-2 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="font-cyber font-bold text-white text-sm block">ADMIN CENTER</span>
            <span className="text-[10px] text-amber-400 font-mono">Controle Restrito</span>
          </div>
        </div>

        {[
          { id: 'overview', label: 'Dashboard Geral', icon: TrendingUp },
          { id: 'users', label: 'Gestão de Usuários', icon: Users },
          { id: 'kyc', label: 'Verificações KYC', icon: ShieldCheck, badge: verificationRequests.filter(r => r.status === 'pending').length },
          { id: 'rounds', label: 'Histórico & Fairness', icon: Gamepad2 },
          { id: 'transactions', label: 'Ledger & Saques', icon: Wallet, badge: transactions.filter(t => t.status === 'pending' || t.status === 'processing').length },
          { id: 'support', label: 'Central de Suporte', icon: Headphones },
          { id: 'audio', label: 'Gestão de Áudio & Som', icon: Volume2 },
          { id: 'settings', label: 'Parâmetros & RTP', icon: Sliders },
          { id: 'audit', label: 'Logs de Auditoria', icon: FileText }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                audioManager.playButtonClick();
                setActiveTab(tab.id as typeof activeTab);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{tab.label}</span>
              {'badge' in tab && (tab.badge as number) > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-slate-950/40 text-slate-950' : 'bg-amber-500 text-slate-950'
                }`}>
                  {tab.badge as number}
                </span>
              )}
            </button>
          );
        })}

        <div className="pt-4 mt-4 border-t border-slate-800 space-y-2">
          {onLogoutAdmin && (
            <button
              onClick={() => {
                audioManager.playButtonClick();
                onLogoutAdmin();
              }}
              className="w-full py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-200 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2 border border-red-900/40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Desconectar Admin</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Admin Content */}
      <main className="flex-1 w-full space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-cyber font-bold text-white">VISÃO GERAL DO SISTEMA</h2>
                <p className="text-xs text-slate-400">Métricas financeiras consolidadas e integridade do jogo.</p>
              </div>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-3 py-1 rounded-full border border-cyan-500/30">
                RTP Global: {adminSettings.globalRtp}%
              </span>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl glass-panel border border-white/10">
                <span className="text-xs text-slate-400 block mb-1">Total de Jogadores</span>
                <span className="text-2xl font-cyber font-bold text-white">
                  {users.filter((u) => u.role !== 'admin').length}
                </span>
              </div>
              <div className="p-4 rounded-2xl glass-panel border border-white/10">
                <span className="text-xs text-slate-400 block mb-1">Total Depositado</span>
                <span className="text-2xl font-cyber font-bold text-emerald-400">${totalDeposits.toFixed(2)}</span>
              </div>
              <div className="p-4 rounded-2xl glass-panel border border-white/10">
                <span className="text-xs text-slate-400 block mb-1">Total Sacado</span>
                <span className="text-2xl font-cyber font-bold text-amber-400">${totalWithdrawals.toFixed(2)}</span>
              </div>
              <div className="p-4 rounded-2xl glass-panel border border-cyan-500/30">
                <span className="text-xs text-slate-400 block mb-1">Gross Gaming Revenue</span>
                <span className="text-2xl font-cyber font-bold text-cyan-300">${grossRevenue.toFixed(2)}</span>
              </div>
            </div>

            {/* Pending Financial Approvals Warning Banner */}
            {transactions.filter((t) => t.status === 'pending' || t.status === 'processing').length > 0 && (
              <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-cyber font-bold text-amber-300">
                      {transactions.filter((t) => t.status === 'pending' || t.status === 'processing').length} Transação(ões) Financeira(s) Pendente(s)!
                    </h4>
                    <p className="text-xs text-slate-300">
                      Há depósitos ou saques aguardando validação manual e liberação de saldo pelo Administrador.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    audioManager.playButtonClick();
                    setActiveTab('transactions');
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-cyber font-bold text-xs uppercase transition cursor-pointer shrink-0 shadow-md shadow-amber-500/20"
                >
                  Ir para Aprovações
                </button>
              </div>
            )}

            {/* Live activity feed */}
            <div className="p-6 rounded-3xl glass-panel border border-white/10">
              <h3 className="text-sm font-cyber font-bold text-white uppercase tracking-wider mb-4">
                Volume de Apostas Recentes
              </h3>
              <div className="space-y-3">
                {rounds.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-cyan-400" />
                      <span className="font-bold text-white">Rodada #{r.roundNumber}</span>
                      <span className="text-slate-500 font-mono">({(r.crashPoint ?? 0).toFixed(2)}x)</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">Volume: ${(r.totalBetsAmount ?? 0).toFixed(2)}</span>
                      <span className="text-emerald-400 font-mono font-bold">Payout: ${(r.totalPayoutAmount ?? 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-4">
            <h2 className="text-xl font-cyber font-bold text-white">GESTÃO DE JOGADORES</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
                    <th className="pb-3">Usuário</th>
                    <th className="pb-3">Email / WhatsApp</th>
                    <th className="pb-3">Dispositivo / Fingerprint</th>
                    <th className="pb-3">Saldo</th>
                    <th className="pb-3">Verificação (KYC)</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.filter((u) => u.role !== 'admin').length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-mono text-xs">
                        Nenhum jogador registado na plataforma no momento.
                      </td>
                    </tr>
                  ) : (
                    users
                      .filter((u) => u.role !== 'admin')
                      .map((u) => {
                        const wallet = store.getWallet(u.id);
                        const fpShort = u.deviceFingerprint ? u.deviceFingerprint.slice(0, 12) + '...' : 'fp_browser';
                        const multiAccCount = users.filter((x) => x.deviceFingerprint && x.deviceFingerprint === u.deviceFingerprint).length;

                        return (
                          <tr key={u.id} className="hover:bg-slate-800/30">
                            <td className="py-3 font-semibold text-white flex items-center gap-2">
                              <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full bg-slate-800" />
                              <div>
                                <span className="block">{u.name}</span>
                                {u.referralCode && (
                                  <span className="text-[10px] text-amber-400 font-mono">Ref: {u.referralCode} ({u.referralCount || 0} convites)</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 text-slate-400">
                              <div>{u.email}</div>
                              {u.phone && <div className="text-[10px] text-emerald-400 font-mono">{u.phone}</div>}
                            </td>
                            <td className="py-3 text-slate-400 font-mono text-[10px]">
                              <div>{fpShort}</div>
                              {multiAccCount > 1 && (
                                <span className="inline-block px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px]">
                                  ⚠️ {multiAccCount} Contas no mesmo IP/Disp
                                </span>
                              )}
                            </td>
                            <td className="py-3 font-mono text-emerald-400 font-bold">
                              ${(wallet.availableBalance ?? 0).toFixed(2)} USD
                            </td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                                u.isVerified
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {u.isVerified ? 'Verificado' : 'Não Verificado'}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                                u.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                              }`}>
                                {u.status === 'active' ? 'Ativo' : 'Suspenso'}
                              </span>
                            </td>
                            <td className="py-3 text-right space-x-2">
                              <button
                                onClick={() => store.updateUserStatus(u.id, u.status === 'active' ? 'suspended' : 'active')}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                              >
                                {u.status === 'active' ? 'Suspender' : 'Ativar'}
                              </button>
                              {u.id !== currentUser.id && (
                                <button
                                  onClick={async () => {
                                    const confirmDelete = window.confirm(`Tem certeza que deseja EXCLUIR permanentemente a conta de ${u.name} (${u.email})? Esta ação não pode ser desfeita.`);
                                    if (confirmDelete) {
                                      const ok = await store.deleteUserAccount(u.id, 'Exclusão executada pelo Painel Admin');
                                      if (ok) {
                                        showAdminToast('🗑️ Utilizador Eliminado', `A conta de ${u.name} (${u.email}) foi eliminada com sucesso.`);
                                        audioManager.playNotification();
                                      } else {
                                        showAdminToast('⚠️ Erro ao Eliminar', `Não foi possível eliminar a conta de ${u.name}.`);
                                      }
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded bg-red-950/80 hover:bg-red-900 text-red-300 hover:text-white text-[11px] cursor-pointer flex items-center gap-1 border border-red-500/30 transition"
                                  title="Excluir conta permanentemente"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                  <span>Excluir</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* KYC VERIFICATION TAB */}
        {activeTab === 'kyc' && (
          <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-cyber font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                  VERIFICAÇÕES DE IDENTIDADE (KYC)
                </h2>
                <p className="text-xs text-slate-400">
                  Gerencie e valide os documentos de identidade dos utilizadores para liberação de limites de saque ($500 USD/dia).
                </p>
              </div>
              <div className="flex gap-2">
                <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold font-mono">
                  {verificationRequests.filter(r => r.status === 'pending').length} Pendentes
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                  {verificationRequests.filter(r => r.status === 'approved').length} Aprovados
                </span>
              </div>
            </div>

            {verificationRequests.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Nenhuma solicitação de verificação de identidade recebida até o momento.
              </div>
            ) : (
              <div className="space-y-4">
                {verificationRequests.map((req) => (
                  <div
                    key={req.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      req.status === 'pending'
                        ? 'bg-slate-900/90 border-cyan-500/40 shadow-lg shadow-cyan-950/20'
                        : req.status === 'approved'
                        ? 'bg-slate-950/60 border-emerald-500/20'
                        : 'bg-slate-950/60 border-rose-500/20'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                      {/* User Header */}
                      <div className="flex items-center gap-3">
                        <img
                          src={req.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.userId}`}
                          alt={req.userName}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                        />
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            {req.userName}
                            <span className="text-xs text-slate-400 font-mono font-normal">({req.userEmail})</span>
                          </h4>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Submetido em: {new Date(req.submittedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center gap-3">
                        {req.status === 'pending' && (
                          <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold font-mono animate-pulse">
                            Aguardando Revisão
                          </span>
                        )}
                        {req.status === 'approved' && (
                          <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono">
                            ✓ Aprovado ({req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : ''})
                          </span>
                        )}
                        {req.status === 'rejected' && (
                          <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-bold font-mono">
                            ✕ Recusado ({req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : ''})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Details & Document Images Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      {/* Document Photo */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                          Documento de Identidade
                        </span>
                        <div
                          className="w-full h-36 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden cursor-pointer relative group"
                          onClick={() => setKycPreviewImage(req.idDocumentImage)}
                        >
                          <img src={req.idDocumentImage} alt="Doc ID" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1 text-xs text-white">
                            <Eye className="w-4 h-4" /> Expandir
                          </div>
                        </div>
                      </div>

                      {/* Selfie Photo */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                          Selfie com Documento
                        </span>
                        <div
                          className="w-full h-36 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden cursor-pointer relative group"
                          onClick={() => setKycPreviewImage(req.selfieImage)}
                        >
                          <img src={req.selfieImage} alt="Selfie" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1 text-xs text-white">
                            <Eye className="w-4 h-4" /> Expandir
                          </div>
                        </div>
                      </div>

                      {/* Info & Admin Actions */}
                      <div className="space-y-3 flex flex-col justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                        <div className="space-y-2 font-mono">
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase">Conta Airtm para Saque</span>
                            <strong className="text-cyan-400 text-xs">{req.airtmAccount}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase">WhatsApp de Contacto</span>
                            <strong className="text-emerald-400 text-xs flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {req.whatsappNumber}
                            </strong>
                          </div>
                          {req.rejectionReason && (
                            <div className="pt-1 border-t border-slate-800 text-rose-400 text-[11px]">
                              Motivo Recusa: {req.rejectionReason}
                            </div>
                          )}
                        </div>

                        {/* Action buttons (only for pending requests) */}
                        {req.status === 'pending' && (
                          <div className="space-y-2 pt-2 border-t border-slate-800">
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  audioManager.playButtonClick();
                                  store.approveVerification(req.id);
                                }}
                                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-cyber font-bold text-[11px] uppercase transition cursor-pointer flex items-center justify-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Aprovar KYC
                              </button>
                            </div>

                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="Motivo da recusa..."
                                value={kycRejectReason}
                                onChange={(e) => setKycRejectReason(e.target.value)}
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-[11px] outline-none focus:border-rose-500 font-sans"
                              />
                              <button
                                onClick={() => {
                                  if (!kycRejectReason.trim()) return;
                                  audioManager.playButtonClick();
                                  store.rejectVerification(req.id, kycRejectReason.trim());
                                  setKycRejectReason('');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 font-cyber font-bold text-[11px] uppercase border border-rose-500/40 transition cursor-pointer flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" />
                                Recusar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Image Preview Lightbox */}
        {kycPreviewImage && (
          <div
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setKycPreviewImage(null)}
          >
            <img src={kycPreviewImage} alt="Document Zoom" className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" />
            <button className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ROUNDS & FAIRNESS TAB */}
        {activeTab === 'rounds' && (
          <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-4">
            <h2 className="text-xl font-cyber font-bold text-white">HISTÓRICO DE RODADAS & AUDITORIA DE SEEDS</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="pb-3">Rodada</th>
                    <th className="pb-3">Crash Point</th>
                    <th className="pb-3">Server Seed Hash (SHA-256)</th>
                    <th className="pb-3">Total Apostas</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {rounds.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="py-3 font-bold text-white">#{r.roundNumber}</td>
                      <td className="py-3 text-emerald-400 font-bold">{(r.crashPoint ?? 0).toFixed(2)}x</td>
                      <td className="py-3 text-slate-400 text-[10px] truncate max-w-xs">{r.serverSeedHash}</td>
                      <td className="py-3 text-slate-300">${(r.totalBetsAmount ?? 0).toFixed(2)}</td>
                      <td className="py-3 text-right">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px] font-sans">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TRANSACTIONS & APPROVALS TAB */}
        {activeTab === 'transactions' && (
          <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-cyber font-bold text-white">CENTRAL DE APROVAÇÃO FINANCEIRA & LEDGER</h2>
                <p className="text-xs text-slate-400">
                  Validação e liberação mandatória de depósitos e saques via Airtm sob controle exclusivo do Administrador.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-400 font-mono font-bold">
                  {transactions.filter((t) => t.status === 'pending' || t.status === 'processing').length} Pendentes
                </span>
              </div>
            </div>

            {/* Quick summary of pending items requiring action */}
            {transactions.filter((t) => t.status === 'pending' || t.status === 'processing').length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Ações Administrativas Pendentes ({transactions.filter((t) => t.status === 'pending' || t.status === 'processing').length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {transactions
                    .filter((t) => t.status === 'pending' || t.status === 'processing')
                    .map((pendingTx) => (
                      <div
                        key={pendingTx.id}
                        className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                pendingTx.type === 'deposit'
                                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/30'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {pendingTx.type === 'deposit' ? 'Depósito' : 'Saque'}
                            </span>
                            <span className="font-mono text-white font-bold">${(pendingTx.amount ?? 0).toFixed(2)} USD</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block mt-1">
                            {pendingTx.reference} {pendingTx.details ? `• ${pendingTx.details}` : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              audioManager.playNotification();
                              if (pendingTx.type === 'deposit') {
                                store.approveDeposit(pendingTx.id);
                              } else {
                                store.approveWithdrawal(pendingTx.id);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition shadow-sm"
                            title="Aprovar e Liberar"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Aprovar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              audioManager.playNotification();
                              if (pendingTx.type === 'deposit') {
                                store.rejectDeposit(pendingTx.id);
                              } else {
                                store.rejectWithdrawal(pendingTx.id);
                              }
                            }}
                            className="px-2 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
                            title="Recusar Transação"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Recusar</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Complete Ledger Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="pb-3">Data / Hora</th>
                    <th className="pb-3">Tipo</th>
                    <th className="pb-3">Usuário</th>
                    <th className="pb-3">Referência / Detalhes</th>
                    <th className="pb-3">Valor</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Ação Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-800/30">
                      <td className="py-3 text-slate-400">
                        {tx.createdAt ? `${new Date(tx.createdAt).toLocaleDateString()} ${new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—'}
                      </td>
                      <td className="py-3 uppercase font-bold text-cyan-400">{tx.type}</td>
                      <td className="py-3 text-slate-300 font-sans">{tx.userId}</td>
                      <td className="py-3 text-slate-300 max-w-xs truncate">
                        {tx.reference} {tx.details ? `(${tx.details})` : ''}
                      </td>
                      <td className="py-3 font-bold text-white">${(tx.amount ?? 0).toFixed(2)} USD</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            tx.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : tx.status === 'pending' || tx.status === 'processing'
                              ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                              : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {(tx.status === 'pending' || tx.status === 'processing') && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                audioManager.playNotification();
                                if (tx.type === 'deposit') {
                                  store.approveDeposit(tx.id);
                                } else {
                                  store.approveWithdrawal(tx.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-sm"
                              title="Aprovar Transação"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                audioManager.playNotification();
                                if (tx.type === 'deposit') {
                                  store.rejectDeposit(tx.id);
                                } else {
                                  store.rejectWithdrawal(tx.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-sm"
                              title="Recusar Transação"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUPPORT CONSOLE TAB */}
        {activeTab === 'support' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 p-4 rounded-3xl glass-panel border border-white/10 space-y-2">
              <span className="text-xs font-cyber font-bold text-white uppercase block mb-2">Conversas de Suporte</span>
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedConvId(c.id)}
                  className={`p-3 rounded-2xl transition cursor-pointer text-xs ${
                    selectedConvId === c.id ? 'bg-cyan-950/60 border border-cyan-500' : 'bg-slate-950 border border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white">{c.userName}</span>
                    <span className="text-[10px] text-slate-500">{c.status}</span>
                  </div>
                  <p className="text-slate-400 truncate">{c.lastMessage}</p>
                </div>
              ))}
            </div>

            <div className="md:col-span-7 p-6 rounded-3xl glass-panel border border-white/10 flex flex-col justify-between h-[480px]">
              <div>
                <h3 className="text-sm font-cyber font-bold text-white uppercase mb-4">Responder Atendimento</h3>
                <form onSubmit={handleAdminSupportReply} className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Mensagem de Resposta</label>
                    <textarea
                      rows={4}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Olá! Seu pagamento foi verificado..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                      Link Airtm Oficial (Opcional)
                    </label>
                    <input
                      type="text"
                      value={airtmLinkInput}
                      onChange={(e) => setAirtmLinkInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 font-mono text-cyan-300 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold uppercase transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>ENVIAR RESPOSTA OFICIAL</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS & RTP TAB */}
        {activeTab === 'settings' && (
          <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-6">
            <h2 className="text-xl font-cyber font-bold text-white">PARÂMETROS GLOBAIS DO JOGO (HOUSE EDGE & RTP)</h2>
            <form onSubmit={handleUpdateSettings} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">RTP Global (%)</label>
                <input
                  type="number"
                  step={0.1}
                  min={20.1}
                  max={99}
                  value={adminSettings.globalRtp}
                  onChange={(e) => {
                    const rtp = parseFloat(e.target.value) || 20.1;
                    setAdminSettings({
                      ...adminSettings,
                      globalRtp: rtp,
                      houseEdge: parseFloat((100 - rtp).toFixed(1))
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">House Edge (%)</label>
                <input
                  type="number"
                  disabled
                  value={adminSettings.houseEdge}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-amber-400 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Aposta Mínima ($ USD)</label>
                <input
                  type="number"
                  step={0.1}
                  value={adminSettings.minBet}
                  onChange={(e) => setAdminSettings({ ...adminSettings, minBet: parseFloat(e.target.value) || 0.5 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Aposta Máxima ($ USD)</label>
                <input
                  type="number"
                  value={adminSettings.maxBet}
                  onChange={(e) => setAdminSettings({ ...adminSettings, maxBet: parseFloat(e.target.value) || 500 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Status do Suporte 24/7</label>
                <select
                  value={adminSettings.supportStatus}
                  onChange={(e) => setAdminSettings({ ...adminSettings, supportStatus: e.target.value as AdminSettings['supportStatus'] })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white"
                >
                  <option value="online">🟢 Online</option>
                  <option value="busy">🟡 Ocupado (Auto-Fila)</option>
                  <option value="offline">⚫ Offline</option>
                </select>
              </div>

              <div className="sm:col-span-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>ALGORITMO ATIVO: MODO HARD & VOO ADAPTATIVO</span>
                </div>
                <p className="text-amber-200/80 leading-relaxed">
                  Sequência aleatória calibrada para ganho Hard (alta probabilidade de quedas rápidas entre 1.00x e 1.95x). Caso todos os apostadores reais retirem suas apostas, o sistema sustenta o pássaro por mais tempo no ar mantendo 3 a 4 bots fictícios que simulam saques antecipados ou perdas na queda final.
                </p>
              </div>

              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  className="w-full py-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold uppercase transition cursor-pointer"
                >
                  SALVAR ALTERAÇÕES & REGISTRAR NO AUDIT LOG
                </button>
              </div>
            </form>
          </div>
        )}

        {/* AUDIO MANAGEMENT TAB */}
        {activeTab === 'audio' && (
          <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <h2 className="text-xl font-cyber font-bold text-white flex items-center gap-2">
                  <Volume2 className="w-6 h-6 text-amber-400" />
                  GESTÃO DE ÁUDIO E TRILHA SONORA DO JOGO
                </h2>
                <p className="text-xs text-slate-400">
                  Configure a música de fundo principal, efeitos sonoros dos eventos de voo, modo do motor de áudio e níveis de volume.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  audioManager.saveAudioSettings(
                    bgMusicUrlInput.trim() || null,
                    customSfxUrls,
                    audioEngineMode,
                    { masterVolume, musicVolume, sfxVolume, muted: isAudioMuted }
                  );
                  store.logAdminAction(
                    currentUser.id,
                    currentUser.email,
                    'ALTERAÇÃO_CONFIGURAÇÃO_ÁUDIO',
                    'Sistema de Áudio',
                    'Configurações Anteriores',
                    `Modo: ${audioEngineMode}, Trilha: ${bgMusicUrlInput || 'Nenhuma'}`
                  );
                  showAdminToast('🎵 Áudio Atualizado!', 'As configurações de som foram salvas e aplicadas em tempo real.');
                }}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cyber font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition cursor-pointer flex items-center gap-2 shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Configuração de Áudio</span>
              </button>
            </div>

            {/* MODO DO MOTOR DE ÁUDIO */}
            <div className="space-y-3">
              <label className="text-xs font-cyber font-bold text-slate-200 uppercase tracking-wider block">
                1. MODO DE OPERAÇÃO DO MOTOR DE ÁUDIO
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setAudioEngineMode('hybrid')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    audioEngineMode === 'hybrid'
                      ? 'bg-amber-500/10 border-amber-400 text-white shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-cyber font-bold text-xs text-amber-400 uppercase mb-1 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span>Híbrido (Recomendado)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Usa áudio externo de alta fidelidade (MP3/WAV) quando configurado, com síntese Web Audio procedural como fallback automático.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAudioEngineMode('procedural')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    audioEngineMode === 'procedural'
                      ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-lg shadow-cyan-500/10'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-cyber font-bold text-xs text-cyan-400 uppercase mb-1 flex items-center gap-2">
                    <Sliders className="w-4 h-4" />
                    <span>Procedural Web Audio</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Gera todos os efeitos sonoros e turbulência sinteticamente via Web Audio API (sem consumir largura de banda).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAudioEngineMode('external_only')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    audioEngineMode === 'external_only'
                      ? 'bg-purple-500/10 border-purple-400 text-white shadow-lg shadow-purple-500/10'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-cyber font-bold text-xs text-purple-400 uppercase mb-1 flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    <span>Exclusivo Ficheiros Externos</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Reproduz estritamente os ficheiros MP3/WAV inseridos pelo administrador.
                  </p>
                </button>
              </div>
            </div>

            {/* MÚSICA DE FUNDO PRINCIPAL */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-cyber font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Music className="w-4 h-4 text-amber-400" />
                    2. MÚSICA DE FUNDO PRINCIPAL (BACKGROUND TRACK)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Insira o URL de um ficheiro áudio (MP3, WAV, OGG) ou faça o upload direto do seu dispositivo.
                  </p>
                </div>
                {bgMusicUrlInput && (
                  <button
                    type="button"
                    onClick={() => {
                      if (playingPreviewEvent === 'bg_music') {
                        audioManager.setBackgroundMusicUrl(null);
                        setPlayingPreviewEvent(null);
                      } else {
                        audioManager.setBackgroundMusicUrl(bgMusicUrlInput);
                        audioManager.startBackgroundMusic();
                        setPlayingPreviewEvent('bg_music');
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 hover:bg-amber-500/30 cursor-pointer shrink-0"
                  >
                    {playingPreviewEvent === 'bg_music' ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{playingPreviewEvent === 'bg_music' ? 'Pausar Teste' : 'Testar Trilha'}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={bgMusicUrlInput.startsWith('data:audio') ? `[Ficheiro Áudio Carregado — ${(bgMusicUrlInput.length / 1024).toFixed(0)} KB]` : bgMusicUrlInput}
                  onChange={(e) => setBgMusicUrlInput(e.target.value)}
                  placeholder="https://exemplo.com/audio/musica_fundo.mp3 ou /audio/background.mp3"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:border-amber-400 focus:outline-none"
                />
                
                {/* Hidden File Input */}
                <input
                  ref={bgMusicFileRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleBgMusicUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => bgMusicFileRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition shrink-0"
                  title="Fazer upload de um ficheiro de áudio (MP3, WAV, OGG)"
                >
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>Subir Áudio</span>
                </button>

                {bgMusicUrlInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setBgMusicUrlInput('');
                      audioManager.setBackgroundMusicUrl(null);
                    }}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs cursor-pointer shrink-0"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Presets Sugeridos */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">Presets Sugeridos:</span>
                <button
                  type="button"
                  onClick={() => setBgMusicUrlInput('https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 font-mono cursor-pointer"
                >
                  🎧 Cyberpunk Electro Loop
                </button>
                <button
                  type="button"
                  onClick={() => setBgMusicUrlInput('https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a2a514.mp3')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 font-mono cursor-pointer"
                >
                  🚀 Flight Tension Drone
                </button>
                <button
                  type="button"
                  onClick={() => setBgMusicUrlInput('')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-400 font-mono cursor-pointer"
                >
                  🔇 Sem Música Externa (Apenas Web Audio)
                </button>
              </div>
            </div>

            {/* EFEITOS SONOROS DE EVENTOS */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div>
                <h3 className="text-sm font-cyber font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-cyan-400" />
                  3. EFEITOS SONOROS DOS EVENTOS DO JOGO (CUSTOM SFX)
                </h3>
                <p className="text-xs text-slate-400">
                  Defina ficheiros de áudio dedicados fazendo upload direto do seu computador ou inserindo a URL. Se em branco, o sintetizador procedural Web Audio será utilizado.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'takeoff', label: '🚀 Decolagem do Pássaro', defaultHint: 'Som de aceleração de turbina e arrancada' },
                  { key: 'cashout', label: '💰 Cashout / Levantamento Com Sucesso', defaultHint: 'Fanfarra de vitória e moedas' },
                  { key: 'crash', label: '💥 Crash / Queda do Pássaro', defaultHint: 'Explosão ou trovão de encerramento do voo' },
                  { key: 'bird_cry', label: '🦅 Grito do Pássaro / Grito Cyber', defaultHint: 'Piu / Grito de descolagem do mascot' },
                  { key: 'countdown', label: '⏱️ Contagem Regressiva (3-2-1)', defaultHint: 'Beep bleep de aviso de próxima rodada' },
                  { key: 'deposit', label: '💳 Alerta de Depósito Aprovado', defaultHint: 'Chime futurista de saldo recebido' },
                  { key: 'withdrawal', label: '📤 Alerta de Saque Solicitado', defaultHint: 'Aviso de processamento financeiro' },
                  { key: 'message', label: '💬 Mensagem do Suporte', defaultHint: 'Ping eletrónico de chat' }
                ].map((sfx) => {
                  const hasCustom = Boolean(customSfxUrls[sfx.key] && customSfxUrls[sfx.key].trim());
                  const isDataUrl = customSfxUrls[sfx.key]?.startsWith('data:audio');

                  return (
                    <div key={sfx.key} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          {sfx.label}
                          {isDataUrl && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold">
                              📁 Ficheiro Subido
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const url = customSfxUrls[sfx.key];
                              if (url) {
                                audioManager.setCustomSfxUrl(sfx.key, url);
                                audioManager.playCustomSfx(sfx.key);
                              } else {
                                if (sfx.key === 'takeoff') audioManager.playTakeoff();
                                else if (sfx.key === 'cashout') audioManager.playCashOut();
                                else if (sfx.key === 'crash') audioManager.playCrash();
                                else if (sfx.key === 'bird_cry') audioManager.playBirdCry();
                                else if (sfx.key === 'countdown') audioManager.playCountdown(false);
                                else if (sfx.key === 'deposit') audioManager.playDepositAlert();
                                else if (sfx.key === 'withdrawal') audioManager.playWithdrawalAlert();
                                else if (sfx.key === 'message') audioManager.playMessageAlert();
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[11px] font-bold cursor-pointer flex items-center gap-1 border border-cyan-500/30"
                          >
                            <Play className="w-3 h-3" /> Testar
                          </button>
                        </div>
                      </div>

                      {/* Input row with text / upload button */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={isDataUrl ? `[Ficheiro Áudio — ${(customSfxUrls[sfx.key].length / 1024).toFixed(0)} KB]` : customSfxUrls[sfx.key] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomSfxUrls((prev) => ({ ...prev, [sfx.key]: val }));
                          }}
                          placeholder={sfx.defaultHint}
                          className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-white font-mono focus:border-cyan-400 focus:outline-none"
                        />

                        {/* Hidden file input per SFX item */}
                        <input
                          ref={(el) => (sfxFileRefs.current[sfx.key] = el)}
                          type="file"
                          accept="audio/*"
                          onChange={(e) => handleSfxFileUpload(sfx.key, sfx.label, e)}
                          className="hidden"
                        />

                        <button
                          type="button"
                          onClick={() => sfxFileRefs.current[sfx.key]?.click()}
                          className="px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
                          title="Fazer upload de ficheiro MP3/WAV para este efeito sonoro"
                        >
                          <Upload className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Subir</span>
                        </button>

                        {hasCustom && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomSfxUrls((prev) => {
                                const next = { ...prev };
                                delete next[sfx.key];
                                audioManager.setCustomSfxUrl(sfx.key, null);
                                return next;
                              });
                            }}
                            className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] cursor-pointer shrink-0"
                            title="Remover áudio customizado"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CONTROLO DE VOLUMES */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <h3 className="text-sm font-cyber font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                4. NÍVEIS DE VOLUME GLOBAIS
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Volume Master */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-300">Volume Geral (Master):</span>
                    <span className="text-amber-400 font-mono">{Math.round(masterVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={masterVolume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setMasterVolume(val);
                      audioManager.setVolumes({ masterVolume: val });
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* Volume Música */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-300">Volume da Música:</span>
                    <span className="text-cyan-400 font-mono">{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={musicVolume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setMusicVolume(val);
                      audioManager.setVolumes({ musicVolume: val });
                    }}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Volume SFX */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-300">Volume dos Efeitos (SFX):</span>
                    <span className="text-emerald-400 font-mono">{Math.round(sfxVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sfxVolume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSfxVolume(val);
                      audioManager.setVolumes({ sfxVolume: val });
                    }}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AUDIT LOG TAB */}
        {activeTab === 'audit' && (
          <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-4">
            <h2 className="text-xl font-cyber font-bold text-white">REGISTRO DE AUDITORIA IMUTÁVEL</h2>
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-cyan-400 font-bold font-cyber">{log.action}</span>
                    <span className="text-[10px]">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-slate-300">Alvo: {log.target}</p>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>De: <strong className="text-red-400">{log.beforeValue}</strong></span>
                    <span>→</span>
                    <span>Para: <strong className="text-emerald-400">{log.afterValue}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
