/**
 * SKY-BIRD server-round bridge.
 *
 * UI-only adapter for the authoritative backend facade. It deliberately does
 * not create rounds, calculate crash outcomes, settle bets, or mutate wallets.
 */
import {
  AuthoritativeRound,
  authoritativeCancelBet,
  authoritativeCashout,
  authoritativePlaceBet,
  getAuthoritativeRound,
  getAuthoritativeRoundBets,
  visualMultiplier,
} from './authoritativeGame';

export type ServerRoundSnapshot = {
  round: AuthoritativeRound | null;
  multiplier: number;
  bets: Awaited<ReturnType<typeof getAuthoritativeRoundBets>>;
};

export async function readServerRound(): Promise<ServerRoundSnapshot> {
  const round = await getAuthoritativeRound();
  if (!round) return { round: null, multiplier: 1, bets: [] };
  const bets = await getAuthoritativeRoundBets(round.id);
  return { round, multiplier: visualMultiplier(round), bets };
}

export async function placeServerBet(params: Parameters<typeof authoritativePlaceBet>[0]) {
  return authoritativePlaceBet(params);
}

export async function cashoutServerBet(betId: string) {
  return authoritativeCashout(betId);
}

export async function cancelServerBet(betId: string) {
  return authoritativeCancelBet(betId);
}
