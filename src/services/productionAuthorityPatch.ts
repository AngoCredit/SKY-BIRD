/**
 * Production authority bridge.
 *
 * The legacy store still contains demo/local game code for UI compatibility.
 * This module overrides only the game-financial methods used by the live UI.
 * PostgreSQL remains the sole authority for rounds, bets, cashouts and balances.
 */
import { store } from './store';
import './productionHistoryPatch';
import {
  AuthoritativeRound,
  authoritativeCancelBet,
  authoritativePlaceBet,
  authoritativeCashout,
  getAuthoritativeRound,
  getAuthoritativeRoundBets,
  subscribeToAuthoritativeRound,
  visualMultiplier,
} from './authoritativeGame';
import { getSimulatedLobbyBets } from './simulatedLobby';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Bet, GameRound } from '../types';

let authoritativeRound: AuthoritativeRound | null = null;
let unsubscribe: (() => void) | null = null;
let latestBets: any[] = [];

function requireBackend() {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
}

function mapRound(round: AuthoritativeRound): GameRound {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    startedAt: round.startedAt ? new Date(round.startedAt).getTime() : undefined,
    endedAt: round.endedAt ? new Date(round.endedAt).getTime() : undefined,
    crashPoint: round.crashPoint,
    serverSeed: undefined,
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    totalBetsAmount: round.totalBetsAmount,
    totalPayoutAmount: round.totalPayoutAmount,
    createdAt: round.startedAt ?? new Date().toISOString(),
  } as GameRound;
}

async function refreshBets(round: AuthoritativeRound | null) {
  if (!round) {
    latestBets = [];
    store.notify();
    return;
  }
  try {
    latestBets = await getAuthoritativeRoundBets(round.id);
  } catch {
    latestBets = [];
  } finally {
    // Push server-bet changes into the React store subscription without making
    // the browser responsible for any game/financial state transition.
    store.notify();
  }
}

function startAuthority() {
  if (unsubscribe || !isSupabaseConfigured) return;
  unsubscribe = subscribeToAuthoritativeRound((round) => {
    authoritativeRound = round;
    void refreshBets(round);
    store.notify();
  }, 500);
}

const originalGetActiveBets = store.getActiveBets.bind(store);

store.getSynchronizedRoundState = (() => {
  startAuthority();
  const round = authoritativeRound;
  if (!round) {
    return {
      roundNumber: 0,
      status: 'WAITING',
      startedAt: Date.now(),
      countdownRemaining: 5,
      currentMultiplier: 1,
      crashPoint: 0,
      serverSeedHash: '',
      serverSeed: '',
      clientSeed: '',
    } as any;
  }
  const multiplier = visualMultiplier(round);
  const startedAt = round.startedAt ? new Date(round.startedAt).getTime() : Date.now();
  const countdownRemaining = round.status === 'WAITING' || round.status === 'COUNTDOWN'
    ? Math.max(0, Math.ceil((5000 - Math.max(0, Date.now() - startedAt)) / 1000))
    : 0;
  return {
    roundNumber: round.roundNumber,
    status: round.status,
    startedAt,
    countdownRemaining,
    currentMultiplier: multiplier,
    crashPoint: round.crashPoint ?? 0,
    serverSeedHash: round.serverSeedHash,
    serverSeed: '',
    clientSeed: round.clientSeed,
  } as any;
}) as any;

store.getCurrentRound = (() => {
  startAuthority();
  if (authoritativeRound) return mapRound(authoritativeRound);
  return {
    id: '', roundNumber: 0, status: 'WAITING', crashPoint: undefined,
    serverSeed: undefined, serverSeedHash: '', clientSeed: '', nonce: 0,
    totalBetsAmount: 0, totalPayoutAmount: 0,
  } as GameRound;
}) as any;

