const fr = new Intl.NumberFormat('fr-FR');
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 });

export function fmtUsd(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (opts.compact) return `${compact.format(v)} $`;
  const abs = Math.abs(v);
  if (abs >= 1) return `${fr.format(Number(v.toFixed(2)))} $`;
  if (abs >= 0.01) return `${v.toFixed(4)} $`;
  if (abs === 0) return '0 $';
  return `${v.toPrecision(4)} $`;
}

export function fmtNum(v: number | null | undefined, opts: { compact?: boolean; digits?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (opts.compact) return compact.format(v);
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: opts.digits ?? 2 }).format(v);
}

export function fmtPct(v: number | null | undefined, opts: { signed?: boolean; digits?: number } = { signed: true }): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  // Même convention que les phrases du serveur : virgule décimale.
  const d = opts.digits ?? 2;
  const s = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  return `${opts.signed && v > 0 ? '+' : ''}${s} %`;
}

export function fmtDate(ts: number | null | undefined, withTime = true): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return withTime ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('fr-FR');
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export function shortAddr(a: string | null | undefined, n = 4): string {
  if (!a) return '—';
  return a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
}

export function pctClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return v > 0 ? 'up' : v < 0 ? 'down' : '';
}

export const SOURCE_LABEL: Record<string, string> = {
  rpc: 'RPC Solana', helius: 'Helius', dexscreener: 'DexScreener', jupiter: 'Jupiter', rugcheck: 'RugCheck',
  solscan: 'Solscan', geckoterminal: 'GeckoTerminal', coingecko: 'CoinGecko', kraken: 'Kraken', local: 'Base locale', unavailable: 'Indisponible',
};
