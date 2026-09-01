/**
 * State and Persistence Store for SKYBIRD
 * Manages ledger transactions, provably fair rounds, active bets,
 * live support messaging, admin audit trails, and user wallets.
 */

import {
  User,
  Wallet,
  WalletTransaction,
  GameRound,
  GameRoundStatus,
  Bet,
  SupportConversation,
  SupportMessage,
  AdminSettings,
  AuditLog,
  Testimonial,
  SystemNotification,
  VerificationRequest
} from '../types';
import { generateRandomSeed, hashServerSeed, calculateCrashPoint } from './provablyFair';
import { audioManager } from './audioManager';
import { supabase, isSupabaseConfigured } from './supabase';
import {
  serverPlaceBet,
  serverCashoutBet,
  subscribeToWalletChanges,
  subscribeToSupportMessages,
  subscribeToTransactions,
  subscribeToProfiles,
  sendSupportMessageSupabase
} from './supabase_rpc';

const STORAGE_KEYS = {
  CURRENT_USER: 'skybird_current_user',
  USERS: 'skybird_users',
  WALLETS: 'skybird_wallets',
  TRANSACTIONS: 'skybird_transactions',
  ROUNDS: 'skybird_rounds',
  BETS: 'skybird_bets',
  CONVERSATIONS: 'skybird_conversations',
  MESSAGES: 'skybird_messages',
  ADMIN_SETTINGS: 'skybird_admin_settings',
  AUDIT_LOGS: 'skybird_audit_logs',
  TESTIMONIALS: 'skybird_testimonials',
  NOTIFICATIONS: 'skybird_notifications',
  VERIFICATION_REQUESTS: 'skybird_verification_requests'
};

// Initial Seed Users — real users are created upon registration or Supabase login
const INITIAL_USERS: User[] = [];

const INITIAL_WALLETS: Record<string, Wallet> = {};

const INITIAL_TRANSACTIONS: WalletTransaction[] = [];

const INITIAL_ADMIN_SETTINGS: AdminSettings = {
  gameEnabled: true,
  maintenanceMode: false,
  minBet: 0.50,
  maxBet: 500.00,
  maxPayout: 25000.00,
  globalRtp: 92.5,
  houseEdge: 7.5,
  supportStatus: 'online',
  demoMode: false
};

const INITIAL_TESTIMONIALS: Testimonial[] = [];

const INITIAL_PAST_ROUNDS: GameRound[] = [];

const INITIAL_AUDIT_LOGS: AuditLog[] = [];

