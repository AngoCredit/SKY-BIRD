/**
 * supabase_rpc.ts — acesso exclusivamente às operações server-side.
 *
 * O browser envia intenção; PostgreSQL/Supabase Auth determina:
 * identidade, saldo, payout, round e resultado financeiro.
 *
 * IMPORTANTE:
 * - Nunca colocar service_role key neste ficheiro.
 * - Nunca confiar em valores financeiros calculados pelo browser.
 * - Operações financeiras devem passar por RPCs SECURITY DEFINER.
 */

import { supabase, isSupabaseConfigured } from './supabase';

/* =========================================================
   TYPES
========================================================= */

export interface PlaceBetResult {
  success: boolean;
  bet_id: string;
  transaction_id: string;
  balance_before: number;
  balance_after: number;
  round_number: number;
  panel_id: number;
  error?: string;
}

export interface CashoutBetResult {
  success: boolean;
  payout: number;
  multiplier: number;
  balance_after: number;
  transaction_id: string;
  bet_id: string;
  error?: string;
}

export interface CreateRoundResult {
  success: boolean;
  round_id: string;
  round_number: number;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  status: string;
  error?: string;
}

export interface RevealSeedResult {
  round_id: string;
  round_number: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  crash_point: number;
  status: string;
}

/* =========================================================
   INTERNAL REQUEST LOCK
========================================================= */

const pending = new Set<string>();

const fail = <T extends object>(
  base: T,
  error: string
) =>
  ({
    ...base,
    success: false,
    error,
  }) as T & {
    success: false;
    error: string;
  };

/* =========================================================
   UUID HELPER
========================================================= */

export function toValidUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidRegex.test(value) ? value : null;
}

/* =========================================================
   SERVER-SIDE PLACE BET
========================================================= */

