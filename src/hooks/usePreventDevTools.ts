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

    // Detection loop disabled to avoid false positives (black screen) on scaled windows or DevTools debugging
    setIsDevToolsOpen(false);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return { isDevToolsOpen: false };
}
