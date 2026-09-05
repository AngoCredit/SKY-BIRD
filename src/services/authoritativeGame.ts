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

  return {
    id: data.id,
    roundNumber: Number(data.round_number),
    status: data.status,
    startedAt: data.started_at ?? null,
    endedAt: data.ended_at ?? null,
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
 * Returns the animation multiplier only from server start time.
 * It is visual state, not a financial authority.
 */
export function visualMultiplier(round: AuthoritativeRound, nowMs = Date.now()): number {
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
