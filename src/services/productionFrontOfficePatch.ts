import { getAuthoritativeRound, getVisualMultiplier } from './authoritativeGame';

/**
 * Production front-office guard.
 *
 * The landing page historically contained a local 10-second visual/demo ticker.
 * In production that must never look like the real game state. This patch
 * replaces that isolated widget at runtime with a read-only view of the
 * authoritative Supabase/PostgreSQL round.
 */
const AUTHORITATIVE_ROOT_ID = 'skybird-authoritative-landing-round';
const POLL_MS = 500;

function isProduction() {
  return Boolean(import.meta.env.PROD);
}

function formatMultiplier(value: number) {
  return `${value.toFixed(2)}x`;
}

function findLegacyTicker(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll('button'));
  const cta = buttons.find((button) =>
    button.textContent?.toUpperCase().includes('ENTRAR NA RODADA REAL'),
  );
  if (!cta) return null;

  let node: HTMLElement | null = cta;
  for (let i = 0; i < 5 && node; i += 1) {
    const text = node.textContent?.toUpperCase() || '';
    if (text.includes('HISTÓRICO DE RODADAS') || text.includes('VOO EM TEMPO REAL')) {
      return node;
    }
    node = node.parentElement;
  }
  return cta.parentElement;
}

function ensureAuthoritativePanel(legacy: HTMLElement) {
  const existing = document.getElementById(AUTHORITATIVE_ROOT_ID);
  if (existing) return existing;

  const panel = document.createElement('div');
  panel.id = AUTHORITATIVE_ROOT_ID;
  panel.className = legacy.className;
  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div>
          <div style="font-size:10px;font-family:monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:.14em">RODADA OFICIAL</div>
          <div data-role="status" style="font-size:12px;color:#94a3b8;margin-top:4px">A sincronizar com o servidor…</div>
        </div>
        <div data-role="multiplier" style="font-family:monospace;font-size:30px;font-weight:900;color:#22d3ee">—</div>
      </div>
      <div data-role="commitment" style="font-family:monospace;font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Resultado protegido pelo servidor</div>
    </div>
  `;

  legacy.replaceWith(panel);
  return panel;
}

async function refresh(panel: HTMLElement) {
  try {
    const round = await getAuthoritativeRound();
    if (!round) return;

    const status = panel.querySelector<HTMLElement>('[data-role="status"]');
    const multiplier = panel.querySelector<HTMLElement>('[data-role="multiplier"]');
    const commitment = panel.querySelector<HTMLElement>('[data-role="commitment"]');

    if (status) status.textContent = round.status === 'RUNNING'
      ? 'RODADA AO VIVO — servidor'
      : round.status === 'CRASHED'
        ? 'RODADA ENCERRADA — servidor'
        : 'AGUARDANDO PRÓXIMA RODADA — servidor';

    if (multiplier) {
      multiplier.textContent = formatMultiplier(
        round.status === 'RUNNING' ? getVisualMultiplier(round) : Number(round.crashPoint || 1),
      );
      multiplier.style.color = round.status === 'CRASHED' ? '#fb7185' : '#22d3ee';
    }

    if (commitment) {
      commitment.textContent = round.commitment
        ? `Commitment SHA-256: ${round.commitment}`
        : 'Commitment protegido pelo servidor';
    }
  } catch (error) {
    console.warn('[SKY-BIRD Front Office] authoritative round unavailable', error);
  }
}

function boot() {
  if (!isProduction()) return;

  let activePanel: HTMLElement | null = null;
  let timer: number | null = null;

  const mount = () => {
    if (activePanel?.isConnected) return;
    const legacy = findLegacyTicker();
    if (!legacy) return;
    activePanel = ensureAuthoritativePanel(legacy);
    void refresh(activePanel);
    timer = window.setInterval(() => {
      if (!activePanel?.isConnected) return;
      void refresh(activePanel);
    }, POLL_MS);
  };

  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  mount();

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    if (timer !== null) window.clearInterval(timer);
  }, { once: true });
}

boot();
