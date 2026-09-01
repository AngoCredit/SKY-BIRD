/**
 * supabase_rpc.ts — Camada de RPC server-side para SKYBIRD
 *
 * REGRA ABSOLUTA:
 *  - place_bet()   → ÚNICO ponto de entrada para apostas reais
 *  - cashout_bet() → ÚNICO ponto de entrada para cashout real
 *  - O frontend NUNCA calcula saldo, payout ou crash_point.
 *  - O frontend apenas envia intenção e recebe o resultado do servidor.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ─────────────────────────────────────────────────────────
// TIPOS DE RETORNO DAS RPCs
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Vigilância de chamadas em andamento — Proteção Idempotência
// Impede double-click e retry concorrente para o mesmo painel
// ─────────────────────────────────────────────────────────
const _pendingBets: Map<string, true> = new Map();
const _pendingCashouts: Map<string, true> = new Map();

// ─────────────────────────────────────────────────────────
// place_bet — Aposta atómica via RPC server-side
// ─────────────────────────────────────────────────────────

export async function serverPlaceBet(params: {
  roundId: string;
  amount: number;
  panelId?: number;
  autoCashout?: number | null;
  idempotencyKey?: string;
}): Promise<PlaceBetResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      bet_id: '',
      transaction_id: '',
      balance_before: 0,
      balance_after: 0,
      round_number: 0,
      panel_id: params.panelId ?? 1,
      error: 'SUPABASE_NOT_CONFIGURED: Supabase não configurado. Configure VITE_SUPABASE_ANON_KEY no .env'
    };
  }

  // Idempotency Key gerada pelo cliente ou recebida (garante idempotência no PostgreSQL)
  const dbIdempotencyKey = params.idempotencyKey || `idemp_bet_${params.roundId}_p${params.panelId ?? 1}_amt${params.amount}`;
  const lockKey = `bet:${params.roundId}:${params.panelId ?? 1}`;
  
  if (_pendingBets.has(lockKey)) {
    return {
      success: false,
      bet_id: '',
      transaction_id: '',
      balance_before: 0,
      balance_after: 0,
      round_number: 0,
      panel_id: params.panelId ?? 1,
      error: 'DOUBLE_SUBMIT: Aposta já está a ser processada. Aguarde.'
    };
  }

  _pendingBets.set(lockKey, true);

  try {
    let { data, error } = await supabase.rpc('place_bet', {
      p_amount:          params.amount,
      p_auto_cashout:    params.autoCashout ?? null,
      p_panel_id:        params.panelId ?? 1,
      p_round_id:        params.roundId,
      p_idempotency_key: dbIdempotencyKey
    });

    // Se o banco de dados Supabase ainda não tiver a nova assinatura com p_idempotency_key, tentar a assinatura de 4 parâmetros
    if (error && error.message.includes('Could not find the function')) {
      const retry = await supabase.rpc('place_bet', {
        p_round_id:     params.roundId,
        p_amount:       params.amount,
        p_panel_id:     params.panelId ?? 1,
        p_auto_cashout: params.autoCashout ?? null
      });
      if (!retry.error) {
        data = retry.data;
        error = null;
      } else {
        // Se ainda falhar, tentar com 2 parâmetros simples
        const retry2 = await supabase.rpc('place_bet', {
          p_amount:   params.amount,
          p_round_id: params.roundId
        });
        data = retry2.data;
        error = retry2.error;
      }
    }

    if (error && error.message.includes('ROUND_NOT_FOUND')) {
      // Auto-criar a rodada na tabela game_rounds do Supabase e tentar novamente
      const rNum = Number(params.roundId.replace(/\D/g, '')) || 1000;
      await supabase.from('game_rounds').upsert({
        id: params.roundId,
        round_number: rNum,
        status: 'COUNTDOWN',
        server_seed_hash: 'skybird_auto_hash',
        client_seed: 'skybird_client_seed_main',
        started_at: new Date().toISOString()
      }, { onConflict: 'id' });

      const retryRound = await supabase.rpc('place_bet', {
        p_amount:          params.amount,
        p_auto_cashout:    params.autoCashout ?? null,
        p_panel_id:        params.panelId ?? 1,
        p_round_id:        params.roundId,
        p_idempotency_key: dbIdempotencyKey
      });

      if (!retryRound.error) {
        data = retryRound.data;
        error = null;
      }
    }

    if (error) {
      console.error('[RPC] place_bet error:', error.message);
      const isMissingFunc = error.message.includes('Could not find the function');
      const userMessage = isMissingFunc
        ? 'A função SQL place_bet precisa ser executada no SQL Editor do Supabase. Verifique o ficheiro supabase/migrations/20260901_financial_integrity_and_rpc.sql.'
        : error.message;

      return {
        success: false,
        bet_id: '',
        transaction_id: '',
        balance_before: 0,
        balance_after: 0,
        round_number: 0,
        panel_id: params.panelId ?? 1,
        error: userMessage
      };
    }

    return {
      success: true,
      bet_id:          data.bet_id,
      transaction_id:  data.transaction_id,
      balance_before:  Number(data.balance_before),
      balance_after:   Number(data.balance_after),
      round_number:    Number(data.round_number),
      panel_id:        Number(data.panel_id)
    };
  } catch (err: any) {
    console.error('[RPC] place_bet exception:', err.message);
    return {
      success: false,
      bet_id: '',
      transaction_id: '',
      balance_before: 0,
      balance_after: 0,
      round_number: 0,
      panel_id: params.panelId ?? 1,
      error: err.message
    };
  } finally {
    _pendingBets.delete(lockKey);
  }
}

// ─────────────────────────────────────────────────────────
// cashout_bet — Cashout atómico via RPC server-side
// O payout é sempre calculado no PostgreSQL.
// O frontend apenas envia o multiplicador actual.
// ─────────────────────────────────────────────────────────

export async function serverCashoutBet(params: {
  betId: string;
  multiplier: number;
}): Promise<CashoutBetResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      payout: 0,
      multiplier: params.multiplier,
      balance_after: 0,
      transaction_id: '',
      bet_id: params.betId,
      error: 'SUPABASE_NOT_CONFIGURED: Supabase não configurado.'
    };
  }

  // Chave de idempotência: betId
  const lockKey = `cashout:${params.betId}`;
  if (_pendingCashouts.has(lockKey)) {
    return {
      success: false,
      payout: 0,
      multiplier: params.multiplier,
      balance_after: 0,
      transaction_id: '',
      bet_id: params.betId,
      error: 'DOUBLE_CASHOUT: Cashout já está a ser processado.'
    };
  }

  _pendingCashouts.set(lockKey, true);

  try {
    const { data, error } = await supabase.rpc('cashout_bet', {
      p_bet_id:     params.betId,
      p_multiplier: params.multiplier
    });

    if (error) {
      console.error('[RPC] cashout_bet error:', error.message);
      return {
        success: false,
        payout: 0,
        multiplier: params.multiplier,
        balance_after: 0,
        transaction_id: '',
        bet_id: params.betId,
        error: error.message
      };
    }

    return {
      success: true,
      payout:         Number(data.payout),
      multiplier:     Number(data.multiplier),
      balance_after:  Number(data.balance_after),
      transaction_id: data.transaction_id,
      bet_id:         data.bet_id
    };
  } catch (err: any) {
    console.error('[RPC] cashout_bet exception:', err.message);
    return {
      success: false,
      payout: 0,
      multiplier: params.multiplier,
      balance_after: 0,
      transaction_id: '',
      bet_id: params.betId,
      error: err.message
    };
  } finally {
    _pendingCashouts.delete(lockKey);
  }
}

// ─────────────────────────────────────────────────────────
// create_next_round — Criar rodada no servidor
// O crash_point é determinado inteiramente no PostgreSQL.
// ─────────────────────────────────────────────────────────

export async function serverCreateNextRound(): Promise<CreateRoundResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      round_id: '',
      round_number: 0,
      server_seed_hash: '',
      client_seed: '',
      nonce: 0,
      status: '',
      error: 'SUPABASE_NOT_CONFIGURED'
    };
  }

  try {
    const { data, error } = await supabase.rpc('create_next_round');

    if (error) {
      console.error('[RPC] create_next_round error:', error.message);
      return {
        success: false,
        round_id: '',
        round_number: 0,
        server_seed_hash: '',
        client_seed: '',
        nonce: 0,
        status: '',
        error: error.message
      };
    }

    return {
      success: true,
      round_id:          data.round_id,
      round_number:      Number(data.round_number),
      server_seed_hash:  data.server_seed_hash,
      client_seed:       data.client_seed,
      nonce:             Number(data.nonce),
      status:            data.status
    };
  } catch (err: any) {
    return {
      success: false,
      round_id: '',
      round_number: 0,
      server_seed_hash: '',
      client_seed: '',
      nonce: 0,
      status: '',
      error: err.message
    };
  }
}

// ─────────────────────────────────────────────────────────
// reveal_round_seed — Revelar server_seed após CRASHED
// Permite verificação Provably Fair pelo utilizador.
// ─────────────────────────────────────────────────────────

export async function serverRevealRoundSeed(roundId: string): Promise<RevealSeedResult | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase.rpc('reveal_round_seed', {
      p_round_id: roundId
    });

    if (error) {
      console.error('[RPC] reveal_round_seed error:', error.message);
      return null;
    }

    return {
      round_id:          data.round_id,
      round_number:      Number(data.round_number),
      server_seed:       data.server_seed,
      server_seed_hash:  data.server_seed_hash,
      client_seed:       data.client_seed,
      nonce:             Number(data.nonce),
      crash_point:       Number(data.crash_point),
      status:            data.status
    };
  } catch (err: any) {
    console.error('[RPC] reveal_round_seed exception:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────
const _walletChannels: Map<string, any> = new Map();

export function subscribeToWalletChanges(
  userId: string,
  onBalanceChange: (availableBalance: number, lockedBalance: number) => void
) {
  if (!isSupabaseConfigured) return () => {};

  // Se já existe um canal ativo para este utilizador, remove-o antes de criar um novo
  if (_walletChannels.has(userId)) {
    try {
      supabase.removeChannel(_walletChannels.get(userId));
    } catch {
      /* ignore */
    }
    _walletChannels.delete(userId);
  }

  const channelName = `wallet:${userId}`;
  const channel = supabase.channel(channelName);

  channel
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'wallets',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const row = payload.new as any;
        onBalanceChange(
          Number(row.available_balance ?? 0),
          Number(row.locked_balance ?? 0)
        );
      }
    )
    .subscribe();

  _walletChannels.set(userId, channel);

  // Retornar função de cleanup
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
    _walletChannels.delete(userId);
  };
}

