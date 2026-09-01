# DATABASE ARCHITECTURE — SKYBIRD 3D CRASH GAME

**Versão:** 2.0 — Server-Authoritative  
**Data:** 30 de Agosto de 2026  

---

## 1. Stack de Tecnologia

| Componente | Tecnologia |
|---|---|
| Base de Dados | PostgreSQL 15 via Supabase |
| Auth | Supabase Auth (JWT) |
| Realtime | Supabase Realtime (Postgres Changes) |
| Storage | Supabase Storage (bucket privado `kyc-documents`) |
| RPCs | PL/pgSQL SECURITY DEFINER |
| Frontend | React + TypeScript (Vite) |

---

## 2. Tabelas e Relações

```
auth.users (Supabase gerido)
    │
    ├── [trigger] on_auth_user_created
    │       ↓
    ├── public.profiles (1:1 com auth.users)
    │       id, name, email, avatar_url, role, status, is_verified
    │
    └── public.wallets (1:1 com auth.users)
            user_id, available_balance, locked_balance, currency

public.game_rounds
    │   id, round_number, status, crash_point (oculto até CRASHED)
    │   server_seed (oculto até CRASHED), server_seed_hash (público)
    │   client_seed, nonce, total_bets_amount, total_payout_amount
    │
    └── public.bets (N:1 com game_rounds)
            id, round_id, user_id, amount, panel_id
            status: active | cashed_out | crashed
            UNIQUE(user_id, round_id, panel_id)

public.transactions (Ledger financeiro)
    user_id, type, amount, currency
    balance_before, balance_after, reference, status

public.kyc_verifications
    user_id, document_front_path, selfie_path
    airtm_account, whatsapp_number, status

public.support_messages
    conversation_id, sender_id, sender_role, text

public.admin_settings (id = 1)
    game_enabled, min_bet, max_bet, max_payout
    global_rtp, house_edge, support_status
```

---

## 3. RLS Policies por Tabela

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `wallets` | Próprio utilizador + Admin | ❌ Trigger only | ❌ RPC only | ❌ |
| `bets` | Próprio utilizador + Admin | ❌ RPC only | ❌ RPC only | ❌ |
| `transactions` | Próprio utilizador + Admin | ❌ RPC only | ❌ RPC only | ❌ |
| `game_rounds` | Público (hash pública) | ❌ RPC only | ❌ RPC only | ❌ |
| `profiles` | Próprio utilizador + Admin | Trigger only | Próprio utilizador | ❌ |
| `kyc_verifications` | Próprio utilizador + Admin | Próprio utilizador | ❌ Admin only | ❌ |
| `support_messages` | Conversa própria + Admin | sender_id = auth.uid() | ❌ | ❌ |

---

## 4. RPCs (Stored Procedures)

### `public.place_bet(p_round_id, p_amount, p_panel_id, p_auto_cashout)`
- **Segurança:** SECURITY DEFINER, nunca aceita user_id do frontend
- **Atomicidade:** SELECT FOR UPDATE na wallet + INSERT bet + INSERT transaction
- **Validações:** auth, rodada aberta, limites min/max, saldo, aposta duplicada
- **Retorna:** JSON com bet_id, balance_after (nunca crash_point)

### `public.cashout_bet(p_bet_id, p_multiplier)`
- **Segurança:** SECURITY DEFINER, valida bet pertence ao auth.uid()
- **Atomicidade:** SELECT FOR UPDATE na bet + UPDATE wallet + INSERT transaction
- **Payout:** Calculado 100% no PostgreSQL com `ROUND(..., 2)`
- **Anti-fraude:** Rejeita se multiplier > crash_point real ou se bet está crashed

### `public.create_next_round()`
- **Segurança:** SECURITY DEFINER
- **Seed:** `gen_random_bytes(32)` → hex → SHA-256 no PostgreSQL
- **Crash Point:** Calculado com `digest(combined, 'sha256')` — mesmo algoritmo do `provablyFair.ts`
- **Retorna:** round_id, server_seed_hash (nunca server_seed ou crash_point)

### `public.reveal_round_seed(p_round_id)`
- Revela server_seed apenas se status = CRASHED ou FINISHED
- Permite verificação Provably Fair pelo utilizador

### `public.handle_new_user()` (TRIGGER)
- Criado via `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users`
- Cria automaticamente profiles + wallets com ON CONFLICT DO NOTHING

---

## 5. Fluxo de uma Rodada

```
PostgreSQL: create_next_round()
    → server_seed (secret), server_seed_hash (public), crash_point (secret)
    → status = WAITING

Frontend recebe: round_id, round_number, server_seed_hash (apenas)

Jogador: place_bet(round_id, amount, panel_id)
    → PostgreSQL valida tudo atomicamente
    → Debita wallet via FOR UPDATE
    → Cria bet, cria transaction
    → Retorna bet_id, balance_after

status → RUNNING (controlado pelo servidor)

Jogador: cashout_bet(bet_id, multiplier)
    → PostgreSQL valida multiplier < crash_point real
    → Calcula payout = ROUND(amount * multiplier, 2)
    → Credita wallet
    → Marca bet como cashed_out
    → Retorna payout (calculado server-side)

status → CRASHED
    → reveal_round_seed(round_id) → expõe server_seed
    → Verificação Provably Fair disponível
```

---

## 6. Realtime

| Canal | Evento | Consumidor |
|---|---|---|
| `wallet:{userId}` | UPDATE em `wallets` | Frontend actualiza saldo |
| `game_rounds_current` | * em `game_rounds` | Frontend actualiza estado da rodada |
| `bets:{roundId}` | * em `bets` | Frontend actualiza apostas activas |
| `admin-settings-channel` | * em `admin_settings` | Store actualiza configurações |
