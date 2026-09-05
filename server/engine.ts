import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const TICK_MS = Math.max(100, Number(process.env.ENGINE_TICK_MS ?? 250));
const LOCK_KEY = 20260905;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the SKY-BIRD engine worker.');
}

let client: Client | null = null;
let stopping = false;

async function connect(): Promise<Client> {
  const next = new Client({
    connectionString: DATABASE_URL,
  });

  await next.connect();
  await next.query('SELECT 1');
  client = next;
  console.info(`[SKYBIRD ENGINE] connected; tick=${TICK_MS}ms`);
  return next;
}

async function closeClient() {
  const current = client;
  client = null;

  if (!current) return;

  try {
    await current.end();
  } catch {
    // Ignore shutdown/reconnect errors.
  }
}

async function tick() {
  const current = client ?? await connect();

  // A second worker instance must never execute the financial/game tick concurrently.
  const lock = await current.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [LOCK_KEY]
  );

  if (!lock.rows[0]?.locked) return;

  try {
    const result = await current.query<{ tick: unknown }>(
      'SELECT public.tick_game_engine() AS tick'
    );

    console.debug('[SKYBIRD ENGINE]', result.rows[0]?.tick ?? null);
  } finally {
    await current.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
  }
}

async function run() {
  await connect();

  while (!stopping) {
    const started = Date.now();

    try {
      await tick();
    } catch (error) {
      console.error('[SKYBIRD ENGINE] tick failed:', error);
      await closeClient();

      if (!stopping) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await connect();
        } catch (reconnectError) {
          console.error('[SKYBIRD ENGINE] reconnect failed:', reconnectError);
        }
      }
    }

    const elapsed = Date.now() - started;
    const delay = Math.max(0, TICK_MS - elapsed);

    if (!stopping && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`[SKYBIRD ENGINE] ${signal}; shutting down`);
  await closeClient();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void run().catch(async (error) => {
  console.error('[SKYBIRD ENGINE] fatal error:', error);
  await closeClient();
  process.exit(1);
});
