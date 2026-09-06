/**
 * Production round-history bridge.
 *
 * The browser keeps only the latest 50 completed rounds. PostgreSQL remains
 * the source of truth; this is a bounded presentation cache, not a deletion
 * mechanism for financial or audit records.
 */
import { store } from './store';
import { supabase, isSupabaseConfigured } from './supabase';
import { subscribeToAuthoritativeRound } from './authoritativeGame';
import type { GameRound } from '../types';

const HISTORY_LIMIT = 50;
let history: GameRound[] = [];
let loaded = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;

function mapRow(row: any): GameRound {
  return {
    id: String(row.id),
    roundNumber: Number(row.round_number),
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : undefined,
    endedAt: row.ended_at ? new Date(row.ended_at).getTime() : undefined,
    crashPoint: Number(row.crash_point),
    serverSeed: undefined,
    serverSeedHash: row.server_seed_hash || '',
    clientSeed: row.client_seed || '',
    nonce: Number(row.nonce || 0),
    totalBetsAmount: Number(row.total_bets_amount || 0),
    totalPayoutAmount: Number(row.total_payout_amount || 0),
    createdAt: row.created_at || row.ended_at || row.started_at || new Date().toISOString(),
  } as GameRound;
}

async function refreshHistory() {
  if (!isSupabaseConfigured || stopped) return;
  try {
    const { data, error } = await supabase.rpc('get_recent_round_history', {
      p_limit: HISTORY_LIMIT,
    });
    if (error) throw error;
    history = (data ?? []).map(mapRow).slice(0, HISTORY_LIMIT);
    loaded = true;
  } catch (error) {
    console.warn('[SKY-BIRD] round history refresh failed:', error);
  }
}

store.getPastRounds = (() => history.slice(0, HISTORY_LIMIT)) as any;

if (isSupabaseConfigured) {
  // Discard the legacy constructor's local/demo round state after the
  // production authority patch has loaded. It must never become the live game.
  (store as any).currentRound = null;
  (store as any).pastRounds = [];

  void refreshHistory();

  const unsubscribe = subscribeToAuthoritativeRound((round) => {
    if (round.status !== 'CRASHED' && round.status !== 'SETTLED') return;
    void refreshHistory();
  }, 500);

  const keepAlive = () => {
    if (stopped) return;
    if (!loaded) void refreshHistory();
    refreshTimer = setTimeout(keepAlive, 15000);
  };
  refreshTimer = setTimeout(keepAlive, 15000);

  window.addEventListener('beforeunload', () => {
    stopped = true;
    unsubscribe();
    if (refreshTimer) clearTimeout(refreshTimer);
  }, { once: true });
}
