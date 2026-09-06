import type { Bet, GameRound } from '../types';
import { visualMultiplier } from './authoritativeGame';

/**
 * Presentation-only lobby participants.
 *
 * These are deliberately NOT real bets: they never touch Supabase, wallets,
 * transactions, RTP, GGR, payouts, or financial reports. Every participant is
 * explicitly labelled "BOT •" in the UI so simulated activity cannot be
 * mistaken for a real customer.
 */

const BOT_NAMES = [
  'Maverick', 'Luna', 'KwanzaFly', 'SkyFox', 'Phoenix', 'AeroKing',
  'Nairobi', 'LuandaX', 'PilotOne', 'StormX', 'BlueBird', 'Falcon',
];

const BOT_AMOUNTS = [5, 10, 15, 20, 25, 30, 50, 75, 100];

function hashRound(roundId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < roundId.length; i += 1) {
    hash ^= roundId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function botCount(roundId: string): number {
  return 6 + (hashRound(roundId) % 5); // 6–10 participants
}

function botTarget(seed: number, index: number): number {
  const raw = ((seed >>> ((index % 4) * 8)) + index * 7919) % 10000;
  if (raw < 1800) return 1.25 + (raw % 75) / 100;
  if (raw < 7200) return 1.60 + (raw % 180) / 100;
  if (raw < 9300) return 2.80 + (raw % 350) / 100;
  return 5.00 + (raw % 800) / 100;
}

function avatarFor(name: string): string {
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#18243a"/><circle cx="32" cy="25" r="12" fill="#38bdf8" opacity=".85"/><path d="M14 55c2-11 10-17 18-17s16 6 18 17" fill="#38bdf8" opacity=".45"/><text x="32" y="59" text-anchor="middle" font-size="10" font-family="Arial" fill="white">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getSimulatedLobbyBets(round: GameRound | null, multiplier?: number): Bet[] {
  if (!round?.id || !['WAITING', 'COUNTDOWN', 'RUNNING', 'CRASHED'].includes(round.status)) return [];

  const seed = hashRound(round.id);
  const count = botCount(round.id);
  const authoritativeShape = {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status as any,
    startedAt: round.startedAt ? new Date(round.startedAt).toISOString() : null,
    endedAt: round.endedAt ? new Date(round.endedAt).toISOString() : null,
    crashPoint: round.crashPoint,
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    totalBetsAmount: round.totalBetsAmount,
    totalPayoutAmount: round.totalPayoutAmount,
  };
  const visual = multiplier ?? visualMultiplier(authoritativeShape);

  return Array.from({ length: count }, (_, index) => {
    const name = BOT_NAMES[(seed + index * 17) % BOT_NAMES.length];
    const amount = BOT_AMOUNTS[(seed + index * 13) % BOT_AMOUNTS.length];
    const target = botTarget(seed, index);
    const crashed = round.status === 'CRASHED';
    const cashed = !crashed && round.status === 'RUNNING' && visual >= target;
    const status: Bet['status'] = crashed
      ? target <= (round.crashPoint || 1) ? 'cashed_out' : 'crashed'
      : cashed ? 'cashed_out' : 'active';
    const cashOutMultiplier = status === 'cashed_out' ? Math.min(target, round.crashPoint || target) : null;
    const payout = cashOutMultiplier ? Number((amount * cashOutMultiplier).toFixed(2)) : null;

    return {
      id: `bot-${round.id}-${index}`,
      roundId: round.id,
      userId: `bot-${index}`,
      userName: `BOT • ${name}`,
      userAvatar: avatarFor(name),
      amount,
      autoCashOutMultiplier: target,
      cashOutMultiplier,
      payout,
      status,
      createdAt: round.startedAt ? new Date(round.startedAt).toISOString() : new Date().toISOString(),
      isCurrentUser: false,
      panelId: 0,
    } as Bet;
  });
}
