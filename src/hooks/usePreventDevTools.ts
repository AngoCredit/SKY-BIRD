import { useState, useEffect } from 'react';

/**
 * Detects DevTools open state via window dimension delta technique.
 * Uses only the reliable size-differential method to avoid false positives
 * on slow devices, mobile browsers, or with browser extensions installed.
 *
 * Returns { isDevToolsOpen } so the caller can render a blocker overlay.
 */
export function usePreventDevTools() {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);

  useEffect(() => {
    // ── Keyboard / context-menu prevention ──────────────────────────────────
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.keyCode === 123) { e.preventDefault(); return false; }
      // Ctrl+Shift+I/J/C  |  Cmd+Opt+I/J/C
      if ((e.ctrlKey || e.metaKey) && e.shiftKey &&
          [73, 74, 67].includes(e.keyCode)) { e.preventDefault(); return false; }
      // Ctrl+U  (view-source)
      if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; }
      // Ctrl+S  (save page)
      if (e.ctrlKey && e.keyCode === 83) { e.preventDefault(); return false; }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    // ── Detection loop (dimension-delta only — no debugger timing) ───────────
    // The `debugger` timing technique is NOT used here because on slower
    // devices, mobile browsers, or when browser extensions (password managers,
    // Grammarly, etc.) are active, JavaScript execution can naturally exceed
    // 100ms, causing false positives that freeze the screen for real players.
    const THRESHOLD = 200; // px — generous threshold to avoid false positives

    let open = false;
    let consecutiveOpenCount = 0; // require 2 consecutive detections to confirm

    const setOpen = (val: boolean) => {
      if (val !== open) {
        open = val;
        setIsDevToolsOpen(val);
        if (val) {
          console.clear();
          console.log(
            '%c⛔ ACESSO RESTRITO',
            'color:#ef4444;font-size:28px;font-weight:bold;'
          );
          console.log(
            '%cEsta plataforma não permite inspeção de código.',
            'color:#f97316;font-size:14px;'
          );
        }
      }
    };

    const checkDimensions = () => {
      const wDiff = window.outerWidth  - window.innerWidth;
      const hDiff = window.outerHeight - window.innerHeight;
      return wDiff > THRESHOLD || hDiff > THRESHOLD;
    };

    const tick = () => {
      if (checkDimensions()) {
        consecutiveOpenCount++;
        // Only trigger after 2 consecutive detections (avoids brief resize glitches)
        if (consecutiveOpenCount >= 2) setOpen(true);
      } else {
        consecutiveOpenCount = 0;
        setOpen(false);
      }
    };

    // Poll every 1.5s (less CPU pressure, still responsive)
    const intervalId = setInterval(tick, 1500);

    // Also fire on resize (catches dock/undock)
    window.addEventListener('resize', tick);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', tick);
      clearInterval(intervalId);
    };
  }, []);

  return { isDevToolsOpen };
}
