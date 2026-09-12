/**
 * SKY-BIRD CRASH ENGINE — Persistent Worker
 *
 * Calls public.tick_game_engine() on PostgreSQL every ENGINE_TICK_MS.
 * Uses a pg_try_advisory_lock so multiple accidental instances are safe.
 *
 * Required env vars:
 *   DATABASE_URL   — PostgreSQL connection string (NEVER expose in frontend)
 *   ENGINE_TICK_MS — Interval in ms (default 250)
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const TICK_MS = Number(process.env.ENGINE_TICK_MS ?? 250);
const ADVISORY_KEY = 0x534b5942; // 'SKYB' hex

if (!DATABASE_URL) {
  console.error('[SKYBIRD ENGINE] FATAL: DATABASE_URL is not set. Exiting.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: { rejectUnauthorized: false }
});

let running = true;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 20;

async function tick() {
  const client = await pool.connect();
  try {
    // Advisory lock: garantir apenas uma instância financeiramente ativa
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [ADVISORY_KEY]
    );
    const locked = lockResult.rows[0]?.locked;

    if (!locked) {
      // Outra instância está ativa — modo passivo
      return;
    }

    try {
      const result = await client.query('SELECT public.tick_game_engine() AS result');
      const action = result.rows[0]?.result?.action ?? result.rows[0]?.result;
      consecutiveErrors = 0;

      // Log apenas em transições de estado (não em cada tick)
      if (action && action !== 'running' && action !== 'waiting' && action !== 'waiting_after_crash') {
        console.log(`[SKYBIRD ENGINE] ${new Date().toISOString()} — ${JSON.stringify(result.rows[0]?.result)}`);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_KEY]);
    }
  } catch (err: any) {
    consecutiveErrors++;
    console.error(`[SKYBIRD ENGINE] tick error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err?.message ?? err);

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error('[SKYBIRD ENGINE] Demasiados erros consecutivos. Encerrando.');
      process.exit(1);
    }
  } finally {
    client.release();
  }
}

async function loop() {
  console.log(`[SKYBIRD ENGINE] Iniciado. Tick: ${TICK_MS}ms | ${new Date().toISOString()}`);

  while (running) {
    const start = Date.now();
    await tick();
    const elapsed = Date.now() - start;
    const delay = Math.max(0, TICK_MS - elapsed);
    await new Promise(r => setTimeout(r, delay));
  }

  await pool.end();
  console.log('[SKYBIRD ENGINE] Encerrado.');
}

process.on('SIGTERM', () => { running = false; });
process.on('SIGINT',  () => { running = false; });

loop().catch(err => {
  console.error('[SKYBIRD ENGINE] Fatal loop error:', err);
  process.exit(1);
});
