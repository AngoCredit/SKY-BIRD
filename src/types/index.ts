export type UserRole = 'player' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'pending';
  isVerified?: boolean;
  verificationStatus?: 'verified' | 'unverified';
  phone?: string;
  countryCode?: string;
  birthDate?: string;
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  referralEarnings?: number;
  deviceFingerprint?: string;
  registeredIp?: string;
  isMultiAccountFlagged?: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export type TransactionType = 'deposit' | 'withdrawal' | 'bet' | 'cashout' | 'refund' | 'referral_bonus';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface WalletTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: 'USD';
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  status: TransactionStatus;
  createdAt: string;
  method?: 'Airtm' | 'System';
  processingTimeText?: string;
  details?: string;
}

export interface Wallet {
  userId: string;
  availableBalance: number;
  lockedBalance: number;
  totalBalance: number;
  currency: 'USD';
}

export type GameRoundStatus = 'WAITING' | 'COUNTDOWN' | 'RUNNING' | 'CRASHED' | 'FINISHED';

export interface GameRound {
  id: string;
  roundNumber: number;
  status: GameRoundStatus;
  startedAt: number | null;
  endedAt: number | null;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  totalBetsAmount: number;
  totalPayoutAmount: number;
  createdAt: string;
}

export type CurrencyType = 'USD';

export type NotificationType = 
  | 'deposit_requested' 
  | 'deposit_approved' 
  | 'deposit_rejected' 
  | 'withdrawal_requested' 
  | 'withdrawal_approved' 
  | 'withdrawal_rejected' 
  | 'support_message'
  | 'referral_bonus'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'info';

export type KYCStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar: string;
  /** Base64 data URL of the identity document photo */
  idDocumentImage: string;
  /** Base64 data URL of the user selfie holding the document */
  selfieImage: string;
  /** Airtm account (email or username) for withdrawals */
  airtmAccount: string;
  /** WhatsApp number with country code */
  whatsappNumber: string;
  status: KYCStatus;
  submittedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface SystemNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  amount?: number;
  timestamp: string;
  read?: boolean;
  userId?: string;
  createdAt?: string;
}

export interface Bet {
  id: string;
  roundId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  amount: number;
  autoCashOutMultiplier: number | null;
  cashOutMultiplier: number | null;
  payout: number | null;
  status: 'active' | 'cashed_out' | 'crashed';
  createdAt: string;
  isCurrentUser?: boolean;
  panelId?: number;
}

export type AltitudeStage = 
  | 'STAGE_1_BLUE_SKY'       // 1.00x - 1.50x
  | 'STAGE_2_HIGH_CLOUDS'     // 1.50x - 2.50x
  | 'STAGE_3_RAIN_LIGHTNING'  // 2.50x - 4.50x
  | 'STAGE_4_STORM_DEBRIS'    // 4.50x - 8.00x
  | 'STAGE_5_MESOSPHERE'      // 8.00x - 15.00x
  | 'STAGE_6_COSMIC_SPACE';   // 15.00x+

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  createdAt: string;
  isExpressLinkRequest?: boolean;
  expressLink?: string;
}

export interface SupportConversation {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userEmail: string;
  status: 'open' | 'pending' | 'resolved';
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface AdminSettings {
  gameEnabled: boolean;
  maintenanceMode: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  globalRtp: number;      // e.g. 97.0
  houseEdge: number;      // e.g. 3.0
  supportStatus: 'online' | 'busy' | 'offline';
  demoMode: boolean;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  target: string;
  beforeValue: string;
  afterValue: string;
  timestamp: string;
  ip: string;
  userAgent: string;
}

export interface Testimonial {
  id: string;
  name: string;
  avatar: string;
  comment: string;
  rating: number;
  role: string;
  multiplierWon?: string;
}

export type GraphicQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SoundConfig {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}
