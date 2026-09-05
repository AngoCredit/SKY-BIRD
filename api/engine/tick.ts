import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from 'pg';

const LOCK_KEY = 20260905;

function isAuthorized(req: VercelRequest): boolean {
  const expected = process.env.ENGINE_CRON_SECRET;
  if (!expected) return false;

  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const cronSecret = req.headers['x-engine-secret'];
  const supplied = token ?? (Array.isArray(cronSecret) ? cronSecret[0] : cronSecret);

  return supplied === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ error: 'DATABASE_URL is not configured' });
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    const lock = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [LOCK_KEY],
    );

    if (!lock.rows[0]?.locked) {
      return res.status(200).json({ ok: true, skipped: 'engine_lock_held' });
    }

    try {
      const result = await client.query<{ tick: unknown }>(
        'SELECT public.tick_game_engine() AS tick',
      );

      return res.status(200).json({ ok: true, tick: result.rows[0]?.tick ?? null });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } catch (error) {
    console.error('[SKYBIRD VERCEL ENGINE] tick failed:', error);
    return res.status(500).json({ error: 'engine_tick_failed' });
  } finally {
    await client.end().catch(() => undefined);
  }
}
