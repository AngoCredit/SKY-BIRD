/**
 * Production round-history bridge.
 * PostgreSQL keeps the complete audit history; the browser keeps only the latest
 * 50 completed rounds as a bounded presentation cache.
 */
import { store } from './store';
import { supabase, isSupabaseConfigured } from './supabase';
import type { GameRound } from '../types';

const HISTORY_LIMIT = 50;
let history: GameRound[] = [];
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;
let lastKey = '';

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
    const { data, error } = await supabase.rpc('get_recent_round_history', { p_limit: HISTORY_LIMIT });
    if (error) throw error;

    const next = (data ?? []).map(mapRow).slice(0, HISTORY_LIMIT);
    const key = next.map((r) => `${r.id}:${r.roundNumber}:${r.crashPoint}`).join('|');
    if (key !== lastKey) {
      lastKey = key;
      history = next;
      (store as any).notify?.();
    }
  } catch (error) {
    console.warn('[SKY-BIRD] round history refresh failed:', error);
  } finally {
    if (!stopped) refreshTimer = setTimeout(refreshHistory, 1500);
  }
}

store.getPastRounds = (() => history.slice(0, HISTORY_LIMIT)) as any;

if (isSupabaseConfigured) {
  // Clear legacy browser round cache. The live round comes from PostgreSQL.
  (store as any).currentRound = null;
  (store as any).pastRounds = [];
  void refreshHistory();

  window.addEventListener('beforeunload', () => {
    stopped = true;
    if (refreshTimer) clearTimeout(refreshTimer);
  }, { once: true });
}