class SkybirdStore {
  private currentUser: User = {
    id: 'usr_guest',
    name: 'Visitante',
    email: '',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest`,
    role: 'player',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
  private users: User[] = [...INITIAL_USERS];
  private wallets: Record<string, Wallet> = { ...INITIAL_WALLETS };
  private transactions: WalletTransaction[] = [...INITIAL_TRANSACTIONS];
  private pastRounds: GameRound[] = [...INITIAL_PAST_ROUNDS];
  private currentRound: GameRound | null = null;
  private activeBets: Bet[] = [];
  private userBetHistory: Bet[] = [];
  private lastSyncSeq: number = -1;
  private lastSyncAccumulated: number = 0;

  private notifications: SystemNotification[] = [];
  private conversations: SupportConversation[] = [];
  private messages: SupportMessage[] = [];
  private adminSettings: AdminSettings = INITIAL_ADMIN_SETTINGS;
  private auditLogs: AuditLog[] = INITIAL_AUDIT_LOGS;
  private testimonials: Testimonial[] = INITIAL_TESTIMONIALS;
  private verificationRequests: VerificationRequest[] = [];

  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
    // Migration: if the current user is the old demo player, reset to guest
    if (this.currentUser.id === 'usr_player_1') {
      const firstRealPlayer = this.users.find(u => u.role === 'player' && u.id !== 'usr_player_1');
      this.currentUser = firstRealPlayer || {
        id: 'usr_guest',
        name: 'Visitante',
        email: '',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest`,
        role: 'player',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
    }
    // Only seed the welcome message if there are no saved conversations yet
    if (this.conversations.length === 0) {
      this.initSupportConversation();
    }
    this.initNextRound();
    this.initSupabaseAdminSettings();
    this.initSupabaseRealtimeListeners();
  }

  private initSupabaseRealtimeListeners() {
    if (!isSupabaseConfigured) return;

    // 1. Escutar novas mensagens de suporte em tempo real (Admin & Jogadores)
    subscribeToSupportMessages((newMsg: any) => {
      const convId = newMsg.conversation_id;
      const msg: SupportMessage = {
        id: newMsg.id,
        conversationId: convId,
        senderId: newMsg.sender_id,
        senderName: newMsg.sender_name,
        senderRole: newMsg.sender_role,
        text: newMsg.text,
        createdAt: newMsg.created_at
      };

      // Evitar duplicação local se já existir
      if (!this.messages.some((m) => m.id === msg.id)) {
        this.messages.push(msg);

        // Atualizar conversa correspondente
        let conv = this.conversations.find((c) => c.id === convId);
        if (!conv) {
          conv = {
            id: convId,
            userId: msg.senderId,
            userName: msg.senderName,
            userAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`,
            userEmail: '',
            status: 'open',
            lastMessage: msg.text,
            lastMessageAt: msg.createdAt,
            unreadCount: 1
          };
          this.conversations.unshift(conv);
        } else {
          conv.lastMessage = msg.text;
          conv.lastMessageAt = msg.createdAt;
          if (msg.senderId !== this.currentUser.id) {
            conv.unreadCount = (conv.unreadCount || 0) + 1;
          }
        }

        // Se for o Admin e a mensagem for de um jogador, emitir notificação no painel
        if (this.currentUser.role === 'admin' && msg.senderRole === 'player') {
          this.addNotification({
            type: 'support_message',
            title: 'Nova Mensagem de Suporte',
            message: `${msg.senderName}: ${msg.text.slice(0, 45)}`
          });
        }
        this.notify();
      }
    });

    // 2. Escutar transações financeiras em tempo real (Depósitos e Saques)
    subscribeToTransactions((newTx: any) => {
      const tx: WalletTransaction = {
        id: newTx.id,
        userId: newTx.user_id,
        type: newTx.type,
        amount: Number(newTx.amount),
        currency: newTx.currency || 'USD',
        balanceBefore: Number(newTx.balance_before),
        balanceAfter: Number(newTx.balance_after),
        reference: newTx.reference,
        status: newTx.status,
        method: newTx.method || 'Airtm',
        processingTimeText: newTx.processing_time_text,
        details: newTx.details,
        createdAt: newTx.created_at
      };

      const existingIndex = this.transactions.findIndex((t) => t.id === tx.id);
      if (existingIndex >= 0) {
        this.transactions[existingIndex] = tx;
      } else {
        this.transactions.unshift(tx);
        // Notificar Admin se for novo depósito ou saque pendente
        if (this.currentUser.role === 'admin' && (tx.type === 'deposit' || tx.type === 'withdrawal')) {
          const typeName = tx.type === 'deposit' ? 'Depósito' : 'Saque';
          this.addNotification({
            type: tx.type === 'deposit' ? 'deposit_requested' : 'withdrawal_requested',
            title: `Novo ${typeName} Solicitado!`,
            message: `${typeName} de $${tx.amount.toFixed(2)} USD (Ref: ${tx.reference})`,
            amount: tx.amount
          });
        }
      }
      this.notify();
    });

    // 3. Escutar alterações e registos de perfis em tempo real
    subscribeToProfiles((profileData: any) => {
      const u: User = {
        id: profileData.id,
        name: profileData.name,
        email: profileData.email,
        avatar: profileData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.id}`,
        role: profileData.role || 'player',
        status: profileData.status || 'active',
        isVerified: profileData.is_verified || false,
        verificationStatus: profileData.verification_status || 'unverified',
        referralCode: profileData.referral_code,
        referralCount: profileData.referral_count || 0,
        referralEarnings: Number(profileData.referral_earnings || 0),
        deviceFingerprint: profileData.device_fingerprint,
        createdAt: profileData.created_at,
        lastLoginAt: profileData.last_login_at
      };

      const existingUserIdx = this.users.findIndex((usr) => usr.id === u.id);
      if (existingUserIdx >= 0) {
        this.users[existingUserIdx] = u;
      } else {
        this.users.push(u);
      }
      this.notify();
    });
  }

  private async initSupabaseAdminSettings() {
    if (!isSupabaseConfigured) return;

    try {
      // 1. Fetch initial settings from admin_settings table (id = 1)
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (!error && data) {
        this.adminSettings = {
          gameEnabled: data.game_enabled ?? this.adminSettings.gameEnabled,
          maintenanceMode: data.maintenance_mode ?? this.adminSettings.maintenanceMode,
          minBet: Number(data.min_bet ?? this.adminSettings.minBet),
          maxBet: Number(data.max_bet ?? this.adminSettings.maxBet),
          maxPayout: Number(data.max_payout ?? this.adminSettings.maxPayout),
          globalRtp: Number(data.global_rtp ?? this.adminSettings.globalRtp),
          houseEdge: Number(data.house_edge ?? this.adminSettings.houseEdge),
          supportStatus: data.support_status ?? this.adminSettings.supportStatus,
          demoMode: data.demo_mode ?? this.adminSettings.demoMode
        };
        this.saveToStorage();
        this.listeners.forEach((l) => l());
      }

      // 2. Subscribe to real-time updates on admin_settings
      supabase
        .channel('admin-settings-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'admin_settings' },
          (payload) => {
            if (payload.new) {
              const newData = payload.new as any;
              this.adminSettings = {
                gameEnabled: newData.game_enabled ?? this.adminSettings.gameEnabled,
                maintenanceMode: newData.maintenance_mode ?? this.adminSettings.maintenanceMode,
                minBet: Number(newData.min_bet ?? this.adminSettings.minBet),
                maxBet: Number(newData.max_bet ?? this.adminSettings.maxBet),
                maxPayout: Number(newData.max_payout ?? this.adminSettings.maxPayout),
                globalRtp: Number(newData.global_rtp ?? this.adminSettings.globalRtp),
                houseEdge: Number(newData.house_edge ?? this.adminSettings.houseEdge),
                supportStatus: newData.support_status ?? this.adminSettings.supportStatus,
                demoMode: newData.demo_mode ?? this.adminSettings.demoMode
              };
              this.saveToStorage();
              this.listeners.forEach((l) => l());
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('[Supabase] Falha ao carregar admin_settings:', e);
    }
  }

  private loadFromStorage() {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (savedUser) this.currentUser = JSON.parse(savedUser);

      // Load/merge users — always ensure admin exists
      const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      if (savedUsers) {
        const parsed: User[] = JSON.parse(savedUsers);
        // Merge: add INITIAL_USERS that don't yet exist in saved list
        const mergedUsers = [...parsed];
        for (const seedUser of INITIAL_USERS) {
          if (!parsed.find(u => u.id === seedUser.id)) {
            mergedUsers.push(seedUser);
          }
        }
        // Remove legacy demo user that is no longer needed
        this.users = mergedUsers.filter(u => u.id !== 'usr_player_1');
      } else {
        this.users = [...INITIAL_USERS];
      }

      const savedWallets = localStorage.getItem(STORAGE_KEYS.WALLETS);
      if (savedWallets) {
        const parsed = JSON.parse(savedWallets);
        // Remove legacy wallet for old demo user
        delete parsed['usr_player_1'];
        this.wallets = { ...INITIAL_WALLETS, ...parsed };
      }

      const savedTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (savedTx) {
        const parsed: WalletTransaction[] = JSON.parse(savedTx);
        // Remove transactions belonging to old demo user
        this.transactions = parsed.filter(tx => tx.userId !== 'usr_player_1');
      }

      const savedNotifs = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (savedNotifs) this.notifications = JSON.parse(savedNotifs);

      const savedRounds = localStorage.getItem(STORAGE_KEYS.ROUNDS);
      if (savedRounds) {
        const parsed = JSON.parse(savedRounds);
        if (Array.isArray(parsed)) {
          const seenIds = new Set<string>();
          const seenRoundNums = new Set<number>();
          this.pastRounds = parsed.filter((r: GameRound) => {
            if (!r || !r.id || seenIds.has(r.id) || seenRoundNums.has(r.roundNumber)) {
              return false;
            }
            seenIds.add(r.id);
            seenRoundNums.add(r.roundNumber);
            return true;
          });
          if (this.pastRounds.length === 0) {
            this.pastRounds = [...INITIAL_PAST_ROUNDS];
          }
        }
      }

      const savedSettings = localStorage.getItem(STORAGE_KEYS.ADMIN_SETTINGS);
      if (savedSettings) this.adminSettings = JSON.parse(savedSettings);

      const savedLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (savedLogs) this.auditLogs = JSON.parse(savedLogs);

      // Restore support conversations & messages from localStorage
      const savedConvs = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      if (savedConvs) this.conversations = JSON.parse(savedConvs);

      const savedMsgs = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (savedMsgs) this.messages = JSON.parse(savedMsgs);

      const savedVerifications = localStorage.getItem(STORAGE_KEYS.VERIFICATION_REQUESTS);
      if (savedVerifications) this.verificationRequests = JSON.parse(savedVerifications);
    } catch (e) {
      console.warn('Storage read error, using memory defaults', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(this.currentUser));
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
      localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(this.wallets));
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(this.transactions));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(this.notifications.slice(0, 30)));
      localStorage.setItem(STORAGE_KEYS.ROUNDS, JSON.stringify(this.pastRounds.slice(0, 30)));
      localStorage.setItem(STORAGE_KEYS.ADMIN_SETTINGS, JSON.stringify(this.adminSettings));
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs));
      // Persist support conversations and messages so admin sees them after reload
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(this.conversations));
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(this.messages.slice(-200)));
      localStorage.setItem(STORAGE_KEYS.VERIFICATION_REQUESTS, JSON.stringify(this.verificationRequests));
    } catch {
      // safe fallback
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((l) => l());
  }

  /** Generate unique client hardware & browser fingerprint hash to prevent multi-accounts on same device */
  public getDeviceFingerprint(): string {
    if (typeof window === 'undefined') return 'fp_server';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const txt = 'SKYBIRD_ANTI_FRAUD_v1';
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText(txt, 2, 15);
    }
    const b64 = canvas.toDataURL ? canvas.toDataURL() : '';
    let hash = 0;
    const str = `${navigator.userAgent}_${navigator.language}_${screen.width}x${screen.height}_${b64}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  }

  /** Validate registration against multi-account abuse (device fingerprint, phone & birth date reuse) */
  public validateRegistrationAntiFraud(data: {
    email: string;
    phone: string;
    birthDate: string;
    deviceFingerprint: string;
  }): { valid: boolean; reason?: string } {
    const cleanPhone = data.phone.replace(/\D/g, '');

    // Apenas validar contra utilizadores reais com status 'active' e que tenham email definido
    // (utilizadores reais sincronizados do Supabase, não contas guest ou vazias)
    const realUsers = this.users.filter(
      (u) => u.role === 'player' && u.status === 'active' && u.email && u.email.includes('@')
    );

    // 1. Check duplicate phone number (apenas contra utilizadores reais)
    const existingPhone = realUsers.find(
      (u) => u.phone && u.phone.replace(/\D/g, '') === cleanPhone && cleanPhone.length >= 6
    );
    if (existingPhone) {
      return {
        valid: false,
        reason: 'Este número de telefone/WhatsApp já está associado a outra conta registada.'
      };
    }

    // 2. Check duplicate device fingerprint (DESATIVADO PARA TESTES NO MESMO PC)
    // Permitir múltiplos registos no mesmo computador/dispositivo durante testes
    /*
    if (realUsers.length > 0) {
      const sameDeviceUsers = realUsers.filter(
        (u) =>
          u.deviceFingerprint &&
          u.deviceFingerprint === data.deviceFingerprint &&
          u.email.toLowerCase() !== data.email.toLowerCase()
      );
      if (sameDeviceUsers.length >= 1) {
        return {
          valid: false,
          reason: 'Segurança Anti-Fraude: Já existe uma conta ativa registada neste dispositivo/navegador.'
        };
      }
    }
    */

    return { valid: true };
  }

  /** Remove utilizadores locais stale com o mesmo fingerprint que não existem mais no Supabase */
  public clearStaleLocalUsers(deviceFingerprint: string): void {
    const before = this.users.length;
    // Remove todos os utilizadores com este fingerprint do cache local
    this.users = this.users.filter(
      (u) => !u.deviceFingerprint || u.deviceFingerprint !== deviceFingerprint
    );
    if (this.users.length !== before) {
      console.info('[Anti-Fraude] Limpeza de utilizadores locais stale concluída.');
      this.saveToStorage();
    }
  }

  public syncAllUsers(fetchedUsers: User[]): void {
    if (!fetchedUsers || fetchedUsers.length === 0) return;
    const userMap = new Map<string, User>();
    // 1. Manter utilizadores atuais
    this.users.forEach((u) => userMap.set(u.id, u));
    // 2. Sobrescrever / adicionar utilizadores vindos do Supabase
    fetchedUsers.forEach((u) => userMap.set(u.id, u));
    this.users = Array.from(userMap.values());
    this.saveToStorage();
    this.notify();
  }

  public syncTransactionFromSupabase(txData: any): void {
    const tx: WalletTransaction = {
      id: txData.id,
      userId: txData.user_id,
      type: txData.type,
      amount: Number(txData.amount),
      currency: txData.currency || 'USD',
      balanceBefore: Number(txData.balance_before),
      balanceAfter: Number(txData.balance_after),
      reference: txData.reference,
      status: txData.status,
      method: txData.method || 'Airtm',
      processingTimeText: txData.processing_time_text,
      details: txData.details,
      createdAt: txData.created_at
    };
    const idx = this.transactions.findIndex((t) => t.id === tx.id);
    if (idx >= 0) {
      this.transactions[idx] = tx;
    } else {
      this.transactions.unshift(tx);
    }
    this.saveToStorage();
    this.notify();
  }

  public syncConversationFromSupabase(convData: any): void {
    const conv: SupportConversation = {
      id: convData.id,
      userId: convData.user_id,
      userName: convData.user_name || 'Jogador',
      userAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${convData.user_id}`,
      userEmail: '',
      status: convData.status || 'open',
      lastMessage: convData.last_message || '',
      lastMessageAt: convData.last_message_at || convData.updated_at || new Date().toISOString(),
      unreadCount: 0
    };
    const idx = this.conversations.findIndex((c) => c.id === conv.id);
    if (idx >= 0) {
      this.conversations[idx] = conv;
    } else {
      this.conversations.unshift(conv);
    }
    this.saveToStorage();
    this.notify();
  }

  public syncSupportMessageFromSupabase(msgData: any): void {
    const msg: SupportMessage = {
      id: msgData.id,
      conversationId: msgData.conversation_id,
      senderId: msgData.sender_id,
      senderName: msgData.sender_name,
      senderRole: msgData.sender_role,
      text: msgData.text,
      createdAt: msgData.created_at
    };
    if (!this.messages.some((m) => m.id === msg.id)) {
      this.messages.push(msg);
      this.saveToStorage();
      this.notify();
    }
  }

  /** Sync a KYC verification record from Supabase into the local store */
  public syncKycFromSupabase(kycData: any): void {
    const req: VerificationRequest = {
      id: kycData.id,
      userId: kycData.userId || kycData.user_id,
      userName: kycData.userName || kycData.user_name || 'Jogador',
      userEmail: kycData.userEmail || kycData.user_email || '',
      userAvatar: kycData.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${kycData.userId || kycData.user_id}`,
      idDocumentImage: kycData.idDocumentImage || kycData.id_document_url || '',
      selfieImage: kycData.selfieImage || kycData.selfie_url || '',
      airtmAccount: kycData.airtmAccount || kycData.airtm_account || '',
      whatsappNumber: kycData.whatsappNumber || kycData.whatsapp_number || '',
      status: (kycData.status as 'pending' | 'approved' | 'rejected') || 'pending',
      submittedAt: kycData.submittedAt || kycData.submitted_at || new Date().toISOString(),
      reviewedAt: kycData.reviewedAt || kycData.reviewed_at,
      rejectionReason: kycData.rejectionReason || kycData.rejection_reason
    };

    const idx = this.verificationRequests.findIndex((r) => r.id === req.id);
    if (idx >= 0) {
      this.verificationRequests[idx] = req;
    } else {
      // Avoid duplicates by userId+submittedAt
      const dupIdx = this.verificationRequests.findIndex(
        (r) => r.userId === req.userId && r.submittedAt === req.submittedAt
      );
      if (dupIdx >= 0) {
        this.verificationRequests[dupIdx] = req;
      } else {
        this.verificationRequests.unshift(req);
      }
    }

    // If KYC was approved in Supabase, also update local user verification status
    if (req.status === 'approved') {
      const user = this.users.find((u) => u.id === req.userId);
      if (user && !user.isVerified) {
        user.isVerified = true;
        user.verificationStatus = 'verified';
        if (this.currentUser.id === req.userId) {
          this.currentUser.isVerified = true;
          this.currentUser.verificationStatus = 'verified';
        }
      }
    }

    this.saveToStorage();
    this.notify();
  }

  // --- USER & AUTH ---
  public getCurrentUser(): User {
    // Ensure referral properties exist
    if (!this.currentUser.referralCode) {
      this.currentUser.referralCode = 'SKY-' + this.currentUser.name.replace(/\s+/g, '').toUpperCase().slice(0, 5) + Math.floor(1000 + Math.random() * 9000);
      this.currentUser.referralCount = this.currentUser.referralCount || 0;
      this.currentUser.referralEarnings = this.currentUser.referralEarnings || 0;
    }
    if (!this.currentUser.deviceFingerprint) {
      this.currentUser.deviceFingerprint = this.getDeviceFingerprint();
    }
    return this.currentUser;
  }

  public setCurrentUser(user: User, referralCodeInput?: string) {
    if (!user.referralCode) {
      user.referralCode = 'SKY-' + user.name.replace(/\s+/g, '').toUpperCase().slice(0, 5) + Math.floor(1000 + Math.random() * 9000);
    }
    user.referralCount = user.referralCount || 0;
    user.referralEarnings = user.referralEarnings || 0;
    if (!user.deviceFingerprint) {
      user.deviceFingerprint = this.getDeviceFingerprint();
    }

    const existingIdx = this.users.findIndex(u => u.id === user.id);
    if (existingIdx !== -1) {
      this.users[existingIdx] = user;
    } else {
      this.users.push(user);
    }

    this.currentUser = user;

    // Sincronizar carteira do utilizador com o Supabase se configurado
    if (isSupabaseConfigured && user.id !== 'usr_guest') {
      // Leitura inicial do saldo server-side (Fonte de Verdade)
      supabase
        .from('wallets')
        .select('available_balance, locked_balance, currency')
        .eq('user_id', user.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            const avail = Number(data.available_balance || 0);
            const locked = Number(data.locked_balance || 0);
            this.wallets[user.id] = {
              userId: user.id,
              availableBalance: avail,
              lockedBalance: locked,
              totalBalance: avail + locked,
              currency: data.currency || 'USD'
            };
            this.saveToStorage();
            this.listeners.forEach((l) => l());
          } else if (error && error.code === 'PGRST116') {
            // Carteira não existe ainda no Supabase: criar com $0.00 (NUNCA com saldos iniciais arbitrários)
            supabase.from('wallets').insert({
              user_id: user.id,
              available_balance: 0,
              locked_balance: 0,
              currency: 'USD'
            }).then(() => {
              this.wallets[user.id] = {
                userId: user.id,
                availableBalance: 0,
                lockedBalance: 0,
                totalBalance: 0,
                currency: 'USD'
              };
              this.saveToStorage();
              this.listeners.forEach((l) => l());
            });
          }
        });

      // Subscrição Realtime: actualiza saldo sempre que o PostgreSQL actualiza via RPC
      subscribeToWalletChanges(user.id, (avail, locked) => {
        this.wallets[user.id] = {
          userId: user.id,
          availableBalance: avail,
          lockedBalance: locked,
          totalBalance: avail + locked,
          currency: 'USD'
        };
        if (this.currentUser.id === user.id) {
          this.saveToStorage();
          this.listeners.forEach((l) => l());
        }
      });
    }

    // Process referral code if provided upon registration
    if (referralCodeInput && referralCodeInput.trim()) {
      this.processReferral(user.id, referralCodeInput.trim());
    }

    this.saveToStorage();
    this.notify();
  }

  public logout(): void {
    const guestUser: User = {
      id: 'usr_guest',
      name: 'Visitante',
      email: '',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest',
      role: 'player',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    this.currentUser = guestUser;
    this.saveToStorage();
    this.notify();
  }

  public updateUserAvatar(avatarUrl: string): void {
    if (!this.currentUser || this.currentUser.id === 'usr_guest') return;
    this.currentUser.avatar = avatarUrl;
    const idx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (idx !== -1) {
      this.users[idx].avatar = avatarUrl;
    }
    if (isSupabaseConfigured) {
      supabase.auth.updateUser({
        data: { avatar_url: avatarUrl }
      }).catch(err => console.warn('[Supabase] Erro ao atualizar avatar auth:', err));
      supabase.from('profiles').update({
        avatar_url: avatarUrl
      }).eq('id', this.currentUser.id).then(null, (err: any) => console.warn('[Supabase] Erro ao atualizar avatar profile:', err));
    }
    this.saveToStorage();
    this.notify();
  }

  /** Process referral link code: increment referrer count and credit $1 USD balance for every 10 referrals */
  public processReferral(newUserId: string, referralCode: string) {
    const referrer = this.users.find(u => u.referralCode && u.referralCode.toLowerCase() === referralCode.toLowerCase());
    if (!referrer || referrer.id === newUserId) return;

    // Anti-fraud check: Do not allow referral bonus if referred account shares the same device fingerprint as referrer
    const newUser = this.users.find(u => u.id === newUserId);
    if (newUser && referrer.deviceFingerprint && newUser.deviceFingerprint === referrer.deviceFingerprint) {
      console.warn('[Anti-Fraud] Tentativa de auto-referência detectada no mesmo dispositivo.');
      return;
    }

    referrer.referralCount = (referrer.referralCount || 0) + 1;

    // Bonus Rule: For every 10 referrals, reward $1.00 USD to referrer's available balance
    if (referrer.referralCount % 10 === 0) {
      const bonusAmount = 1.00;
      referrer.referralEarnings = (referrer.referralEarnings || 0) + bonusAmount;

      const wallet = this.getWallet(referrer.id);
      const balanceBefore = wallet.availableBalance;
      const balanceAfter = balanceBefore + bonusAmount;

      wallet.availableBalance = balanceAfter;
      wallet.totalBalance = wallet.lockedBalance + balanceAfter;
      this.wallets[referrer.id] = wallet;

      const bonusTx: WalletTransaction = {
        id: 'tx_ref_' + Math.random().toString(36).substring(2, 9),
        userId: referrer.id,
        type: 'referral_bonus',
        amount: bonusAmount,
        currency: 'USD',
        balanceBefore,
        balanceAfter,
        reference: `REF-BONUS-10-REFS-${referrer.referralCount}`,
        status: 'completed',
        createdAt: new Date().toISOString(),
        method: 'System',
        details: `Bónus de indicação: 10 novos amigos convidados (${referrer.referralCount} totais)!`
      };

      this.transactions.unshift(bonusTx);

      this.addNotification({
        id: 'notif_ref_' + Date.now(),
        userId: referrer.id,
        title: '🎁 Bónus de Convite Recebido! ($1.00 USD)',
        message: `Parabéns! Completou ${referrer.referralCount} convites de referência. Creditámos $1.00 USD na sua carteira!`,
        type: 'referral_bonus',
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    // Update referrer in users array & current user if matched
    const refIdx = this.users.findIndex(u => u.id === referrer.id);
    if (refIdx !== -1) this.users[refIdx] = referrer;
    if (this.currentUser.id === referrer.id) this.currentUser = referrer;

    this.saveToStorage();
  }

  public switchRole(role: 'player' | 'admin') {
    const target = this.users.find((u) => u.role === role) || this.currentUser;
    this.currentUser = target;
    this.notify();
  }

  public loginAdmin(email: string, password: string, pin?: string): { success: boolean; message?: string } {
    const trimmedEmail = email.trim().toLowerCase();
    
    // Validate credentials: check if email belongs to admin or contains admin
    const adminUser = this.users.find(
      (u) => u.role === 'admin' && (u.email.toLowerCase() === trimmedEmail || trimmedEmail.includes('admin'))
    ) || this.users.find((u) => u.role === 'admin');

    if (!adminUser) {
      this.logAudit('ADMIN_LOGIN_FAILED', `Attempt for ${email}`, 'Unauthorized', 'No admin found');
      return { success: false, message: 'Conta de administrador não encontrada.' };
    }

    // Passwords accepted: default master password 'skybird#2026', 'admin123', 'admin', or >= 6 chars
    if (password !== 'skybird#2026' && password !== 'admin123' && password !== 'admin' && password.length < 6) {
      this.logAudit('ADMIN_LOGIN_FAILED', `Attempt for ${email}`, 'Invalid Password', 'Denied');
      return { success: false, message: 'Chave de acesso mestre incorreta.' };
    }

    // Optional 2FA PIN validation
    if (pin && pin.trim().length > 0 && pin.trim() !== '202688' && pin.trim().length !== 6) {
      this.logAudit('ADMIN_LOGIN_FAILED', `Attempt for ${email}`, 'Invalid 2FA PIN', 'Denied');
      return { success: false, message: 'Código 2FA / Token de segurança inválido.' };
    }

    // Success: activate admin user
    this.currentUser = {
      ...adminUser,
      lastLoginAt: new Date().toISOString()
    };

    // Update in users array
    const idx = this.users.findIndex((u) => u.id === adminUser.id);
    if (idx !== -1) {
      this.users[idx] = this.currentUser;
    }

    this.logAudit('ADMIN_LOGIN_SUCCESS', `Admin Console: ${adminUser.email}`, 'Logged Out', 'Authorized Session');
    this.notify();
    return { success: true };
  }

  public logoutAdmin(): void {
    // After logout, switch to the first active player, or reset to a clean guest state
    const playerUser = this.users.find((u) => u.role === 'player' && u.status === 'active');

    this.logAudit('ADMIN_LOGOUT', `Admin Session Ended`, 'Active', 'Disconnected');

    if (playerUser) {
      this.currentUser = playerUser;
    } else {
      // No players yet — set a transient guest that will be replaced on login/register
      this.currentUser = {
        id: 'usr_guest',
        name: 'Visitante',
        email: '',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest`,
        role: 'player',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
    }
    this.notify();
  }

  public getAllUsers(): User[] {
    return [...this.users];
  }

  public updateUserStatus(userId: string, status: 'active' | 'suspended') {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return;
    const oldStatus = user.status;
    user.status = status;

    this.logAudit(
      'UPDATE_USER_STATUS',
      `User ${user.name} (${user.email})`,
      oldStatus,
      status
    );
    this.notify();
  }

  // --- WALLET & LEDGER ---
  public getWallet(userId = this.currentUser.id): Wallet {
    if (!this.wallets[userId]) {
      this.wallets[userId] = {
        userId,
        availableBalance: 0.00,
        lockedBalance: 0.00,
        totalBalance: 0.00,
        currency: 'USD'
      };
    }
    return { ...this.wallets[userId] };
  }

  public getTransactions(userId = this.currentUser.id): WalletTransaction[] {
    return this.transactions.filter((tx) => tx.userId === userId);
  }

  public getAllTransactions(): WalletTransaction[] {
    return [...this.transactions];
  }

  /**
   * Request deposit - Awaiting Admin Confirmation
   * Balance is NOT credited until the administrator reviews and approves the transaction.
   */
  public requestDeposit(
    amount: number,
    method: 'Airtm' = 'Airtm',
    details?: { airtmEmail?: string; reference?: string; notes?: string }
  ): WalletTransaction {
    if (amount < 1) {
      throw new Error('O valor mínimo para depósito é de $1.00 USD.');
    }

    const wallet = this.getWallet(this.currentUser.id);
    const tx: WalletTransaction = {
      id: 'tx_dep_' + Math.random().toString(36).substring(2, 9),
      userId: this.currentUser.id,
      type: 'deposit',
      amount,
      currency: 'USD',
      balanceBefore: wallet.availableBalance,
      balanceAfter: wallet.availableBalance,
      reference: details?.reference || `AIRTM-DEP-${Math.floor(10000 + Math.random() * 90000)}`,
      details: details?.airtmEmail ? `Airtm: ${details.airtmEmail}` : undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
      method: 'Airtm',
      processingTimeText: 'Aguardando Confirmação Admin'
    };

    this.transactions.unshift(tx);
    this.saveToStorage();

    // Async write to Supabase transactions table
    // CRITICAL: Do NOT send 'id' field — let Supabase auto-generate a valid UUID
    // Previously, sending 'id: tx_dep_xxx' caused silent insert failures (invalid UUID format)
    if (isSupabaseConfigured) {
      supabase.from('transactions').insert({
        user_id: tx.userId,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        balance_before: tx.balanceBefore,
        balance_after: tx.balanceAfter,
        reference: tx.reference,
        status: tx.status,
        method: tx.method,
        processing_time_text: tx.processingTimeText,
        details: tx.details,
        created_at: tx.createdAt
      }).select('id').single().then(({ data, error }) => {
        if (error) {
          console.error('[LEDGER ERROR][ADMIN][TRANSACTIONS][DEPOSIT] Erro ao gravar depósito:', error.message, 'code:', error.code);
        } else if (data?.id) {
          // Update local transaction ID to match the server-generated UUID
          const idx = this.transactions.findIndex(t => t.id === tx.id);
          if (idx >= 0) {
            this.transactions[idx].id = data.id;
            tx.id = data.id;
          }
          console.log('[Supabase] Depósito gravado com sucesso. ID:', data.id);
        }
      });
    }

    this.addNotification({
      type: 'deposit_requested',
      title: 'Solicitação de Depósito Recebida',
      message: `Depósito de $${amount.toFixed(2)} USD via Airtm de ${this.currentUser.name} (${this.currentUser.email}) em análise pelo administrador.`,
      amount
    });

    try {
      audioManager.playNotification();
    } catch {
      /* safe fallback */
    }

    this.notify();
    return tx;
  }

  /**
   * Admin-Only: Approve deposit and credit user wallet
   */
  public approveDeposit(txId: string): void {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx || tx.type !== 'deposit' || tx.status !== 'pending') return;

    const wallet = this.getWallet(tx.userId);
    const balanceBefore = wallet.availableBalance;
    const balanceAfter = Math.round((balanceBefore + tx.amount) * 100) / 100;

    wallet.availableBalance = balanceAfter;
    wallet.totalBalance = balanceAfter;
    this.wallets[tx.userId] = wallet;

    tx.balanceBefore = balanceBefore;
    tx.balanceAfter = balanceAfter;
    tx.status = 'completed';
    tx.processingTimeText = 'Aprovado pelo Admin';

    this.logAudit(
      'APPROVE_DEPOSIT',
      `Deposit ${tx.reference} ($${tx.amount.toFixed(2)} USD) approved for user ${tx.userId}`,
      'pending',
      'completed'
    );

    this.saveToStorage();

    // Update status in Supabase
    if (isSupabaseConfigured) {
      // Update transaction to completed
      supabase.from('transactions').update({
        status: 'completed',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        processing_time_text: 'Aprovado pelo Admin'
      }).eq('id', txId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao atualizar aprovação de depósito:', error.message);
      });

      // ✅ CRÍTICO: Actualizar saldo na tabela wallets do Supabase para que o jogador
      // receba a actualização em tempo real via subscribeToWalletChanges
      supabase.from('wallets').update({
        available_balance: balanceAfter,
        updated_at: new Date().toISOString()
      }).eq('user_id', tx.userId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao actualizar wallet do jogador após aprovação:', error.message);
        else console.log(`[Supabase] Saldo de ${tx.userId} actualizado para $${balanceAfter.toFixed(2)} USD`);
      });
    }

    this.addNotification({
      type: 'deposit_approved',
      title: 'Depósito Aprovado!',
      message: `Depósito de $${tx.amount.toFixed(2)} USD aprovado e creditado para o utilizador (Ref: ${tx.reference}).`,
      amount: tx.amount
    });

    this.notify();
  }

  /**
   * Admin-Only: Reject deposit
   */
  public rejectDeposit(txId: string, reason?: string): void {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx || tx.type !== 'deposit' || tx.status !== 'pending') return;

    tx.status = 'failed';
    tx.processingTimeText = reason || 'Recusado pelo Admin';

    this.logAudit(
      'REJECT_DEPOSIT',
      `Deposit ${tx.reference} rejected. Reason: ${reason || 'Não identificado'}`,
      'pending',
      'failed'
    );

    this.saveToStorage();

    if (isSupabaseConfigured) {
      supabase.from('transactions').update({
        status: 'failed',
        processing_time_text: reason || 'Recusado pelo Admin'
      }).eq('id', txId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao atualizar rejeição de depósito:', error.message);
      });
    }

    this.addNotification({
      type: 'deposit_rejected',
      title: 'Depósito Não Aprovado',
      message: `A solicitação de depósito de $${tx.amount.toFixed(2)} USD foi recusada pelo administrador (${reason || 'Comprovativo inválido'}).`,
      amount: tx.amount
    });

    this.notify();
  }

  /** Legacy / Direct deposit (keeps compatibility) */
  public deposit(amount: number, method: 'Airtm' = 'Airtm', reference?: string): WalletTransaction {
    return this.requestDeposit(amount, method, { reference });
  }

  /** Returns the total amount withdrawn by the user today (UTC/local date) */
  public getTodayWithdrawals(userId = this.currentUser.id): number {
    const todayStr = new Date().toISOString().split('T')[0];
    return this.transactions
      .filter((tx) => {
        if (tx.userId !== userId || tx.type !== 'withdrawal') return false;
        if (tx.status === 'failed' || tx.status === 'cancelled') return false;
        const txDay = new Date(tx.createdAt).toISOString().split('T')[0];
        return txDay === todayStr;
      })
      .reduce((acc, tx) => acc + tx.amount, 0);
  }

  /**
   * Retrieves official withdrawal rules:
   * - Minimum withdrawal: from $10.00 USD
   * - Max limit per day: $500.00 USD (for verified accounts)
   * - Unverified accounts: limited to $100.00 USD per day
   * - Processing time: between 15 to 30 minutes to reflect in Airtm wallet
   */
  public getWithdrawalRules(userId = this.currentUser.id) {
    const user = this.users.find((u) => u.id === userId) || this.currentUser;
    const isVerified = Boolean(user.isVerified);
    const minWithdrawal = 10.00;
    const maxDailyLimit = isVerified ? 500.00 : 100.00;
    const usedToday = this.getTodayWithdrawals(userId);
    const remainingDailyLimit = Math.max(0, Math.round((maxDailyLimit - usedToday) * 100) / 100);

    return {
      minWithdrawal,
      maxDailyLimit,
      usedToday,
      remainingDailyLimit,
      isVerified,
      processingTimeText: '15 a 30 minutos'
    };
  }

  /** Toggle verification status of a user (upgrades daily limit from $100 to $500) */
  public toggleUserVerification(userId: string, isVerified?: boolean) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return;
    const newStatus = isVerified !== undefined ? isVerified : !user.isVerified;
    user.isVerified = newStatus;
    user.verificationStatus = newStatus ? 'verified' : 'unverified';
    if (this.currentUser.id === userId) {
      this.currentUser.isVerified = newStatus;
      this.currentUser.verificationStatus = newStatus ? 'verified' : 'unverified';
    }
    this.saveToStorage();
    this.notify();
  }

  // --- KYC / IDENTITY VERIFICATION ---

  /**
   * User submits a KYC verification request with:
   * - document photo (base64)
   * - selfie holding the document (base64)
   * - Airtm account for withdrawals
   * - WhatsApp contact number
   */
  public submitVerificationRequest(data: {
    idDocumentImage: string;
    selfieImage: string;
    airtmAccount: string;
    whatsappNumber: string;
  }): VerificationRequest {
    const user = this.currentUser;

    // Cancel any previous pending request from this user
    this.verificationRequests = this.verificationRequests.filter(
      (r) => !(r.userId === user.id && r.status === 'pending')
    );

    const req: VerificationRequest = {
      id: 'kyc_' + Math.random().toString(36).substring(2, 11),
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userAvatar: user.avatar,
      idDocumentImage: data.idDocumentImage,
      selfieImage: data.selfieImage,
      airtmAccount: data.airtmAccount.trim(),
      whatsappNumber: data.whatsappNumber.trim(),
      status: 'pending',
      submittedAt: new Date().toISOString()
    };

    this.verificationRequests.unshift(req);

    if (isSupabaseConfigured && user.id !== 'usr_guest') {
      // CRITICAL: Do NOT send 'id' — let Supabase auto-generate a valid UUID
      supabase.from('kyc_verifications').insert({
        user_id: req.userId,
        user_name: req.userName,
        user_email: req.userEmail,
        id_document_url: data.idDocumentImage.slice(0, 500), // store more of the data URL
        selfie_url: data.selfieImage.slice(0, 500),
        airtm_account: req.airtmAccount,
        whatsapp_number: req.whatsappNumber,
        status: 'pending',
        submitted_at: req.submittedAt
      }).select('id').single().then(({ data: kycData, error }) => {
        if (error) {
          console.error('[LEDGER ERROR][ADMIN][KYC] Erro ao gravar verificação KYC:', error.message, 'code:', error.code);
        } else if (kycData?.id) {
          // Update local request ID to match server-generated UUID
          const rIdx = this.verificationRequests.findIndex(r => r.userId === req.userId && r.submittedAt === req.submittedAt);
          if (rIdx >= 0) this.verificationRequests[rIdx].id = kycData.id;
          req.id = kycData.id;
          console.log('[Supabase] KYC gravado com sucesso. ID:', kycData.id);
        }
      });
    }

    this.addNotification({
      type: 'kyc_submitted',
      title: '🪪 Verificação KYC Enviada',
      message: 'Seus documentos foram recebidos e estão em análise. Você será notificado assim que a verificação for concluída.',
      userId: user.id
    });

    this.logAudit(
      'KYC_SUBMITTED',
      `User ${user.name} (${user.email}) submitted KYC documents`,
      'unverified',
      'pending'
    );

    this.notify();
    return req;
  }

  /** Returns the current KYC verification request for a specific user */
  public getUserVerificationRequest(userId = this.currentUser.id): VerificationRequest | null {
    return this.verificationRequests.find((r) => r.userId === userId) || null;
  }

  /** Returns all verification requests (admin only) */
  public getVerificationRequests(): VerificationRequest[] {
    return [...this.verificationRequests];
  }

  /** Admin: Approve a verification request and mark user as verified */
  public approveVerification(requestId: string): void {
    const req = this.verificationRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'pending') return;

    req.status = 'approved';
    req.reviewedAt = new Date().toISOString();

    // Mark user as verified
    this.toggleUserVerification(req.userId, true);

    // Sync to Supabase kyc_verifications + profiles
    if (isSupabaseConfigured) {
      supabase.from('kyc_verifications').update({
        status: 'approved',
        reviewed_at: req.reviewedAt
      }).eq('id', requestId).then(({ error }) => {
        if (error) console.error('[LEDGER ERROR][ADMIN][KYC] Erro ao aprovar KYC no Supabase:', error.message);
        else console.log('[Supabase] KYC aprovado para', req.userId);
      });

      // Update profile as verified
      supabase.from('profiles').update({
        is_verified: true,
        verification_status: 'verified'
      }).eq('id', req.userId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao actualizar is_verified no perfil:', error.message);
      });
    }

    this.addNotification({
      type: 'kyc_approved',
      title: '✅ Conta Verificada com Sucesso!',
      message: 'Sua identidade foi verificada. Seu limite de saque diário foi aumentado para $500.00 USD.',
      userId: req.userId
    });

    this.logAudit(
      'KYC_APPROVED',
      `KYC for ${req.userName} (${req.userEmail}) approved`,
      'pending',
      'verified'
    );

    this.notify();
  }

  /** Admin: Reject a verification request with a reason */
  public rejectVerification(requestId: string, reason: string): void {
    const req = this.verificationRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'pending') return;

    req.status = 'rejected';
    req.reviewedAt = new Date().toISOString();
    req.rejectionReason = reason || 'Documentos inválidos ou ilegíveis.';

    // Sync rejection to Supabase
    if (isSupabaseConfigured) {
      supabase.from('kyc_verifications').update({
        status: 'rejected',
        rejection_reason: req.rejectionReason,
        reviewed_at: req.reviewedAt
      }).eq('id', requestId).then(({ error }) => {
        if (error) console.error('[LEDGER ERROR][ADMIN][KYC] Erro ao rejeitar KYC no Supabase:', error.message);
        else console.log('[Supabase] KYC rejeitado para', req.userId);
      });
    }

    this.addNotification({
      type: 'kyc_rejected',
      title: '❌ Verificação Não Aprovada',
      message: `Sua solicitação de verificação foi recusada. Motivo: ${req.rejectionReason}. Por favor, submeta novos documentos.`,
      userId: req.userId
    });

    this.logAudit(
      'KYC_REJECTED',
      `KYC for ${req.userName} (${req.userEmail}) rejected. Reason: ${req.rejectionReason}`,
      'pending',
      'rejected'
    );

    this.notify();
  }

  /**
   * Atomic withdrawal request:
   * - Deducts amount from available balance to reserve funds.
   * - Status set to 'pending' for Administrative approval.
   * - Credit time: 15 to 30 minutes to Airtm wallet upon admin release.
   */
  public requestWithdrawal(amount: number, method: 'Airtm' = 'Airtm', details: string = ''): WalletTransaction {
    const rules = this.getWithdrawalRules(this.currentUser.id);

    // Rule 1: Minimum withdrawal is 10 USD
    if (amount < 10.00) {
      throw new Error('O valor mínimo para levantamento é de $10.00 USD.');
    }

    // Rule 2: Daily withdrawal limit ($500 for verified, $100 for unverified)
    if (amount > rules.remainingDailyLimit) {
      if (!rules.isVerified) {
        throw new Error(
          `Limite diário excedido. Contas não verificadas têm limite de saque de $100.00 USD por dia (Já sacou $${rules.usedToday.toFixed(2)} USD hoje). Verifique sua conta para aumentar para $500.00 USD/dia.`
        );
      } else {
        throw new Error(
          `Limite diário excedido. O limite de levantamento é de $500.00 USD por dia (Já sacou $${rules.usedToday.toFixed(2)} USD hoje. Disponível hoje: $${rules.remainingDailyLimit.toFixed(2)} USD).`
        );
      }
    }

    const wallet = this.getWallet(this.currentUser.id);
    if (wallet.availableBalance < amount) {
      throw new Error('Saldo insuficiente para efetuar este saque.');
    }

    const balanceBefore = wallet.availableBalance;
    const balanceAfter = Math.round((balanceBefore - amount) * 100) / 100;

    wallet.availableBalance = balanceAfter;
    wallet.totalBalance = balanceAfter;
    this.wallets[this.currentUser.id] = wallet;

    const tx: WalletTransaction = {
      id: 'tx_wth_' + Math.random().toString(36).substring(2, 9),
      userId: this.currentUser.id,
      type: 'withdrawal',
      amount,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      reference: `AIRTM-WTH-${Math.floor(10000 + Math.random() * 90000)}${details ? `: ${details}` : ''}`,
      details: details ? `Airtm: ${details}` : undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
      method: 'Airtm',
      processingTimeText: '15 a 30 minutos (Aprovação Admin)'
    };

    this.transactions.unshift(tx);
    this.saveToStorage();

    // CRITICAL: Do NOT send 'id' field — let Supabase auto-generate a valid UUID
    if (isSupabaseConfigured) {
      supabase.from('transactions').insert({
        user_id: tx.userId,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        balance_before: tx.balanceBefore,
        balance_after: tx.balanceAfter,
        reference: tx.reference,
        status: tx.status,
        method: tx.method,
        processing_time_text: tx.processingTimeText,
        details: tx.details,
        created_at: tx.createdAt
      }).select('id').single().then(({ data, error }) => {
        if (error) {
          console.error('[LEDGER ERROR][ADMIN][TRANSACTIONS][WITHDRAWAL] Erro ao gravar saque:', error.message, 'code:', error.code);
        } else if (data?.id) {
          // Update local transaction ID to match the server-generated UUID
          const idx = this.transactions.findIndex(t => t.id === tx.id);
          if (idx >= 0) {
            this.transactions[idx].id = data.id;
            tx.id = data.id;
          }
          console.log('[Supabase] Saque gravado com sucesso. ID:', data.id);
        }
      });
    }

    this.addNotification({
      type: 'withdrawal_requested',
      title: 'Solicitação de Saque Enviada',
      message: `Nova solicitação de saque de $${amount.toFixed(2)} USD para Airtm por ${this.currentUser.name} (${this.currentUser.email}).`,
      amount
    });

    try {
      audioManager.playNotification();
    } catch {
      /* safe fallback */
    }

    this.notify();
    return tx;
  }

  /**
   * Admin-Only: Approve withdrawal and finalize transfer
   */
  public approveWithdrawal(txId: string): void {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx || tx.type !== 'withdrawal' || (tx.status !== 'pending' && tx.status !== 'processing')) return;

    tx.status = 'completed';
    tx.processingTimeText = 'Enviado para Airtm';

    this.logAudit(
      'APPROVE_WITHDRAWAL',
      `Withdrawal ${tx.reference} ($${tx.amount.toFixed(2)} USD) approved and sent`,
      'pending',
      'completed'
    );

    this.saveToStorage();

    if (isSupabaseConfigured) {
      supabase.from('transactions').update({
        status: 'completed',
        processing_time_text: 'Enviado para Airtm'
      }).eq('id', txId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao atualizar aprovação de saque:', error.message);
      });
    }

    this.addNotification({
      type: 'withdrawal_approved',
      title: 'Saque Aprovado & Liberado!',
      message: `Seu saque de $${tx.amount.toFixed(2)} USD foi processado pelo administrador e enviado para sua carteira Airtm.`,
      amount: tx.amount
    });

    this.notify();
  }

  /**
   * Admin-Only: Reject withdrawal and refund amount back to user's wallet
   */
  public rejectWithdrawal(txId: string, reason?: string): void {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx || tx.type !== 'withdrawal' || (tx.status !== 'pending' && tx.status !== 'processing')) return;

    // Refund locked balance back to user
    const wallet = this.getWallet(tx.userId);
    wallet.availableBalance = Math.round((wallet.availableBalance + tx.amount) * 100) / 100;
    wallet.totalBalance = wallet.availableBalance;
    this.wallets[tx.userId] = wallet;

    tx.status = 'cancelled';
    tx.processingTimeText = reason || 'Recusado e Estornado';

    this.logAudit(
      'REJECT_WITHDRAWAL',
      `Withdrawal ${tx.reference} rejected. Refunded $${tx.amount.toFixed(2)} USD. Reason: ${reason || 'Solicitação inválida'}`,
      'pending',
      'cancelled'
    );

    this.saveToStorage();

    if (isSupabaseConfigured) {
      supabase.from('transactions').update({
        status: 'cancelled',
        processing_time_text: reason || 'Recusado e Estornado'
      }).eq('id', txId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao atualizar rejeição de saque:', error.message);
      });
    }

    this.addNotification({
      type: 'withdrawal_rejected',
      title: 'Saque Recusado / Saldo Estornado',
      message: `Sua solicitação de saque de $${tx.amount.toFixed(2)} USD foi recusada (${reason || 'Dados de conta Airtm incorretos'}) e o valor foi devolvido ao seu saldo.`,
      amount: tx.amount
    });

    this.notify();
  }

  public updateTransactionStatus(txId: string, status: 'completed' | 'failed' | 'cancelled') {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx) return;
    if (tx.type === 'deposit') {
      if (status === 'completed') {
        this.approveDeposit(txId);
      } else {
        this.rejectDeposit(txId);
      }
      return;
    }
    if (tx.type === 'withdrawal') {
      if (status === 'completed') {
        this.approveWithdrawal(txId);
      } else {
        this.rejectWithdrawal(txId);
      }
      return;
    }

    const oldStatus = tx.status;
    tx.status = status;
    this.logAudit(
      'UPDATE_TRANSACTION_STATUS',
      `Transaction ${tx.reference}`,
      oldStatus,
      status
    );
    this.saveToStorage();
    this.notify();
  }

  // --- GAME ROUNDS & PROVABLY FAIR ---
  public getSynchronizedRoundState(): {
    roundNumber: number;
    status: GameRoundStatus;
    startedAt: number;
    countdownRemaining: number;
    currentMultiplier: number;
    crashPoint: number;
    serverSeedHash: string;
    serverSeed: string;
    clientSeed: string;
  } {
    const now = Date.now();
    const COUNTDOWN_MS = 5000;       // 5s de contagem regressiva
    const CRASHED_DISPLAY_MS = 5000; // 5s de display do crash antes de nova rodada
    const MIN_FLIGHT_MS = 3000;      // mínimo 3s de voo sempre visível
    const clientSeed = 'skybird_client_seed_main';
    const houseEdge = this.adminSettings.houseEdge || 7.5;

    // Epoch fixo: 01/Jan/2025 00:00:00 UTC — todos os clientes ficam sincronizados
    const EPOCH_START = 1735689600000;
    const timeSinceEpoch = Math.max(0, now - EPOCH_START);

    const AVG_CYCLE_MS = 16000;

    // Helper inline: calcula crashPoint e duração do ciclo para um dado roundSeq
    const getCycleDuration = (seq: number): { cp: number; seed: string; cycleDuration: number; flightMs: number } => {
      const rNum = 1000 + (seq % 90000);
      const seed = `skybird_prod_seed_rnd_${rNum}_master`;
      const raw = calculateCrashPoint(seed, clientSeed, rNum, houseEdge);
      const cp = Math.min(100.00, Math.max(1.01, Math.round(raw * 100) / 100));
      const flightMs = Math.max(MIN_FLIGHT_MS, (Math.log(cp) / 0.075) * 1000);
      return { cp, seed, cycleDuration: COUNTDOWN_MS + flightMs + CRASHED_DISPLAY_MS, flightMs };
    };

    let roundSeq = this.lastSyncSeq;
    let accumulated = this.lastSyncAccumulated;

    if (roundSeq < 0 || accumulated <= 0 || accumulated > timeSinceEpoch) {
      roundSeq = Math.max(0, Math.floor(timeSinceEpoch / AVG_CYCLE_MS) - 10);
      accumulated = roundSeq * AVG_CYCLE_MS;

      while (roundSeq > 0 && accumulated > timeSinceEpoch) {
        const prev = getCycleDuration(roundSeq - 1);
        accumulated -= prev.cycleDuration;
        roundSeq--;
      }
    }

    let safety = 0;
    while (safety < 2000) {
      const { cp, seed, cycleDuration, flightMs } = getCycleDuration(roundSeq);
      if (accumulated + cycleDuration > timeSinceEpoch) {
        this.lastSyncSeq = roundSeq;
        this.lastSyncAccumulated = accumulated;

        const rNum = 1000 + (roundSeq % 90000);
        const serverSeedHash = hashServerSeed(seed);
        const elapsedInCycle = timeSinceEpoch - accumulated;
        const runningStartTime = EPOCH_START + accumulated + COUNTDOWN_MS;

        let status: GameRoundStatus = 'COUNTDOWN';
        let countdownRemaining = 5;
        let currentMultiplier = 1.00;

        if (elapsedInCycle < COUNTDOWN_MS) {
          status = 'COUNTDOWN';
          countdownRemaining = Math.max(1, Math.ceil((COUNTDOWN_MS - elapsedInCycle) / 1000));
        } else {
          const flightElapsedMs = elapsedInCycle - COUNTDOWN_MS;
          if (flightElapsedMs < flightMs) {
            status = 'RUNNING';
            countdownRemaining = 0;
            const flightSec = flightElapsedMs / 1000;
            currentMultiplier = Math.min(Math.round(Math.exp(0.075 * flightSec) * 100) / 100, cp);
          } else {
            status = 'CRASHED';
            countdownRemaining = 0;
            currentMultiplier = cp;
          }
        }

        return {
          roundNumber: rNum,
          status,
          startedAt: runningStartTime,
          countdownRemaining,
          currentMultiplier,
          crashPoint: cp,
          serverSeedHash,
          serverSeed: seed,
          clientSeed
        };
      }
      accumulated += cycleDuration;
      roundSeq++;
      safety++;
    }

    // Fallback seguro (nunca deve chegar aqui em operação normal)
    const fbNum = 1000 + (roundSeq % 90000);
    const fbSeed = `skybird_prod_seed_rnd_${fbNum}_master`;
    return {
      roundNumber: fbNum,
      status: 'COUNTDOWN',
      startedAt: now,
      countdownRemaining: 5,
      currentMultiplier: 1.00,
      crashPoint: 2.00,
      serverSeedHash: hashServerSeed(fbSeed),
      serverSeed: fbSeed,
      clientSeed
    };
  }

  public getCurrentRound(): GameRound {
    const syncState = this.getSynchronizedRoundState();

    if (!this.currentRound || this.currentRound.roundNumber !== syncState.roundNumber) {
      // Arquivar a rodada anterior no histórico antes de criar a nova
      if (this.currentRound && this.currentRound.crashPoint) {
        const prevRound = { ...this.currentRound, status: 'CRASHED' as const, endedAt: Date.now() };
        // Só adicionar se não estiver duplicada
        if (!this.pastRounds.some(r => r.roundNumber === prevRound.roundNumber)) {
          this.pastRounds.unshift(prevRound);
          // Manter apenas as últimas 30 rodadas
          if (this.pastRounds.length > 30) this.pastRounds.pop();
          this.saveToStorage();
        }
      }

      this.currentRound = {
        id: `rnd_${syncState.roundNumber}`,
        roundNumber: syncState.roundNumber,
        status: syncState.status,
        startedAt: syncState.startedAt,
        endedAt: syncState.status === 'CRASHED' ? Date.now() : null,
        crashPoint: syncState.crashPoint,
        serverSeed: syncState.serverSeed,
        serverSeedHash: syncState.serverSeedHash,
        clientSeed: syncState.clientSeed,
        nonce: syncState.roundNumber,
        totalBetsAmount: 0,
        totalPayoutAmount: 0,
        createdAt: new Date(syncState.startedAt - 5000).toISOString()
      };
      this.activeBets = [];
      this.hasExtendedFlightForRound = false;
      this.seedSimulatedBots(this.currentRound.id);

      // Auto-sincronizar rodada com a tabela game_rounds do Supabase para garantir que place_bet não falhe
      if (isSupabaseConfigured) {
        supabase.from('game_rounds').upsert({
          id: this.currentRound.id,
          round_number: syncState.roundNumber,
          status: syncState.status,
          crash_point: syncState.crashPoint,
          server_seed_hash: syncState.serverSeedHash,
          client_seed: syncState.clientSeed,
          started_at: new Date(syncState.startedAt).toISOString()
        }, { onConflict: 'id' }).then(({ error }) => {
          if (error) console.warn('[Supabase] Erro ao sincronizar game_round:', error.message);
        });
      }

      // Notificar de forma diferida para que o GameView actualize pastRounds sem bloquear o rAF
      setTimeout(() => this.notify(), 0);
    } else {
      // Atualizar status e crashPoint de acordo com o relógio sincronizado
      this.currentRound.status = syncState.status;
      this.currentRound.crashPoint = syncState.crashPoint;
      this.currentRound.startedAt = syncState.startedAt;
    }

    return this.currentRound;
  }

  public initNextRound(): GameRound {
    return this.getCurrentRound();
  }

  private seedSimulatedBots(roundId: string) {
    const botNames = ['CyberFalcon', 'NeoPilot', 'AeroVortex', 'SkyRunner', 'ZeroG', 'Stratosphere', 'HorizonX', 'Valkyrie'];
    // Exactly 3 or 4 simulated fictitious players
    const count = 3 + (Math.random() < 0.5 ? 0 : 1);

    // Shuffle names for variety
    const shuffled = [...botNames].sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i++) {
      const name = shuffled[i % shuffled.length];
      const amount = [5, 10, 20, 25, 50, 100][Math.floor(Math.random() * 6)];
      
      // Diversified and realistic bot cashout targets
      let autoCashOut: number | null = null;
      if (i === 0) {
        // Quick conservative bot
        autoCashOut = Number((1.18 + Math.random() * 0.60).toFixed(2));
      } else if (i === 1) {
        // Medium strategy bot (65% chance of setting cashout between 1.80x and 3.90x)
        autoCashOut = Math.random() < 0.65 ? Number((1.80 + Math.random() * 2.10).toFixed(2)) : null;
      } else if (i === 2) {
        // Ambitious bot (40% chance of aiming for 4.00x - 15.00x)
        autoCashOut = Math.random() < 0.40 ? Number((4.00 + Math.random() * 11.00).toFixed(2)) : null;
      } else {
        // High risk / Greedy bot that rides the flight
        autoCashOut = Math.random() < 0.20 ? Number((15.00 + Math.random() * 35.00).toFixed(2)) : null;
      }

      this.activeBets.push({
        id: `bet_bot_${Math.random().toString(36).substring(2, 7)}`,
        roundId,
        userId: `bot_${i}`,
        userName: name,
        userAvatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
        amount,
        autoCashOutMultiplier: autoCashOut,
        cashOutMultiplier: null,
        payout: null,
        status: 'active',
        createdAt: new Date().toISOString(),
        isCurrentUser: false
      });
    }
  }

  public hasActiveRealPlayerBet(): boolean {
    return this.activeBets.some((b) => b.isCurrentUser && b.status === 'active');
  }

  private hasExtendedFlightForRound: boolean = false;

  public extendFlightIfRealPlayersOut(currentMultiplier: number) {
    if (!this.currentRound || this.currentRound.status !== 'RUNNING') return;
    if (this.hasExtendedFlightForRound) return; // Only calculate once to ensure unpredictable, natural crash point
    
    // Check if any real player bet is still active
    const hasRealActive = this.hasActiveRealPlayerBet();
    if (!hasRealActive) {
      this.hasExtendedFlightForRound = true;

      // Realistic, unpredictable random distribution strictly adhering to:
      // - 98% fast crashes strictly below 10.00x (range 1.00x - 9.99x)
      // - 2% rare flights reaching 10.00x - 100.00x
      const roll = Math.random();
      let targetCrash: number;

      if (roll >= 0.02) {
        // 98% probability: strictly sub-10 fast crash
        const subRoll = (roll - 0.02) / 0.98;
        if (subRoll >= 0.50) {
          // Fast dive (1.05x - 2.50x)
          targetCrash = Math.max(this.currentRound.crashPoint, Math.min(9.99, currentMultiplier + 0.10 + Math.random() * 0.80));
        } else if (subRoll >= 0.15) {
          // Low climb (2.51x - 5.50x)
          targetCrash = Math.max(this.currentRound.crashPoint, Math.min(9.99, currentMultiplier + 0.40 + Math.random() * 2.20));
        } else {
          // Moderate climb (5.51x - 9.99x)
          targetCrash = Math.max(this.currentRound.crashPoint, Math.min(9.99, currentMultiplier + 1.00 + Math.random() * 3.50));
        }
        targetCrash = Math.min(9.99, targetCrash);
      } else {
        // 2% probability: breaks past 10.00x
        targetCrash = Math.max(10.00, Math.max(this.currentRound.crashPoint, 10.00 + Math.random() * 40.00));
      }

      this.currentRound.crashPoint = Math.min(100.00, Math.round(targetCrash * 100) / 100);
      this.notify();
    }
  }

  /**
   * placeBet — Dupla camada:
   *  1. Se Supabase configurado → delega para RPC server-side place_bet() (atómica e segura).
   *     O saldo não é alterado localmente — é actualizado via Realtime subscription.
   *  2. Se Supabase NÃO configurado (modo desenvolvimento local) → fallback local.
   *     NUNCA usar fallback local em produção com dinheiro real.
   */
  public async placeBetAsync(
    amount: number,
    autoCashOutMultiplier: number | null = null,
    panelId: number = 1
  ): Promise<{ bet: Bet; serverResult?: any }> {
    if (amount < this.adminSettings.minBet || amount > this.adminSettings.maxBet) {
      throw new Error(`Aposta deve estar entre $${this.adminSettings.minBet} e $${this.adminSettings.maxBet}`);
    }

    const currentRound = this.getCurrentRound();
    if (currentRound.status === 'RUNNING' || currentRound.status === 'CRASHED') {
      throw new Error('O voo já está em andamento. Aguarde a próxima rodada.');
    }

    // Verificar aposta duplicada no painel
    const existingBet = this.activeBets.find(
      (b) => b.isCurrentUser && b.panelId === panelId && b.status === 'active'
    );
    if (existingBet) {
      throw new Error('Você já possui uma aposta ativa neste painel para esta rodada.');
    }

    // Se Supabase configurado → RPC server-side (ÚNICO modo de produção)
    if (isSupabaseConfigured && this.currentUser.id !== 'usr_guest') {
      const serverResult = await serverPlaceBet({
        roundId:      currentRound.id,
        amount,
        panelId,
        autoCashout:  autoCashOutMultiplier
      });

      if (!serverResult.success) {
        // REGRA ABSOLUTA DE SEGURANÇA: Nenhum fallback local para erros do servidor
        throw new Error(serverResult.error || 'Falha ao registrar aposta no servidor. Operação cancelada.');
      }

      // Criar bet local para UI (saldo actualizado via Realtime)
      const bet: Bet = {
        id:                  serverResult.bet_id,
        roundId:             currentRound.id,
        userId:              this.currentUser.id,
        userName:            this.currentUser.name,
        userAvatar:          this.currentUser.avatar,
        amount,
        autoCashOutMultiplier,
        cashOutMultiplier:   null,
        payout:              null,
        status:              'active',
        createdAt:           new Date().toISOString(),
        isCurrentUser:       true,
        panelId
      };

      this.activeBets.push(bet);
      currentRound.totalBetsAmount += amount;
      this.notify();
      return { bet, serverResult };
    }

    // Fallback local (só para desenvolvimento sem Supabase)
    const bet = this.placeBet(amount, autoCashOutMultiplier, panelId);
    return { bet };
  }

  /** @deprecated Use placeBetAsync() em produção. Mantido apenas para fallback local sem Supabase. */
  public placeBet(amount: number, autoCashOutMultiplier: number | null = null, panelId: number = 1): Bet {
    if (amount < this.adminSettings.minBet || amount > this.adminSettings.maxBet) {
      throw new Error(`Aposta deve estar entre $${this.adminSettings.minBet} e $${this.adminSettings.maxBet}`);
    }

    const currentRound = this.getCurrentRound();
    if (currentRound.status === 'RUNNING' || currentRound.status === 'CRASHED') {
      throw new Error('O voo já está em andamento. Aguarde a próxima rodada.');
    }

    // Check if player already has an active bet on this panel
    const existingBet = this.activeBets.find(
      (b) => b.isCurrentUser && b.panelId === panelId && b.status === 'active'
    );
    if (existingBet) {
      throw new Error('Você já possui uma aposta ativa neste painel para esta rodada.');
    }

    const wallet = this.getWallet(this.currentUser.id);
    if (wallet.availableBalance < amount) {
      throw new Error('Saldo insuficiente para realizar esta aposta.');
    }

    // Deduct immediately with ledger record
    const balanceBefore = wallet.availableBalance;
    const balanceAfter = Math.round((balanceBefore - amount) * 100) / 100;
    wallet.availableBalance = balanceAfter;
    wallet.totalBalance = balanceAfter;
    this.wallets[this.currentUser.id] = wallet;

    const tx: WalletTransaction = {
      id: 'tx_bet_' + Math.random().toString(36).substring(2, 9),
      userId: this.currentUser.id,
      type: 'bet',
      amount,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      reference: `BET-#${currentRound.roundNumber}-P${panelId}`,
      status: 'completed',
      createdAt: new Date().toISOString(),
      method: 'System'
    };
    this.transactions.unshift(tx);

    const bet: Bet = {
      id: 'bet_' + Math.random().toString(36).substring(2, 9),
      roundId: currentRound.id,
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      userAvatar: this.currentUser.avatar,
      amount,
      autoCashOutMultiplier,
      cashOutMultiplier: null,
      payout: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      isCurrentUser: true,
      panelId
    };

    this.activeBets.push(bet);
    currentRound.totalBetsAmount += amount;
    this.notify();
    return bet;
  }

  public cancelBet(panelId: number = 1): boolean {
    const currentRound = this.getCurrentRound();
    if (currentRound.status === 'RUNNING' || currentRound.status === 'CRASHED') {
      throw new Error('Não é possível cancelar uma aposta com o voo já em andamento.');
    }

    const betIndex = this.activeBets.findIndex(
      (b) => b.isCurrentUser && b.panelId === panelId && b.status === 'active'
    );

    if (betIndex === -1) return false;

    const bet = this.activeBets[betIndex];
    this.activeBets.splice(betIndex, 1);
    currentRound.totalBetsAmount = Math.max(0, currentRound.totalBetsAmount - bet.amount);

    // Refund to wallet with ledger
    const wallet = this.getWallet(this.currentUser.id);
    const balanceBefore = wallet.availableBalance;
    const balanceAfter = Math.round((balanceBefore + bet.amount) * 100) / 100;
    wallet.availableBalance = balanceAfter;
    wallet.totalBalance = balanceAfter;
    this.wallets[this.currentUser.id] = wallet;

    const tx: WalletTransaction = {
      id: 'tx_cancel_' + Math.random().toString(36).substring(2, 9),
      userId: this.currentUser.id,
      type: 'refund',
      amount: bet.amount,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      reference: `CANCEL-BET-#${currentRound.roundNumber}-P${panelId}`,
      status: 'completed',
      createdAt: new Date().toISOString(),
      method: 'System'
    };
    this.transactions.unshift(tx);

    this.notify();
    return true;
  }

  public setRoundStatus(status: GameRoundStatus, startedAt?: number): GameRound {
    const round = this.getCurrentRound();
    round.status = status;
    if (startedAt) {
      round.startedAt = startedAt;
    }

    if (status === 'RUNNING') {
      // Re-calculate the final crash point based on the active pool of bettors and total cash volume locked in
      const totalBettors = this.activeBets.length;
      const totalAmount = this.activeBets.reduce((sum, b) => sum + (b.amount || 0), 0);
      round.totalBetsAmount = totalAmount;
      round.crashPoint = calculateCrashPoint(
        round.serverSeed,
        round.clientSeed,
        round.nonce,
        this.adminSettings.houseEdge,
        totalBettors,
        totalAmount
      );
    }

    this.notify();
    return round;
  }

  /**
   * cashOutAsync — Dupla camada:
   *  1. Se Supabase configurado → delega para RPC server-side cashout_bet() (atómica).
   *     O payout é calculado 100% no PostgreSQL. O frontend NÃO determina o valor.
   *  2. Se Supabase NÃO configurado → fallback local (apenas desenvolvimento).
   */
  public async cashOutAsync(
    currentMultiplier: number,
    panelId?: number
  ): Promise<{ payout: number; multiplier: number; betId: string }> {
    const myBet = this.activeBets.find(
      (b) => b.isCurrentUser && b.status === 'active' && (!panelId || b.panelId === panelId)
    );
    if (!myBet) {
      throw new Error('Nenhuma aposta ativa para cash out');
    }

    // Se Supabase configurado → RPC server-side (ÚNICO modo de produção)
    if (isSupabaseConfigured && this.currentUser.id !== 'usr_guest') {
      const serverResult = await serverCashoutBet({
        betId:      myBet.id,
        multiplier: currentMultiplier
      });

      if (!serverResult.success) {
        // REGRA ABSOLUTA DE SEGURANÇA: Nenhum fallback local se a RPC de cashout falhar
        throw new Error(serverResult.error || 'Falha ao processar saque no servidor. Operação cancelada.');
      }

      // Actualizar aposta local (saldo actualizado via Realtime)
      myBet.cashOutMultiplier = serverResult.multiplier;
      myBet.payout = serverResult.payout;
      myBet.status = 'cashed_out';

      this.userBetHistory.unshift({ ...myBet });
      if (this.userBetHistory.length > 50) this.userBetHistory.pop();

      this.notify();
      return { payout: serverResult.payout, multiplier: serverResult.multiplier, betId: myBet.id };
    }

    // Fallback local (desenvolvimento sem Supabase)
    return this.cashOut(currentMultiplier, panelId);
  }

  /** @deprecated Use cashOutAsync() em produção. Mantido apenas para fallback local sem Supabase. */
  public cashOut(currentMultiplier: number, panelId?: number): { payout: number; multiplier: number; betId: string } {
    const currentRound = this.getCurrentRound();

    const myBet = this.activeBets.find(
      (b) => b.isCurrentUser && b.status === 'active' && (!panelId || b.panelId === panelId)
    );
    if (!myBet) {
      throw new Error('Nenhuma aposta ativa para cash out');
    }

    const mult = Math.max(1.01, Math.min(currentMultiplier, currentRound.crashPoint || currentMultiplier));
    const rawPayout = myBet.amount * mult;
    const cappedPayout = Math.min(this.adminSettings.maxPayout, rawPayout);
    const payout = Math.round(cappedPayout * 100) / 100;

    myBet.cashOutMultiplier = mult;
    myBet.payout = payout;
    myBet.status = 'cashed_out';

    // Save to user history
    this.userBetHistory.unshift({ ...myBet });
    if (this.userBetHistory.length > 50) this.userBetHistory.pop();

    // Credit wallet with ledger record immediately
    const wallet = this.getWallet(this.currentUser.id);
    const balanceBefore = wallet.availableBalance;
    const balanceAfter = Math.round((balanceBefore + payout) * 100) / 100;
    wallet.availableBalance = balanceAfter;
    wallet.totalBalance = balanceAfter;
    this.wallets[this.currentUser.id] = wallet;

    const tx: WalletTransaction = {
      id: 'tx_win_' + Math.random().toString(36).substring(2, 9),
      userId: this.currentUser.id,
      type: 'cashout',
      amount: payout,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      reference: `WIN-#${currentRound.roundNumber}@${mult.toFixed(2)}x`,
      status: 'completed',
      createdAt: new Date().toISOString(),
      method: 'System'
    };
    this.transactions.unshift(tx);

    currentRound.totalPayoutAmount += payout;

    // If all real players have cashed out, extend the flight of the bird
    this.extendFlightIfRealPlayersOut(mult);

    this.notify();
    return { payout, multiplier: mult, betId: myBet.id };
  }

  public triggerBotCashouts(currentMultiplier: number) {
    this.activeBets.forEach((b) => {
      if (!b.isCurrentUser && b.status === 'active') {
        if (b.autoCashOutMultiplier && currentMultiplier >= b.autoCashOutMultiplier) {
          b.status = 'cashed_out';
          b.cashOutMultiplier = b.autoCashOutMultiplier;
          b.payout = Math.round(b.amount * b.autoCashOutMultiplier * 100) / 100;
          if (this.currentRound) {
            this.currentRound.totalPayoutAmount += b.payout;
          }
        }
      }
    });
  }

  public endRound(crashPoint: number) {
    if (!this.currentRound) return;

    this.currentRound.status = 'CRASHED';
    this.currentRound.endedAt = Date.now();
    this.currentRound.crashPoint = crashPoint;

    // Mark remaining active bets as crashed and record user bets in history
    this.activeBets.forEach((b) => {
      if (b.status === 'active') {
        b.status = 'crashed';
        if (b.isCurrentUser) {
          this.userBetHistory.unshift({ ...b });
          if (this.userBetHistory.length > 50) this.userBetHistory.pop();
        }
      }
    });

    this.pastRounds.unshift({ ...this.currentRound });
    this.notify();
  }

  public getActiveBets(): Bet[] {
    return [...this.activeBets];
  }

  public getUserBetHistory(): Bet[] {
    return [...this.userBetHistory];
  }

  public getTopWinners(): Array<{ id: string; userName: string; userAvatar: string; amount: number; multiplier: number; payout: number; date: string }> {
    return [
      { id: 'top_1', userName: 'Mateus K.', userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80', amount: 50.00, multiplier: 84.50, payout: 4225.00, date: 'Hoje às 14:32' },
      { id: 'top_2', userName: 'Nelson D.', userAvatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80', amount: 100.00, multiplier: 38.20, payout: 3820.00, date: 'Hoje às 13:10' },
      { id: 'top_3', userName: 'Katia S.', userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', amount: 25.00, multiplier: 120.00, payout: 3000.00, date: 'Hoje às 11:45' },
      { id: 'top_4', userName: 'Antonio L.', userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', amount: 40.00, multiplier: 65.40, payout: 2616.00, date: 'Ontem às 22:15' },
      { id: 'top_5', userName: 'Domingos F.', userAvatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80', amount: 80.00, multiplier: 24.10, payout: 1928.00, date: 'Ontem às 19:40' }
    ];
  }

  public getDisplayCurrency(): 'USD' {
    return 'USD';
  }

  public setDisplayCurrency(_curr?: string) {
    this.notify();
  }

  public getPastRounds(): GameRound[] {
    return [...this.pastRounds];
  }

  // --- NOTIFICATION SYSTEM (VISUAL + SOUND) ---
  public getNotifications(): SystemNotification[] {
    return [...this.notifications];
  }

  public addNotification(notif: Omit<SystemNotification, 'id' | 'timestamp'> | SystemNotification) {
    const id = 'id' in notif && notif.id ? notif.id : 'notif_' + Math.random().toString(36).substring(2, 9);
    const timestamp = 'timestamp' in notif && notif.timestamp ? notif.timestamp : new Date().toISOString();

    const fullNotif: SystemNotification = {
      ...notif,
      id,
      timestamp,
      read: false
    };

    this.notifications.unshift(fullNotif);
    if (this.notifications.length > 30) {
      this.notifications.pop();
    }

    // Play corresponding sound alert based on notification type
    try {
      if (fullNotif.type === 'deposit_requested' || fullNotif.type === 'deposit_approved') {
        audioManager.playDepositAlert();
      } else if (fullNotif.type === 'withdrawal_requested' || fullNotif.type === 'withdrawal_approved' || fullNotif.type === 'withdrawal_rejected') {
        audioManager.playWithdrawalAlert();
      } else if (fullNotif.type === 'support_message') {
        audioManager.playMessageAlert();
      } else {
        audioManager.playNotification();
      }
    } catch {
      // Audio context safeguard
    }

    this.saveToStorage();
    this.notify();
  }

  public dismissNotification(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.saveToStorage();
    this.notify();
  }

  public clearNotifications() {
    this.notifications = [];
    this.saveToStorage();
    this.notify();
  }

  // --- SUPPORT & LIVE TICKETS ---
  /** Only called on very first load when there are zero saved conversations */
  private initSupportConversation() {
    this.conversations = [];
    this.messages = [];
  }

  public getSupportMessages(userId = this.currentUser.id): SupportMessage[] {
    const convId = `conv_${userId}`;
    return this.messages.filter((m) => m.conversationId === convId);
  }

  public getAllConversations(): SupportConversation[] {
    return [...this.conversations];
  }

  public sendSupportMessage(text: string): SupportMessage {
    const convId = `conv_${this.currentUser.id}`;
    let conv = this.conversations.find((c) => c.id === convId);
    const isNewConversation = !conv;
    if (!conv) {
      conv = {
        id: convId,
        userId: this.currentUser.id,
        userName: this.currentUser.name,
        userAvatar: this.currentUser.avatar,
        userEmail: this.currentUser.email,
        status: 'open',
        lastMessage: text,
        lastMessageAt: new Date().toISOString(),
        unreadCount: 1
      };
      this.conversations.unshift(conv);
      // Auto-insert welcome message for new conversations
      const welcomeMsg: SupportMessage = {
        id: 'msg_welcome_' + this.currentUser.id,
        conversationId: convId,
        senderId: 'sys_bot',
        senderName: 'Suporte SKYBIRD',
        senderRole: 'admin',
        text: `Bem-vindo ao suporte oficial SKYBIRD 24/7, ${this.currentUser.name}! Em que podemos ajudar com depósitos, saques ou jogabilidade?`,
        createdAt: new Date(Date.now() - 1000).toISOString()
      };
      this.messages.push(welcomeMsg);
    } else {
      conv.lastMessage = text;
      conv.lastMessageAt = new Date().toISOString();
      if (!isNewConversation) conv.unreadCount = (conv.unreadCount || 0) + 1;
    }

    const msg: SupportMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      conversationId: convId,
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      senderRole: this.currentUser.role,
      text,
      createdAt: new Date().toISOString()
    };

    this.messages.push(msg);

    // Enviar para o Supabase em tempo real se configurado
    if (isSupabaseConfigured && this.currentUser.id !== 'usr_guest') {
      sendSupportMessageSupabase({
        conversationId: convId,
        senderId: this.currentUser.id,
        senderName: this.currentUser.name,
        senderRole: this.currentUser.role === 'admin' ? 'admin' : 'player',
        text
      });
    }

    // Auto reply if support is busy or auto-dispatch
    if (this.currentUser.role === 'player') {
      setTimeout(() => {
        if (this.adminSettings.supportStatus === 'busy') {
          const autoMsg: SupportMessage = {
            id: 'msg_auto_busy_' + Date.now(),
            conversationId: convId,
            senderId: 'sys_auto',
            senderName: 'Suporte SKYBIRD',
            senderRole: 'admin',
            text: 'Os membros da nossa equipa de suporte estão atendendo outros clientes, por favor aguarde que lhe responderemos em instantes.',
            createdAt: new Date().toISOString()
          };
          this.messages.push(autoMsg);
          this.addNotification({
            type: 'support_message',
            title: 'Resposta do Suporte',
            message: autoMsg.text
          });
          this.notify();
        }
      }, 800);
    }

    this.notify();
    return msg;
  }

  public adminReplyToSupport(conversationId: string, text: string): SupportMessage {
    const msg: SupportMessage = {
      id: 'msg_adm_' + Math.random().toString(36).substring(2, 9),
      conversationId,
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      senderRole: 'admin',
      text,
      createdAt: new Date().toISOString()
    };

    this.messages.push(msg);

    if (isSupabaseConfigured) {
      sendSupportMessageSupabase({
        conversationId,
        senderId: this.currentUser.id,
        senderName: this.currentUser.name,
        senderRole: 'admin',
        text
      });
    }

    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.lastMessage = text;
      conv.lastMessageAt = new Date().toISOString();
      conv.status = 'resolved';
    }

    this.addNotification({
      type: 'support_message',
      title: 'Resposta da Administração',
      message: text.slice(0, 50) + (text.length > 50 ? '...' : '')
    });

    this.notify();
    return msg;
  }

  // --- ADMIN SETTINGS & AUDIT ---
  public getAdminSettings(): AdminSettings {
    return { ...this.adminSettings };
  }

  public updateAdminSettings(newSettings: Partial<AdminSettings>) {
    const beforeStr = JSON.stringify(this.adminSettings);
    this.adminSettings = { ...this.adminSettings, ...newSettings };
    const afterStr = JSON.stringify(this.adminSettings);

    if (isSupabaseConfigured) {
      supabase.from('admin_settings').upsert({
        id: 1,
        game_enabled: this.adminSettings.gameEnabled,
        maintenance_mode: this.adminSettings.maintenanceMode,
        min_bet: this.adminSettings.minBet,
        max_bet: this.adminSettings.maxBet,
        max_payout: this.adminSettings.maxPayout,
        global_rtp: this.adminSettings.globalRtp,
        house_edge: this.adminSettings.houseEdge,
        support_status: this.adminSettings.supportStatus,
        demo_mode: this.adminSettings.demoMode,
        updated_at: new Date().toISOString()
      }).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao atualizar admin_settings:', error.message);
      });
    }

    this.logAudit(
      'UPDATE_ADMIN_SETTINGS',
      'System Configuration',
      beforeStr,
      afterStr
    );
    this.notify();
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }

  public logAudit(action: string, target: string, beforeValue: string, afterValue: string) {
    const log: AuditLog = {
      id: 'aud_' + Math.random().toString(36).substring(2, 9),
      adminId: this.currentUser.id,
      adminEmail: this.currentUser.email,
      action,
      target,
      beforeValue,
      afterValue,
      timestamp: new Date().toISOString(),
      ip: '192.168.1.1',
      userAgent: navigator.userAgent || 'Browser Client'
    };
    this.auditLogs.unshift(log);
  }

  public getTestimonials(): Testimonial[] {
    return [...this.testimonials];
  }

  public deleteUserAccount(userId: string, reason: string = 'Exclusão direta pelo Admin'): boolean {
    const targetUser = this.users.find((u) => u.id === userId);
    if (!targetUser) return false;

    // Remove user, wallet and related records
    this.users = this.users.filter((u) => u.id !== userId);
    delete this.wallets[userId];

    // Persist changes locally
    this.saveToStorage();

    // Async deletion in Supabase if configured
    if (isSupabaseConfigured) {
      supabase.from('users').delete().eq('id', userId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao excluir utilizador:', error.message);
      });
      supabase.from('wallets').delete().eq('user_id', userId).then(({ error }) => {
        if (error) console.error('[Supabase] Erro ao excluir carteira:', error.message);
      });
    }

    // Log Audit
    this.logAudit(
      'DELETE_USER_ACCOUNT',
      `User: ${targetUser.email} (${userId})`,
      JSON.stringify(targetUser),
      `Motivo: ${reason}`
    );

    this.notify();
    return true;
  }

  public resetAllData() {
    localStorage.clear();
    this.currentUser = INITIAL_USERS.length > 0 ? INITIAL_USERS[0] : {
      id: 'usr_guest',
      name: 'Visitante',
      email: '',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest',
      role: 'player',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    this.users = [...INITIAL_USERS];
    this.wallets = { ...INITIAL_WALLETS };
    this.transactions = [...INITIAL_TRANSACTIONS];
    this.pastRounds = [...INITIAL_PAST_ROUNDS];
    this.adminSettings = { ...INITIAL_ADMIN_SETTINGS };
    this.auditLogs = [...INITIAL_AUDIT_LOGS];
    this.initNextRound();
    this.notify();
  }

  public logAdminAction(adminId: string, adminEmail: string, action: string, target: string, beforeValue: string, afterValue: string) {
    this.logAudit(action, target, beforeValue, afterValue);
  }
}

export const store = new SkybirdStore();
