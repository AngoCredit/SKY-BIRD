/**
 * SKY-BIRD authoritative game client facade.
 *
 * This module deliberately contains no local financial fallback.
 * The browser requests state/actions; PostgreSQL remains authoritative.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export type AuthoritativeRound = {
  id: string;
  roundNumber: number;
  status: 'WAITING' | 'COUNTDOWN' | 'RUNNING' | 'CRASHED' | 'SETTLED';
  startedAt: string | null;
  endedAt: string | null;
  /** Timestamp when this round is scheduled to start (available during WAITING) */
  scheduledStartAt: string | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  totalBetsAmount: number;
  totalPayoutAmount: number;
  crashPoint?: number;
};

export type AuthoritativeBet = {
  id: string;
  roundId: string;
  amount: number;
  autoCashoutMultiplier: number | null;
  cashoutMultiplier: number | null;
  payout: number;
  status: string;
  panelId: number;
  isCurrentUser: boolean;
  createdAt: string;
};

export type PlaceBetResponse = {
  success: true;
  bet_id: string;
  transaction_id: string;
  balance_before: number;
  balance_after: number;
  round_number: number;
  panel_id: number;
};

export type CashoutResponse = {
  success: true;
  payout: number;
  multiplier: number;
  balance_after: number;
  transaction_id: string;
  bet_id: string;
};

function requireBackend() {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
}

export async function getAuthoritativeRound(): Promise<AuthoritativeRound | null> {
  requireBackend();

  const { data, error } = await supabase.rpc('get_current_round');
  if (error) throw new Error(error.message);
  if (!data) return null;

  // Sync server clock offset using current server timestamp if available
  const serverTimeIso = data.started_at || data.scheduled_start_at || data.ended_at;
  if (serverTimeIso) {
    updateServerOffset(serverTimeIso);
  }

  return {
    id: data.id,
    roundNumber: Number(data.round_number),
    status: data.status,
    startedAt: data.started_at ?? null,
    endedAt: data.ended_at ?? null,
    scheduledStartAt: data.scheduled_start_at ?? null,
    serverSeedHash: data.server_seed_hash ?? '',
    clientSeed: data.client_seed ?? '',
    nonce: Number(data.nonce ?? 0),
    totalBetsAmount: Number(data.total_bets_amount ?? 0),
    totalPayoutAmount: Number(data.total_payout_amount ?? 0),
    ...(data.crash_point != null ? { crashPoint: Number(data.crash_point) } : {}),
  };
}

export async function getAuthoritativeRoundBets(roundId: string): Promise<AuthoritativeBet[]> {
  requireBackend();

  const { data, error } = await supabase.rpc('get_public_round_bets', {
    p_round_id: roundId,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    roundId: row.round_id,
    amount: Number(row.amount ?? 0),
    autoCashoutMultiplier:
      row.auto_cashout_multiplier == null ? null : Number(row.auto_cashout_multiplier),
    cashoutMultiplier:
      row.cashout_multiplier == null ? null : Number(row.cashout_multiplier),
    payout: Number(row.payout ?? 0),
    status: row.status,
    panelId: Number(row.panel_id ?? 1),
    isCurrentUser: Boolean(row.is_current_user),
    createdAt: row.created_at,
  }));
}

