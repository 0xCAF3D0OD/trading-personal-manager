#!/usr/bin/env node
/**
 * Connecteur MCP local (docs/05, B.3). Lancé par l'application de bureau Claude en stdio.
 * Lecture seule : quatre outils qui interrogent l'API locale de la plateforme. Aucune clé, aucun secret :
 * c'est l'abonnement Claude de l'utilisateur qui lit le dossier et écrit le rapport.
 *
 * Variables : TPM_API_URL (défaut http://localhost:3000/api ; avec Docker, http://localhost:8080/api).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = (process.env.TPM_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');

interface Envelope<T> { data: T; meta?: { degraded?: { provider: string; reason: string }[] } }
interface TokenItem { id: number; symbol: string | null; name: string | null; address: string; priceUsd: number | null; priceChange24hPct: number | null; ageDays: number | null }
interface Summary { answers: { id: string; question: string; short: string; answer: string; state: string }[] }
interface ScanResult { tokenSymbol: string | null; tokenName: string | null; tokenAddress: string; flagCount: number; unverifiedCount: number; structuralPassed: number | null; structuralTotal: number | null; metrics: { ageHours: number | null; pctH24: number | null; liquidityUsd: number | null; capUsd: number | null; mcapIsFdv: boolean }; venues: { name: string; kind: string; isKraken: boolean }[]; venuesNote: string | null; flags: { label: string; raised: boolean; verified: boolean }[] }
interface AlertEvent { tokenSymbol: string | null; type: string; firedAt: number; ruleText: string; acknowledgedAt: number | null }

async function get<T>(path: string): Promise<Envelope<T>> {
  const res = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`API ${res.status} sur ${path} : la plateforme tourne-t-elle (${API}) ?`);
  return (await res.json()) as Envelope<T>;
}
async function getText(path: string): Promise<string> {
  const res = await fetch(`${API}${path}`, { headers: { accept: 'text/markdown' } });
  if (!res.ok) throw new Error(`API ${res.status} sur ${path}`);
  return res.text();
}
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const date = (ts: number) => new Date(ts * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const usd = (v: number | null) => (v === null || !Number.isFinite(v) ? 'inconnu' : Math.abs(v) >= 1000 ? `${new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 }).format(v)} $` : Math.abs(v) >= 1 ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)} $` : v === 0 ? '0 $' : `${new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 4 }).format(v)} $`);
const pct = (v: number | null) => (v === null ? 'inconnu' : `${v > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)} %`);

async function resolveToken(query: string): Promise<TokenItem> {
  const list = (await get<TokenItem[]>('/tokens')).data;
  const q = query.trim().toLowerCase();
  const found = list.find((t) => t.address.toLowerCase() === q) ?? list.find((t) => (t.symbol ?? '').toLowerCase() === q) ?? list.find((t) => (t.name ?? '').toLowerCase() === q) ?? list.find((t) => (t.symbol ?? '').toLowerCase().includes(q));
  if (!found) throw new Error(`Token « ${query} » introuvable dans la liste de surveillance. Tokens connus : ${list.map((t) => t.symbol ?? t.address.slice(0, 8)).join(', ') || 'aucun'}.`);
  return found;
}

const server = new McpServer({ name: 'trading-personal-manager', version: '0.1.0' });

server.registerTool('list_tokens', {
  title: 'Liste de surveillance',
  description: 'Les tokens surveillés avec, pour chacun, les cinq réponses courtes (piège, sortie, détenteurs, équipe, marché). Aucune recommandation.',
  inputSchema: {},
}, async () => {
  const [tokens, summaries] = await Promise.all([get<TokenItem[]>('/tokens'), get<Record<number, Summary>>('/tokens/summaries')]);
  if (!tokens.data.length) return text('Aucun token surveillé.');
  const lines = tokens.data.map((t) => {
    const s = summaries.data[t.id];
    const five = s ? s.answers.map((a) => `${a.question.replace(' ?', '')} : ${a.short}`).join(' · ') : 'synthèse indisponible';
    return `- ${t.symbol ?? t.address.slice(0, 8)}${t.name ? ` (${t.name})` : ''} · ${t.address} · prix ${usd(t.priceUsd)} · 24 h ${pct(t.priceChange24hPct)} · âge ${t.ageDays === null ? 'inconnu' : `${t.ageDays} j`}\n  ${five}`;
  });
  const degraded = tokens.meta?.degraded?.length ? `\n\nSources dégradées : ${tokens.meta.degraded.map((d) => `${d.provider} (${d.reason})`).join(' ; ')}.` : '';
  return text(`${lines.join('\n')}${degraded}`);
});

server.registerTool('get_dossier', {
  title: 'Dossier d’un token',
  description: 'Le dossier complet d’un token surveillé (identité, cinq questions, santé, marché, offre, détenteurs, équipe, veille, divergences, glossaire), en Markdown, avec la consigne de rédaction en tête. Le token se désigne par son symbole, son nom ou son adresse de mint.',
  inputSchema: { token: z.string().min(1).describe('Symbole, nom ou adresse de mint du token'), include_plan: z.boolean().optional().describe('Inclure le plan du journal de discipline (personnel ; exclu par défaut)') },
}, async ({ token, include_plan }) => {
  const t = await resolveToken(token);
  const md = await getText(`/tokens/${t.id}/dossier?format=md${include_plan === undefined ? '' : `&plan=${include_plan ? '1' : '0'}`}`);
  return text(md);
});

server.registerTool('get_alerts', {
  title: 'Alertes récentes',
  description: 'Les alertes déclenchées par la plateforme sur les derniers jours (prix, liquidité, divergences, veille, scanner).',
  inputSchema: { days: z.number().int().min(1).max(90).optional().describe('Fenêtre en jours, 7 par défaut') },
}, async ({ days }) => {
  const d = days ?? 7;
  const since = Math.floor(Date.now() / 1000) - d * 86400;
  const events = (await get<AlertEvent[]>('/alerts/events?limit=200')).data.filter((e) => e.firedAt >= since);
  if (!events.length) return text(`Aucune alerte sur ${d} jour(s).`);
  return text(events.map((e) => `- ${date(e.firedAt)} · ${e.tokenSymbol ?? '?'} · ${e.type}${e.acknowledgedAt ? ' · vue' : ''}\n  ${e.ruleText}`).join('\n'));
});

server.registerTool('get_scanner_results', {
  title: 'Résultats du scanner',
  description: 'Les nouveaux tokens Solana gardés par le scanner (+100 % sur 24 h, cinq filtres structurels), avec leurs drapeaux et les plateformes où ils s’échangent. Le scanner élimine, il ne promeut pas.',
  inputSchema: { days: z.number().int().min(1).max(30).optional().describe('Fenêtre en jours, 1 par défaut') },
}, async ({ days }) => {
  const d = days ?? 1;
  const rows = (await get<ScanResult[]>(`/scanner/results?days=${d}`)).data;
  if (!rows.length) return text(`Aucun token n’a passé les filtres sur ${d} jour(s). C’est le cas la plupart du temps.`);
  return text(rows.map((r) => {
    const age = r.metrics.ageHours === null ? 'âge inconnu' : r.metrics.ageHours < 48 ? `${Math.round(r.metrics.ageHours)} h` : `${Math.round(r.metrics.ageHours / 24)} j`;
    const flags = r.flags.filter((f) => f.raised).map((f) => f.label).join(', ') || 'aucun';
    const unverified = r.flags.filter((f) => !f.verified).map((f) => f.label).join(', ');
    const venues = r.venues.map((v) => `${v.name}${v.isKraken ? ' (Kraken)' : ''}`).join(', ') || 'aucune connue';
    return `- ${r.tokenSymbol ?? r.tokenAddress.slice(0, 8)}${r.tokenName ? ` (${r.tokenName})` : ''} · ${r.tokenAddress}\n  âge ${age} · 24 h ${pct(r.metrics.pctH24)} · liquidité ${usd(r.metrics.liquidityUsd)} · capitalisation ${usd(r.metrics.capUsd)}${r.metrics.mcapIsFdv ? ' (FDV, non vérifiée)' : ''} · filtres ${r.structuralPassed ?? '?'}/${r.structuralTotal ?? '?'}\n  drapeaux levés : ${flags}${unverified ? ` · non vérifiés : ${unverified}` : ''}\n  où l’acheter : ${venues}${r.venuesNote ? ` (${r.venuesNote})` : ''}`;
  }).join('\n'));
});

const transport = new StdioServerTransport();
await server.connect(transport);
