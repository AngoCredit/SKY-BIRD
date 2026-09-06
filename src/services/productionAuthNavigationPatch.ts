/**
 * Production auth navigation guard.
 * Supabase Auth is the source of truth; this patch only fixes post-login routing.
 */
import { supabase, isSupabaseConfigured } from './supabase';

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session?.user) return;
    if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;

    try {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) return;

      const profile = Array.isArray(data) ? data[0] : data;
      if (!profile || profile.status !== 'active') return;

      if (profile.role === 'admin') {
        // Admins use the dedicated console and are never routed to the player game.
        if (window.location.hash === '#admin-login') {
          window.location.hash = '#admin';
        }
        return;
      }

      // Authenticated players must never fall back to the landing page after login.
      localStorage.setItem('skybird_current_view', 'game');
      if (window.location.hash.toLowerCase() !== '#game') {
        window.location.hash = '#game';
      }
    } catch (error) {
      console.warn('[Auth Navigation] Could not resolve authenticated route:', error);
    }
  });
}