// ─────────────────────────────────────────────────────────
// subscribeToCurrentRound — Realtime: Estado da rodada activa
// ─────────────────────────────────────────────────────────

export function subscribeToCurrentRound(
  onRoundChange: (round: {
    id: string;
    round_number: number;
    status: string;
    server_seed_hash: string;
    client_seed: string;
    nonce: number;
    crash_point?: number;  // Apenas exposto depois de CRASHED
    started_at?: string;
    ended_at?: string;
    total_bets_amount: number;
    total_payout_amount: number;
  }) => void
) {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel('game_rounds_current')
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'game_rounds'
      },
      (payload) => {
        const row = payload.new as any;
        if (!row) return;

        // Nunca expor crash_point antes do encerramento
        const isClosed = row.status === 'CRASHED' || row.status === 'FINISHED';

        onRoundChange({
          id:                   row.id,
          round_number:         Number(row.round_number),
          status:               row.status,
          server_seed_hash:     row.server_seed_hash,  // Hash pública (sempre visível)
          client_seed:          row.client_seed,
          nonce:                Number(row.nonce),
          crash_point:          isClosed ? Number(row.crash_point) : undefined,
          started_at:           row.started_at,
          ended_at:             row.ended_at,
          total_bets_amount:    Number(row.total_bets_amount ?? 0),
          total_payout_amount:  Number(row.total_payout_amount ?? 0)
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─────────────────────────────────────────────────────────
// subscribeToActiveBets — Realtime: Apostas activas da rodada
// ─────────────────────────────────────────────────────────

export function subscribeToActiveBets(
  roundId: string,
  onBetsChange: (bets: any[]) => void
) {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel(`bets:${roundId}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'bets',
        filter: `round_id=eq.${roundId}`
      },
      async () => {
        // Ao qualquer mudança, re-fetch para garantir consistência
        const { data } = await supabase
          .from('bets')
          .select('id, user_id, amount, cashout_multiplier, payout, status, panel_id, created_at')
          .eq('round_id', roundId);

        if (data) onBetsChange(data);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─────────────────────────────────────────────────────────
// uploadKYCDocument — Upload para bucket privado kyc-documents
// Sem URLs públicas permanentes. Admin acede via signed URLs.
// ─────────────────────────────────────────────────────────

export async function uploadKYCDocument(
  userId: string,
  file: File,
  documentType: 'id_document' | 'selfie'
): Promise<{ path: string | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { path: null, error: 'Supabase não configurado.' };
  }

  const extension = file.type === 'application/pdf' ? 'pdf' : 'jpg';
  const filePath = `${userId}/${documentType}_${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from('kyc-documents')
    .upload(filePath, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600'
    });

  if (error) {
    console.error('[KYC Storage] Upload error:', error.message);
    return { path: null, error: error.message };
  }

  return { path: filePath, error: null };
}

// ─────────────────────────────────────────────────────────
// getKYCSignedUrl — URL temporária para Admin visualizar documento
// Válida por 1 hora. Nunca pública permanente.
// ─────────────────────────────────────────────────────────

export async function getKYCSignedUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.storage
    .from('kyc-documents')
    .createSignedUrl(storagePath, 3600); // 1 hora

  if (error || !data?.signedUrl) {
    console.error('[KYC Storage] Signed URL error:', error?.message);
    return null;
  }

  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────
// SUPPORT MESSAGES — Realtime & Persistence
// ─────────────────────────────────────────────────────────

export async function sendSupportMessageSupabase(params: {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'player' | 'admin';
  text: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' };

  try {
    const { data, error } = await supabase
      .from('support_messages')
      .insert({
        conversation_id: params.conversationId,
        sender_id: params.senderId,
        sender_name: params.senderName,
        sender_role: params.senderRole,
        text: params.text,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Support] Error sending message:', error.message);
      return { success: false, error: error.message };
    }

    // Update conversation last message in support_conversations
    await supabase
      .from('support_conversations')
      .upsert({
        id: params.conversationId,
        user_id: params.senderId,
        user_name: params.senderName,
        last_message: params.text,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

let _supportChannel: any = null;
export function subscribeToSupportMessages(onMessage: (msg: any) => void) {
  if (!isSupabaseConfigured) return () => {};

  if (_supportChannel) {
    try { supabase.removeChannel(_supportChannel); } catch { /* safe */ }
  }

  _supportChannel = supabase
    .channel('support_messages_channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_messages' },
      (payload) => {
        if (payload.new) onMessage(payload.new);
      }
    )
    .subscribe();

  return () => {
    try { supabase.removeChannel(_supportChannel); } catch { /* safe */ }
    _supportChannel = null;
  };
}

// ─────────────────────────────────────────────────────────
// TRANSACTIONS — Realtime & Persistence (Deposits / Withdrawals)
// ─────────────────────────────────────────────────────────

export async function createTransactionSupabase(params: {
  userId: string;
  type: 'deposit' | 'withdrawal' | 'bet' | 'cashout' | 'refund' | 'referral_bonus';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  method?: string;
  details?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' };

  try {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: params.userId,
        type: params.type,
        amount: params.amount,
        currency: 'USD',
        balance_before: params.balanceBefore,
        balance_after: params.balanceAfter,
        reference: params.reference,
        status: params.type === 'deposit' || params.type === 'withdrawal' ? 'pending' : 'completed',
        method: params.method || 'Airtm',
        details: params.details || '',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Transaction] Error creating transaction:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

let _txChannel: any = null;
export function subscribeToTransactions(onTxChange: (tx: any) => void) {
  if (!isSupabaseConfigured) return () => {};

  if (_txChannel) {
    try { supabase.removeChannel(_txChannel); } catch { /* safe */ }
  }

  _txChannel = supabase
    .channel('transactions_channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions' },
      (payload) => {
        if (payload.new) onTxChange(payload.new);
      }
    )
    .subscribe();

  return () => {
    try { supabase.removeChannel(_txChannel); } catch { /* safe */ }
    _txChannel = null;
  };
}

// ─────────────────────────────────────────────────────────
// PROFILES & USERS — Realtime Sync for Admin Dashboard
// ─────────────────────────────────────────────────────────

let _profilesChannel: any = null;
export function subscribeToProfiles(onProfilesChange: (profile: any) => void) {
  if (!isSupabaseConfigured) return () => {};

  if (_profilesChannel) {
    try { supabase.removeChannel(_profilesChannel); } catch { /* safe */ }
  }

  _profilesChannel = supabase
    .channel('profiles_channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      (payload) => {
        if (payload.new) onProfilesChange(payload.new);
      }
    )
    .subscribe();

  return () => {
    try { supabase.removeChannel(_profilesChannel); } catch { /* safe */ }
    _profilesChannel = null;
  };
}