export async function authoritativePlaceBet(params: {
  roundId: string;
  amount: number;
  panelId: number;
  autoCashout: number | null;
  idempotencyKey?: string;
}): Promise<PlaceBetResponse> {
  requireBackend();

  const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();
  const { data, error } = await supabase.rpc('place_bet', {
    p_round_id: params.roundId,
    p_amount: params.amount,
    p_panel_id: params.panelId,
    p_auto_cashout: params.autoCashout,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error ?? 'PLACE_BET_REJECTED');
  return data as PlaceBetResponse;
}

export async function authoritativeCashout(betId: string): Promise<CashoutResponse> {
  requireBackend();

  // No multiplier is sent. PostgreSQL derives the payout from server time.
  const { data, error } = await supabase.rpc('cashout_bet', {
    p_bet_id: betId,
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error ?? 'CASHOUT_REJECTED');
  return data as CashoutResponse;
}

export async function authoritativeCancelBet(betId: string) {
  requireBackend();

  const { data, error } = await supabase.rpc('cancel_bet', {
    p_bet_id: betId,
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error ?? 'CANCEL_REJECTED');
  return data;
}

/**
 * Server clock synchronization offset in milliseconds.
 * serverNowMs() = Date.now() + serverClockOffsetMs
 */
let serverClockOffsetMs = 0;

export function updateServerOffset(serverTimestampIso?: string | null) {
  if (!serverTimestampIso) return;
  const serverTime = new Date(serverTimestampIso).getTime();
  if (isNaN(serverTime)) return;
  const localNow = Date.now();
  const newOffset = serverTime - localNow;

  // Initialize once if 0, or update with heavy dampening to prevent clock jitter/jumping
  if (serverClockOffsetMs === 0) {
    serverClockOffsetMs = newOffset;
  } else {
    // Only smooth if discrepancy exceeds 1000ms, otherwise keep stable offset
    const diff = Math.abs(newOffset - serverClockOffsetMs);
    if (diff > 1000) {
      serverClockOffsetMs = serverClockOffsetMs * 0.9 + newOffset * 0.1;
    }
  }
}

export function serverNowMs(): number {
  return Date.now() + serverClockOffsetMs;
}

export function getServerClockOffset(): number {
  return serverClockOffsetMs;
}

/**
 * Single Authoritative Round Timeline derivation
 */
export type RoundTimeline = {
  roundId: string;
  status: 'WAITING' | 'COUNTDOWN' | 'RUNNING' | 'CRASHED' | 'SETTLED';
  nowMs: number;
  scheduledStartMs: number | null;
  startedMs: number | null;
  endedMs: number | null;
  countdownRemainingMs: number;
  countdownSeconds: number;
  elapsedRunningMs: number;
  progress: number;
};

// Persistent cache of round timeline reference points to guarantee monotonicity
const roundRefCache = new Map<string, { scheduledStartMs: number; initialDurationMs: number }>();

export function getRoundTimeline(round: AuthoritativeRound | null, nowMs = serverNowMs()): RoundTimeline | null {
  if (!round) return null;

  const rawScheduledStartMs = round.scheduledStartAt ? new Date(round.scheduledStartAt).getTime() : null;
  const startedMs = round.startedAt ? new Date(round.startedAt).getTime() : null;
  const endedMs = round.endedAt ? new Date(round.endedAt).getTime() : null;

  // Ensure stable reference for the same round.id
  let ref = roundRefCache.get(round.id);
  if (!ref && (rawScheduledStartMs || startedMs)) {
    const startMs = rawScheduledStartMs ?? startedMs ?? nowMs;
    const initialRem = Math.max(5000, startMs - nowMs);
    ref = { scheduledStartMs: startMs, initialDurationMs: initialRem };
    roundRefCache.set(round.id, ref);

    // Limit cache size
    if (roundRefCache.size > 20) {
      const oldestKey = roundRefCache.keys().next().value;
      if (oldestKey) roundRefCache.delete(oldestKey);
    }
  }

  const scheduledStartMs = ref?.scheduledStartMs ?? rawScheduledStartMs ?? startedMs;

  let countdownRemainingMs = 0;
  let countdownSeconds = 0;
  let elapsedRunningMs = 0;
  let progress = 0;

  if (round.status === 'WAITING' || round.status === 'COUNTDOWN') {
    const targetMs = scheduledStartMs ?? nowMs;
    countdownRemainingMs = Math.max(0, targetMs - nowMs);
    countdownSeconds = Math.ceil(countdownRemainingMs / 1000);

    // Standard Aviator countdown window duration is 5000ms (5 seconds)
    const duration = 5000;
    progress = Math.min(1, Math.max(0, 1 - (countdownRemainingMs / duration)));

    if (process.env.NODE_ENV === 'development') {
      console.debug('[ROUND CLOCK]', {
        roundId: round.id,
        status: round.status,
        scheduledStartMs,
        serverNowMs: nowMs,
        remainingMs: countdownRemainingMs,
        seconds: countdownSeconds,
      });
    }
  } else if (round.status === 'RUNNING') {
    const start = startedMs ?? nowMs;
    elapsedRunningMs = Math.max(0, nowMs - start);
    progress = 1;
  } else if (round.status === 'CRASHED' || round.status === 'SETTLED') {
    progress = 1;
  }

  return {
    roundId: round.id,
    status: round.status,
    nowMs,
    scheduledStartMs,
    startedMs,
    endedMs,
    countdownRemainingMs,
    countdownSeconds,
    elapsedRunningMs,
    progress,
  };
}

/**
 * Returns the animation multiplier only from server start time using synchronized server clock.
 * It is visual state, not a financial authority.
 */
export function visualMultiplier(round: AuthoritativeRound, nowMs = serverNowMs()): number {
  if (round.status !== 'RUNNING' || !round.startedAt) return 1;

  const elapsedSeconds = Math.max(
    0,
    (nowMs - new Date(round.startedAt).getTime()) / 1000
  );

  const visual = Math.floor(Math.exp(0.25 * elapsedSeconds) * 100) / 100;
  return round.crashPoint != null ? Math.min(visual, round.crashPoint) : visual;
}

export function subscribeToAuthoritativeRound(
  onRound: (round: AuthoritativeRound) => void,
  intervalMs = 500
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previousKey = '';

  const poll = async () => {
    if (stopped) return;

    try {
      const round = await getAuthoritativeRound();
      if (round) {
        const key = [
          round.id,
          round.status,
          round.startedAt,
          round.endedAt,
          round.crashPoint ?? '',
          round.totalBetsAmount,
          round.totalPayoutAmount,
        ].join(':');

        if (key !== previousKey) {
          previousKey = key;
          onRound(round);
        }
      }
    } catch (error) {
      console.warn('[SKY-BIRD] authoritative round poll failed:', error);
    } finally {
      if (!stopped) timer = setTimeout(poll, intervalMs);
    }
  };

  void poll();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Client-side engine fallback.
 *
 * Calls public.client_tick_engine() every 250 ms so the game state advances
 * even when the persistent Node.js worker (npm run engine) is not running.
 *
 * When the server worker IS running it holds the advisory lock and this
 * function returns immediately without doing financial work.
 *
 * Call startClientEngineLoop() once on app boot and store the returned stop().
 */
export function startClientEngineLoop(tickMs = 250) {
  if (!isSupabaseConfigured) {
    console.warn('[SKY-BIRD] Client engine loop skipped: Supabase not configured');
    return () => {};
  }

  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      await supabase.rpc('client_tick_engine');
    } catch {
      // Silently ignore — the function may not exist yet (requires FIX_CLIENT_ENGINE_TICK.sql)
    }
    if (!stopped) setTimeout(tick, tickMs);
  };

  // Small initial delay to let the subscription settle first
  const initial = setTimeout(tick, 500);

  return () => {
    stopped = true;
    clearTimeout(initial);
  };
}

