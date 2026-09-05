-- SKY-BIRD — authoritative game flow helpers
-- Browser may request/read public game state, but financial mutations remain server-side.

create or replace function public.get_current_round()
returns table (
  id text,
  round_number bigint,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  server_seed_hash text,
  client_seed text,
  nonce bigint,
  total_bet_amount numeric,
  total_payout_amount numeric,
  crash_point numeric
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    gr.id,
    gr.round_number,
    gr.status,
    gr.started_at,
    gr.ended_at,
    gr.server_seed_hash,
    gr.client_seed,
    gr.nonce,
    gr.total_bet_amount,
    gr.total_payout_amount,
    case
      when gr.status in ('CRASHED', 'SETTLED') then gr.crash_point
      else null
    end as crash_point
  from public.game_rounds gr
  where gr.status in ('WAITING', 'COUNTDOWN', 'RUNNING', 'CRASHED', 'SETTLED')
  order by gr.round_number desc
  limit 1;
$$;

revoke execute on function public.get_current_round() from public, anon;
grant execute on function public.get_current_round() to authenticated;

-- Public bet feed: never expose user_id or financial balance information.
-- The caller only receives sanitized activity for the current round.
create or replace function public.get_public_round_bets(p_round_id text)
returns table (
  id text,
  round_id text,
  amount numeric,
  auto_cashout_multiplier numeric,
  cashout_multiplier numeric,
  payout numeric,
  status text,
  panel_id integer,
  is_current_user boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    b.id::text,
    b.round_id,
    b.amount,
    b.auto_cashout_multiplier,
    b.cashout_multiplier,
    b.payout,
    b.status,
    b.panel_id,
    (b.user_id = (select auth.uid())) as is_current_user,
    b.created_at
  from public.bets b
  where b.round_id = p_round_id
    and b.is_bot = false
  order by b.created_at asc;
$$;

revoke execute on function public.get_public_round_bets(text) from public, anon;
grant execute on function public.get_public_round_bets(text) to authenticated;

-- Atomic player cancellation. Only WAITING/COUNTDOWN bets can be cancelled.
-- The wallet and bet rows are locked in the same transaction to prevent races.
create or replace function public.cancel_bet(p_bet_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bet public.bets%rowtype;
  v_wallet public.wallets%rowtype;
  v_before numeric;
  v_after numeric;
  v_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into v_bet
  from public.bets
  where id::text = p_bet_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'BET_NOT_FOUND';
  end if;

  if v_bet.status not in ('active', 'pending', 'placed') then
    raise exception 'BET_NOT_CANCELLABLE';
  end if;

  if not exists (
    select 1
    from public.game_rounds gr
    where gr.id = v_bet.round_id
      and gr.status in ('WAITING', 'COUNTDOWN')
    for update
  ) then
    raise exception 'ROUND_ALREADY_STARTED';
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = v_uid
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_before := v_wallet.available_balance;
  v_after := v_before + v_bet.amount;

  update public.wallets
  set available_balance = v_after,
      updated_at = clock_timestamp()
  where user_id = v_uid;

  update public.bets
  set status = 'cancelled',
      payout = 0,
      updated_at = clock_timestamp()
  where id = v_bet.id;

  insert into public.transactions (
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    status,
    description,
    created_at
  ) values (
    v_uid,
    'bet_cancelled',
    v_bet.amount,
    v_before,
    v_after,
    'completed',
    'Bet cancelled before round start',
    clock_timestamp()
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'success', true,
    'bet_id', v_bet.id::text,
    'transaction_id', v_tx_id::text,
    'balance_before', v_before,
    'balance_after', v_after
  );
end;
$$;

revoke execute on function public.cancel_bet(text) from public, anon;
grant execute on function public.cancel_bet(text) to authenticated;

-- Financial writes must remain RPC-only.
revoke insert, update, delete on public.wallets from anon, authenticated;
revoke insert, update, delete on public.bets from anon, authenticated;
revoke insert, update, delete on public.game_rounds from anon, authenticated;

comment on function public.get_current_round() is 'Safe public round state; never exposes server_seed and only reveals crash_point after crash.';
comment on function public.get_public_round_bets(text) is 'Sanitized round bet feed; never exposes user_id.';
comment on function public.cancel_bet(text) is 'Atomic server-side bet cancellation before round start.';
