import { createClient } from '@supabase/supabase-js';

// Project ID: efriqgvjtyxwqovobggq
// URL derived from the PostgreSQL connection string provided
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

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || 'placeholder-key'
);
