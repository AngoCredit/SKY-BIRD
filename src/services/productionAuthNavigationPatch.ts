/**
 * Production auth compatibility layer.
 *
 * Supabase recommends keeping onAuthStateChange callbacks synchronous because
 * async Supabase calls made inside the callback can deadlock the auth client.
 * This wrapper defers every application callback to the next macrotask.
 *
 * The navigation handler itself then resolves the profile outside the auth
 * callback and routes authenticated players to #game.
 */
import { supabase, isSupabaseConfigured } from './supabase';

if (isSupabaseConfigured) {
  const authClient = supabase.auth as any;
  const originalOnAuthStateChange = authClient.onAuthStateChange.bind(authClient);

  if (!authClient.__skybirdDeferredAuthCallbacks) {
    authClient.__skybirdDeferredAuthCallbacks = true;
    authClient.onAuthStateChange = (callback: any) =>
      originalOnAuthStateChange((event: any, session: any) => {
        window.setTimeout(() => {
          try {
            callback(event, session);
          } catch (error) {
            console.error('[Auth callback]', error);
          }
        }, 0);
      });
  }

  // Register only after the wrapper is installed.
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session?.user) return;
    if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;

    window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_profile');
        if (error) {
          console.warn('[Auth Navigation] Profile lookup failed:', error.message);
          return;
        }

        const profile = Array.isArray(data) ? data[0] : data;
        if (!profile || profile.status !== 'active') return;

        if (profile.role === 'admin') {
          if (window.location.hash.toLowerCase() === '#admin-login') {
            window.location.hash = '#admin';
          }
          return;
        }

        localStorage.setItem('skybird_current_view', 'game');
        window.location.hash = '#game';
      } catch (error) {
        console.warn('[Auth Navigation] Could not resolve authenticated route:', error);
      }
    }, 0);
  });
}