export async function serverPlaceBet(params: {
  roundId: string;
  amount: number;
  panelId?: number;
  autoCashout?: number | null;
  idempotencyKey?: string;
}): Promise<PlaceBetResult> {
  const base = {
    bet_id: '',
    transaction_id: '',
    balance_before: 0,
    balance_after: 0,
    round_number: 0,
    panel_id: params.panelId ?? 1,
  };

  if (!isSupabaseConfigured) {
    return fail(base, 'SUPABASE_NOT_CONFIGURED');
  }

  const key =
    params.idempotencyKey ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`);

  const lock = `bet:${key}`;

  if (pending.has(lock)) {
    return fail(base, 'DOUBLE_SUBMIT');
  }

  pending.add(lock);

  try {
    const { data, error } = await supabase.rpc('place_bet', {
      p_round_id: params.roundId,
      p_amount: params.amount,
      p_panel_id: params.panelId ?? 1,
      p_auto_cashout: params.autoCashout ?? null,
      p_idempotency_key: key,
    });

    if (error) {
      return fail(base, error.message);
    }

    if (!data) {
      return fail(base, 'EMPTY_SERVER_RESPONSE');
    }

    return {
      success: true,
      bet_id: data.bet_id,
      transaction_id: data.transaction_id,
      balance_before: Number(data.balance_before),
      balance_after: Number(data.balance_after),
      round_number: Number(data.round_number),
      panel_id: Number(data.panel_id),
    };
  } catch (error) {
    return fail(
      base,
      error instanceof Error ? error.message : 'PLACE_BET_FAILED'
    );
  } finally {
    pending.delete(lock);
  }
}

/* =========================================================
   SERVER-SIDE CASHOUT
========================================================= */

export async function serverCashoutBet(params: {
  betId: string;
}): Promise<CashoutBetResult> {
  const base = {
    payout: 0,
    multiplier: 0,
    balance_after: 0,
    transaction_id: '',
    bet_id: params.betId,
  };

  if (!isSupabaseConfigured) {
    return fail(base, 'SUPABASE_NOT_CONFIGURED');
  }

  const lock = `cashout:${params.betId}`;

  if (pending.has(lock)) {
    return fail(base, 'DOUBLE_CASHOUT');
  }

  pending.add(lock);

  try {
    const { data, error } = await supabase.rpc('cashout_bet', {
      p_bet_id: params.betId,
    });

    if (error) {
      return fail(base, error.message);
    }

    if (!data) {
      return fail(base, 'EMPTY_SERVER_RESPONSE');
    }

    return {
      success: true,
      payout: Number(data.payout),
      multiplier: Number(data.multiplier),
      balance_after: Number(data.balance_after),
      transaction_id: data.transaction_id,
      bet_id: data.bet_id,
    };
  } catch (error) {
    return fail(
      base,
      error instanceof Error ? error.message : 'CASHOUT_FAILED'
    );
  } finally {
    pending.delete(lock);
  }
}

/* =========================================================
   CREATE NEXT ROUND
========================================================= */

export async function serverCreateNextRound(): Promise<CreateRoundResult> {
  const base = {
    round_id: '',
    round_number: 0,
    server_seed_hash: '',
    client_seed: '',
    nonce: 0,
    status: '',
  };

  if (!isSupabaseConfigured) {
    return fail(base, 'SUPABASE_NOT_CONFIGURED');
  }

  try {
    const { data, error } =
      await supabase.rpc('create_next_round');

    if (error) {
      return fail(base, error.message);
    }

    if (!data) {
      return fail(base, 'EMPTY_SERVER_RESPONSE');
    }

    return {
      success: true,
      round_id: data.round_id,
      round_number: Number(data.round_number),
      server_seed_hash: data.server_seed_hash,
      client_seed: data.client_seed,
      nonce: Number(data.nonce),
      status: data.status,
    };
  } catch (error) {
    return fail(
      base,
      error instanceof Error
        ? error.message
        : 'CREATE_ROUND_FAILED'
    );
  }
}

/* =========================================================
   REVEAL ROUND SEED
========================================================= */

export async function serverRevealRoundSeed(
  roundId: string
): Promise<RevealSeedResult | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const { data, error } =
      await supabase.rpc('reveal_round_seed', {
        p_round_id: roundId,
      });

    if (error || !data) {
      return null;
    }

    return {
      round_id: data.round_id,
      round_number: Number(data.round_number),
      server_seed: data.server_seed,
      server_seed_hash: data.server_seed_hash,
      client_seed: data.client_seed,
      nonce: Number(data.nonce),
      crash_point: Number(data.crash_point),
      status: data.status,
    };
  } catch {
    return null;
  }
}

/* =========================================================
   CURRENT ROUND
   SAFE RPC ONLY
========================================================= */

/**
 * O browser NÃO lê diretamente game_rounds.
 *
 * Isto evita exposição acidental de:
 * - server_seed
 * - crash_point antes do crash
 *
 * A leitura é feita através do RPC seguro get_current_round().
 */
export function subscribeToCurrentRound(
  onRoundChange: (round: any) => void
) {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRoundKey = '';

  const poll = async () => {
    if (stopped) return;

    try {
      const { data, error } =
        await supabase.rpc('get_current_round');

      if (!error && data) {
        const round = {
          id: data.id,
          round_number: Number(data.round_number),
          status: data.status,

          server_seed_hash:
            data.server_seed_hash,

          client_seed:
            data.client_seed,

          nonce:
            Number(data.nonce),

          /*
           * crash_point só pode chegar ao browser
           * depois do round terminar.
           */
          crash_point:
            ['CRASHED', 'SETTLED'].includes(data.status) &&
            data.crash_point != null
              ? Number(data.crash_point)
              : undefined,

          started_at:
            data.started_at,

          ended_at:
            data.ended_at,

          total_bets_amount:
            Number(data.total_bets_amount ?? 0),

          total_payout_amount:
            Number(data.total_payout_amount ?? 0),
        };

        const key =
          `${round.id}:` +
          `${round.status}:` +
          `${round.started_at ?? ''}:` +
          `${round.ended_at ?? ''}:` +
          `${round.crash_point ?? ''}:` +
          `${round.total_bets_amount}:` +
          `${round.total_payout_amount}`;

        if (key !== lastRoundKey) {
          lastRoundKey = key;
          onRoundChange(round);
        }
      }
    } catch (error) {
      console.warn(
        '[Supabase] current round polling failed:',
        error
      );
    } finally {
      if (!stopped) {
        timer = setTimeout(poll, 750);
      }
    }
  };

  void poll();

  return () => {
    stopped = true;

    if (timer) {
      clearTimeout(timer);
    }
  };
}

/* =========================================================
   WALLET REALTIME
========================================================= */

export function subscribeToWalletChanges(
  userId: string,
  onBalanceChange: (
    availableBalance: number,
    lockedBalance: number
  ) => void
) {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel(`wallet:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'wallets',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row: any = payload.new;

        onBalanceChange(
          Number(row.available_balance ?? 0),
          Number(row.locked_balance ?? 0)
        );
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/* =========================================================
   ACTIVE BETS REALTIME
========================================================= */

export function subscribeToActiveBets(
  roundId: string,
  onBetsChange: (bets: any[]) => void
) {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel(`bets:${roundId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bets',
        filter: `round_id=eq.${roundId}`,
      },
      async () => {
        const { data, error } =
          await supabase
            .from('bets')
            .select(
              'id,user_id,amount,cashout_multiplier,payout,status,panel_id,created_at'
            )
            .eq('round_id', roundId);

        if (!error && data) {
          onBetsChange(data);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/* =========================================================
   SUPPORT MESSAGES REALTIME
========================================================= */

export function subscribeToSupportMessages(
  onMessage: (message: any) => void
) {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel('support-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
      },
      (payload) => {
        if (payload.new) {
          onMessage(payload.new);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/* =========================================================
   TRANSACTIONS REALTIME
========================================================= */

/**
 * Necessário pelo store.ts.
 *
 * Acesso continua sujeito ao RLS de transactions.
 */
export function subscribeToTransactions(
  onTransactionChange: (transaction: any) => void
) {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel('transactions')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transactions',
      },
      (payload) => {
        if (payload.new) {
          onTransactionChange(payload.new);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/* =========================================================
   PROFILES REALTIME
========================================================= */

/**
 * Necessário pelo store.ts.
 *
 * O RLS do Supabase continua sendo a camada de autorização.
 */
export function subscribeToProfiles(
  onProfileChange: (profile: any) => void
) {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel('profiles')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
      },
      (payload) => {
        if (payload.new) {
          onProfileChange(payload.new);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/* =========================================================
   KYC DOCUMENT UPLOAD
========================================================= */

export async function uploadKYCDocument(
  userId: string,
  file: File,
  documentType: 'id_document' | 'selfie'
) {
  if (!isSupabaseConfigured) {
    return {
      path: null,
      error: 'Supabase não configurado.',
    };
  }

  const extension =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/png'
        ? 'png'
        : 'jpg';

  const filePath =
    `${userId}/${documentType}_${Date.now()}.${extension}`;

  try {
    const { error } =
      await supabase.storage
        .from('kyc-documents')
        .upload(
          filePath,
          file,
          {
            upsert: false,
            contentType: file.type,
            cacheControl: '3600',
          }
        );

    if (error) {
      return {
        path: null,
        error: error.message,
      };
    }

    return {
      path: filePath,
      error: null,
    };
  } catch (error) {
    return {
      path: null,
      error:
        error instanceof Error
          ? error.message
          : 'KYC_UPLOAD_FAILED',
    };
  }
}

/* =========================================================
   KYC SIGNED URL
========================================================= */

export async function getKYCSignedUrl(
  storagePath: string
) {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const { data, error } =
      await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(
          storagePath,
          3600
        );

    if (error) {
      return null;
    }

    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/* =========================================================
   SUPPORT MESSAGE INSERT
========================================================= */

export async function sendSupportMessageSupabase(
  params: {
    conversationId: string;
    senderId: string;
    senderName: string;
    senderRole: 'player' | 'admin';
    text: string;
  }
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: 'Supabase not configured',
    };
  }

  try {
    const { data, error } =
      await supabase
        .from('support_messages')
        .insert({
          conversation_id:
            params.conversationId,

          sender_id:
            params.senderId,

          sender_name:
            params.senderName,

          sender_role:
            params.senderRole,

          text:
            params.text,

          created_at:
            new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'SUPPORT_MESSAGE_FAILED',
    };
  }
}

/* =========================================================
   SERVER-SIDE DELETE USER
========================================================= */

/**
 * Mantém compatibilidade com o store.
 *
 * IMPORTANTE:
 * A exclusão real deve ser protegida por RLS/RPC
 * e nunca usar service_role no browser.
 */
export async function serverDeleteUser(
  userId: string
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: 'SUPABASE_NOT_CONFIGURED',
    };
  }

  const uuid = toValidUuid(userId);

  if (!uuid) {
    return {
      success: false,
      error: 'INVALID_USER_ID',
    };
  }

  try {
    /*
     * Preferimos RPC server-side.
     * Se a RPC ainda não existir, retornamos erro em vez
     * de fazer DELETE direto no browser.
     */
    const { data, error } =
      await supabase.rpc(
        'delete_user_account',
        {
          p_user_id: uuid,
        }
      );

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'DELETE_USER_FAILED',
    };
  }
}
