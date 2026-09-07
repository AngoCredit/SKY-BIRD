import { createClient } from '@supabase/supabase-js';

// Project ID: efriqgvjtyxwqovobggq
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://efriqgvjtyxwqovobggq.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const IS_PRODUCTION_BUILD = Boolean(import.meta.env.PROD);

// Production must fail closed: authentication and financial flows must never
// silently fall back to local/demo state when the Supabase client key is absent.
export const isSupabaseConfigured = Boolean(SUPABASE_ANON_KEY) || IS_PRODUCTION_BUILD;

if (!SUPABASE_ANON_KEY) {
  const message =
    '[Skybird] VITE_SUPABASE_ANON_KEY não está disponível nesta build. ' +
    'O acesso ao Supabase será rejeitado em vez de usar dados locais.';

  if (IS_PRODUCTION_BUILD) {
    console.error(message);
  } else {
    console.warn(message);
  }
}

/**
 * Prevent auth/profile requests from leaving the UI permanently stuck in a
 * loading state when the browser loses connectivity or an upstream request
 * never completes. The caller can still handle the timeout as a normal error.
 */
const REQUEST_TIMEOUT_MS = 12000;

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || 'placeholder-key',
  {
    global: {
      fetch: fetchWithTimeout,
    },
  }
);