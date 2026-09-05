import { createClient } from '@supabase/supabase-js';

// Project ID: efriqgvjtyxwqovobggq
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://efriqgvjtyxwqovobggq.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.warn(
    '[Skybird] Anon key do Supabase não configurada.\n' +
    'Adicione VITE_SUPABASE_ANON_KEY ao ficheiro .env\n' +
    'Vá em: Supabase Dashboard → Project Settings → API → anon public'
  );
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