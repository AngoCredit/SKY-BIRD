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

/**
 * Presentation-only lobby participants.
 *
 * These are deliberately NOT real bets: they never touch Supabase, wallets,
 * transactions, RTP, GGR, payouts, or financial reports.
 */

const BOT_PLAYERS = [
  { name: 'Maverick', flag: '🇦🇴', avatar: 'https://images.unsplash.com/photo-1611689342806-0863700ce1e4?w=200&auto=format&fit=crop&q=80' },
  { name: 'Luna', flag: '🇵🇹', avatar: 'https://images.unsplash.com/photo-1543549790-8b5f4a028cfb?w=200&auto=format&fit=crop&q=80' },
  { name: 'KwanzaFly', flag: '🇦🇴', avatar: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&auto=format&fit=crop&q=80' },
  { name: 'SkyFox', flag: '🇧🇷', avatar: 'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=200&auto=format&fit=crop&q=80' },
  { name: 'Phoenix', flag: '🇲🇿', avatar: 'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?w=200&auto=format&fit=crop&q=80' },
  { name: 'AeroKing', flag: '🇨🇻', avatar: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=200&auto=format&fit=crop&q=80' },
  { name: 'Nairobi', flag: '🇸🇹', avatar: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef9?w=200&auto=format&fit=crop&q=80' },
  { name: 'LuandaX', flag: '🇦🇴', avatar: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=200&auto=format&fit=crop&q=80' },
  { name: 'PilotOne', flag: '🇪🇸', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=SkybirdMascotCool' },
  { name: 'StormX', flag: '🇫🇷', avatar: 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=200&auto=format&fit=crop&q=80' },
  { name: 'BlueBird', flag: '🇬🇧', avatar: 'https://images.unsplash.com/photo-1536514072410-5019a3c69182?w=200&auto=format&fit=crop&q=80' },
  { name: 'Falcon', flag: '🇺🇸', avatar: 'https://images.unsplash.com/photo-1598439210625-5067c578f3f6?w=200&auto=format&fit=crop&q=80' },
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
  // Entre 3 e 12 participantes aleatórios por rodada
  return 3 + (hashRound(roundId) % 10);
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
  const totalCount = botCount(round.id);
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

  // Efeito de entrada progressiva durante WAITING e COUNTDOWN
  let nowMs = Date.now();
  let visibleCount = totalCount;

  if (round.status === 'WAITING' || round.status === 'COUNTDOWN') {
    // A contagem decrescente tem normalmente 5 segundos (5000ms)
    const targetStart = round.startedAt ? new Date(round.startedAt).getTime() : nowMs + 4000;
    const windowStart = targetStart - 5000;
    const elapsedMs = Math.max(0, nowMs - windowStart);

    // Cada bot entra num segundo/momento diferente (distribuído uniformemente entre 0s e 4.5s)
    visibleCount = 0;
    for (let i = 0; i < totalCount; i++) {
      // Espaçamento de ~0.6 a 1.2 segundos entre cada participante
      const entryTimeMs = (i * 4200) / totalCount + ((seed + i * 37) % 600);
      if (elapsedMs >= entryTimeMs) {
        visibleCount++;
      }
    }

    // Pelo menos 1 participante inicial no lobby
    visibleCount = Math.max(1, visibleCount);
  }

  const bets: Bet[] = [];
  for (let index = 0; index < visibleCount; index++) {
    const player = BOT_PLAYERS[(seed + index * 17) % BOT_PLAYERS.length];
    const amount = BOT_AMOUNTS[(seed + index * 13) % BOT_AMOUNTS.length];
    const target = botTarget(seed, index);
    const crashed = round.status === 'CRASHED';
    const cashed = !crashed && round.status === 'RUNNING' && visual >= target;
    const status: Bet['status'] = crashed
      ? target <= (round.crashPoint || 1) ? 'cashed_out' : 'crashed'
      : cashed ? 'cashed_out' : 'active';
    const cashOutMultiplier = status === 'cashed_out' ? Math.min(target, round.crashPoint || target) : null;
    const payout = cashOutMultiplier ? Number((amount * cashOutMultiplier).toFixed(2)) : null;

    bets.push({
      id: `bot-${round.id}-${index}`,
      roundId: round.id,
      userId: `bot-${index}`,
      userName: `${player.flag} ${player.name}`,
      userAvatar: player.avatar,
      amount,
      autoCashOutMultiplier: target,
      cashOutMultiplier,
      payout,
      status,
      createdAt: round.startedAt ? new Date(round.startedAt).toISOString() : new Date().toISOString(),
      isCurrentUser: false,
      panelId: 0,
    } as Bet);
  }

  return bets;
}
