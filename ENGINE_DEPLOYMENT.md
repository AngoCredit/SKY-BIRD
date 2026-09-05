# SKY-BIRD — Persistent Crash Engine

O frontend Vercel não deve ser responsável pelo relógio financeiro do jogo. O worker em `server/engine.ts` mantém um processo persistente que chama `public.tick_game_engine()` no PostgreSQL e usa um advisory lock para impedir duas instâncias de executarem o tick financeiro ao mesmo tempo.

## Variáveis obrigatórias

```text
DATABASE_URL=<PostgreSQL connection string>
ENGINE_TICK_MS=250
```

`DATABASE_URL` é **server-side only**. Nunca colocar esta variável em `VITE_*`, no browser, no Git ou em ficheiros `.env` versionados.

## Execução

```bash
npm ci
npm run engine
```

O processo deve permanecer sempre ativo. Se terminar, o supervisor da plataforma deve reiniciá-lo.

## Deploy recomendado

Use um serviço de worker persistente (Railway, Render, Fly.io, VPS ou equivalente) separado do frontend Vercel.

- Build: `npm ci`
- Start: `npm run engine`
- Health/observabilidade: acompanhar os logs `[SKYBIRD ENGINE]`
- Replicas: **1** é o padrão recomendado. O advisory lock impede concorrência financeira acidental, mas não substitui uma estratégia de operação com uma única réplica.

## PostgreSQL / Supabase

A migration `20260905_server_round_engine.sql` mantém `tick_game_engine()` como função autoritativa. O worker não calcula crash point, payout ou saldo: apenas solicita o tick. A decisão continua no PostgreSQL.

O `server_seed` não deve ser enviado ao browser antes do reveal e o resultado financeiro não deve ser calculado no cliente.

## Importante antes do GO LIVE

1. Confirmar que o worker está efetivamente online e executando várias vezes por segundo.
2. Confirmar no PostgreSQL que os rounds avançam sem intervenção do browser.
3. Confirmar que auto-cashout e crash são liquidados pelo banco.
4. Remover/desativar o cron de fallback apenas depois de validar o worker persistente.
5. Executar testes de concorrência, double-spend, cashout depois do crash e idempotência.