store.placeBetAsync = (async (
  amount: number,
  autoCashOutMultiplier: number | null = null,
  panelId: number = 1,
) => {
  requireBackend();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('UNAUTHENTICATED');
  startAuthority();
  const round = authoritativeRound ?? await getAuthoritativeRound();
  if (!round || !['WAITING', 'COUNTDOWN'].includes(round.status)) {
    throw new Error('ROUND_NOT_ACCEPTING_BETS');
  }

  const result = await authoritativePlaceBet({
    roundId: round.id,
    amount,
    panelId,
    autoCashout: autoCashOutMultiplier,
  });

  const bet: Bet = {
    id: result.bet_id,
    roundId: round.id,
    userId: auth.user.id,
    userName: auth.user.user_metadata?.name || auth.user.email || 'Jogador',
    userAvatar: auth.user.user_metadata?.avatar_url || '',
    amount,
    autoCashOutMultiplier,
    cashOutMultiplier: null,
    payout: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    isCurrentUser: true,
    panelId,
  } as Bet;

  void refreshBets(round);
  return { bet, serverResult: result };
}) as any;

store.cashOutAsync = (async (_currentMultiplier: number, panelId?: number) => {
  requireBackend();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('UNAUTHENTICATED');

  const candidates = latestBets.length ? latestBets : await getAuthoritativeRoundBets(authoritativeRound?.id || '');
  const myBet = candidates.find((b: any) => b.isCurrentUser && b.status === 'active' && (!panelId || b.panelId === panelId));
  if (!myBet) throw new Error('ACTIVE_BET_NOT_FOUND');

  const result = await authoritativeCashout(myBet.id);
  void refreshBets(authoritativeRound);
  return { payout: result.payout, multiplier: result.multiplier, betId: result.bet_id };
}) as any;

store.cancelBet = (async (panelId: number = 1) => {
  requireBackend();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('UNAUTHENTICATED');
  const candidates = latestBets.length ? latestBets : await getAuthoritativeRoundBets(authoritativeRound?.id || '');
  const myBet = candidates.find((b: any) => b.isCurrentUser && b.status === 'active' && b.panelId === panelId);
  if (!myBet) return false;
  await authoritativeCancelBet(myBet.id);
  void refreshBets(authoritativeRound);
  return true;
}) as any;

// Client-side outcome/settlement methods are deliberately disabled.
store.triggerBotCashouts = (() => undefined) as any;
store.endRound = (() => undefined) as any;
store.extendFlightIfRealPlayersOut = (() => undefined) as any;
store.setRoundStatus = (() => {
  throw new Error('SERVER_AUTHORITY_REQUIRED');
}) as any;
store.placeBet = (() => {
  throw new Error('SERVER_AUTHORITY_REQUIRED');
}) as any;
store.cashOut = (() => {
  throw new Error('SERVER_AUTHORITY_REQUIRED');
}) as any;

// Expose real server bets plus clearly labelled presentation-only bots.
// Bots never enter PostgreSQL and are excluded from financial metrics.
store.getActiveBets = (() => {
  const mapped = latestBets.map((b: any) => ({
    id: b.id,
    roundId: b.roundId,
    userId: b.isCurrentUser ? b.userId : undefined,
    userName: b.isCurrentUser ? 'Você' : 'Jogador',
    userAvatar: '',
    amount: b.amount,
    autoCashOutMultiplier: b.autoCashoutMultiplier,
    cashOutMultiplier: b.cashoutMultiplier,
    payout: b.payout,
    status: b.status,
    createdAt: b.createdAt,
    isCurrentUser: b.isCurrentUser,
    panelId: b.panelId,
  })) as Bet[];

  const round = authoritativeRound ? mapRound(authoritativeRound) : null;
  const multiplier = authoritativeRound ? visualMultiplier(authoritativeRound) : 1;
  const bots = getSimulatedLobbyBets(round, multiplier);
  return [...mapped, ...bots];
}) as any;

void originalGetActiveBets;
startAuthority();
