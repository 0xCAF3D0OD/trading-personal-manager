import type {
  Claim, Divergence, HoldersView, MarketMetricsView, NewsItem, OnchainAction, PageChange, Plan, SupplyView, TokenHealth, TokenSummary,
} from '@tpm/shared';
import { AI_REPORT_PROMPT, AI_REPORT_PROMPT_VERSION, GLOSSARY } from '@tpm/shared';

/**
 * Le dossier (docs/05, B.2) : un texte Markdown, dans l'ordre de lecture, chaque valeur suivie de sa source et de sa date.
 * Fonction pure : elle ne sait rien du réseau ni de la base. Aucune clé, aucune adresse personnelle, le plan seulement sur demande.
 */
export interface DossierInputs {
  token: { symbol: string | null; name: string | null; address: string; program: string; decimals: number; createdAt: number | null; creatorAddress: string | null; addedAt: number };
  tier: string;
  /** Dernier passage de chaque tâche planifiée : ce que l'écran Système sait, le dossier doit le dire aussi. */
  jobs: { name: string; label: string; lastRunAt: number | null; status: string | null; error: string | null }[];
  degraded: { provider: string; reason: string; since: number }[];
  summary: TokenSummary;
  health: TokenHealth | null;
  market: MarketMetricsView | null;
  supply: SupplyView | null;
  holders: HoldersView | null;
  creator: { creatorAddress: string | null; available: boolean; activities: { ts: number; kind: string; description: string | null; amount: number | null; amountUsd: number | null }[] } | null;
  /** Sources déclarées dans la veille : sans site ni compte X, la section 8 ne couvre rien du projet lui-même. */
  watchSources: { kind: string; label: string; enabled: boolean }[];
  changes: PageChange[];
  claims: Claim[];
  news: NewsItem[];
  actions: OnchainAction[];
  divergences: Divergence[];
  plans: Plan[] | null;
  generatedAt: number;
}

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 });
const usd = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? 'inconnu' : Math.abs(v) >= 1000 ? `${compact.format(v)} $` : Math.abs(v) >= 1 ? `${fr.format(v)} $` : `${new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 4 }).format(v)} $`);
const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? 'inconnu' : compact.format(v));
const pct = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? 'inconnu' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v)} %`);
const date = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) : 'date inconnue');
const src = (source: string | null | undefined, ts?: number | null) => `(${source ?? 'source inconnue'}${ts ? `, ${date(ts)}` : ''})`;
const SOURCE_LABEL: Record<string, string> = { rpc: 'RPC Solana', helius: 'Helius', solscan: 'Solscan', dexscreener: 'DexScreener', jupiter: 'Jupiter', rugcheck: 'RugCheck', geckoterminal: 'GeckoTerminal', coingecko: 'CoinGecko', local: 'base locale', unavailable: 'indisponible' };
const S = (s: string | null | undefined) => SOURCE_LABEL[s ?? ''] ?? s ?? 'source inconnue';
const KIND: Record<string, string> = { transfer_out: 'transfert sortant', transfer_in: 'transfert entrant', swap_sell: 'vente', swap_buy: 'achat', burn: 'burn', lp_add: 'ajout de liquidité', lp_remove: 'retrait de liquidité', mint: 'émission', authority_change: 'changement d’autorité', other: 'autre' };
const CLAIM_STATUS: Record<string, string> = { pending: 'en attente', kept: 'tenu', contradicted: 'contredit', expired: 'expiré sans preuve' };

export function buildDossier(i: DossierInputs): string {
  const L: string[] = [];
  const t = i.token;
  const name = `${t.symbol ?? t.address.slice(0, 8)}${t.name && t.name !== t.symbol ? ` (${t.name})` : ''}`;
  L.push(`# Dossier : ${name}`, '', `> Consigne pour l'IA (version ${AI_REPORT_PROMPT_VERSION})`, ...AI_REPORT_PROMPT.split('\n').map((l) => `> ${l}`), '');

  L.push('## 1. Identité', '',
    `- Symbole : ${t.symbol ?? 'inconnu'} · Nom : ${t.name ?? 'inconnu'}`,
    `- Adresse du mint : \`${t.address}\``,
    `- Programme : ${t.program === 'token-2022' ? 'Token-2022' : 'SPL Token'} · ${t.decimals} décimales`,
    `- Création du token : ${date(t.createdAt)} · Suivi depuis : ${date(t.addedAt)}`,
    `- Créateur : ${t.creatorAddress ? `\`${t.creatorAddress}\`` : 'non identifiable dans les métadonnées'}`,
    `- Palier de sources actif : ${i.tier} (A : RPC public ; B : Helius ; C : Solscan)`, '');

  L.push('### État de l’outil au moment du dossier', '', 'Dernier passage de chaque tâche. Une tâche quotidienne dont le dernier passage réussi a plus de 24 h explique à elle seule un relevé ancien ou une divergence « non calculable ».', '');
  for (const j of i.jobs) {
    const ageH = j.lastRunAt ? Math.round((i.generatedAt - j.lastRunAt) / 3600) : null;
    L.push(`- ${j.label} : ${j.lastRunAt ? `${date(j.lastRunAt)} (il y a ${ageH} h)` : 'jamais exécutée'}${j.status && j.status !== 'ok' ? ` · dernier état : ${j.status}${j.error ? ` (${j.error.slice(0, 120)})` : ''}` : ''}`);
  }
  if (i.degraded.length) L.push(`- Sources dégradées : ${i.degraded.map((d) => `${d.provider} (${d.reason}${d.since ? `, depuis ${date(d.since)}` : ''})`).join(' ; ')}`);
  L.push('');

  L.push('## 2. Les cinq questions', '', 'Personne ne peut dire si ce token rapportera. Ces cinq questions disent ce qui peut faire perdre, et chacune est vérifiable.', '',
    'Les états (ok, warn, risk, partial, unknown) sont posés par l’outil, question par question, à partir de seuils réglables et affichés ; il n’existe pas de total et l’IA ne doit pas en produire. Chaque réponse porte la date de son relevé : elles ne forment pas un instantané.', '');
  const stamps = i.summary.answers.map((a) => a.fetchedAt).filter((t): t is number => !!t);
  if (stamps.length >= 2 && Math.max(...stamps) - Math.min(...stamps) > 3600) {
    L.push(`Relevés pris entre ${date(Math.min(...stamps))} et ${date(Math.max(...stamps))} : ${Math.round((Math.max(...stamps) - Math.min(...stamps)) / 3600)} h d’écart entre la réponse la plus ancienne et la plus récente.`, '');
  }
  i.summary.answers.forEach((a, k) => {
    const ageH = a.fetchedAt ? Math.round((i.generatedAt - a.fetchedAt) / 3600) : null;
    L.push(`### 2.${k + 1} ${a.question}`, '', `- À quoi ça sert : ${a.purpose}`, `- Réponse : **${a.answer}** ${src(S(a.source), a.fetchedAt)}${ageH !== null && ageH >= 1 ? ` · relevé vieux de ${ageH} h` : ''}`, `- État posé par l’outil : ${a.state}${a.missing ? ` · variable manquante : ${a.missing}` : ''}`, '');
  });

  L.push('## 3. Santé structurelle', '');
  if (!i.health) L.push('Non relevée.', '');
  else {
    for (const it of i.health.items) L.push(`- ${it.label} : ${it.status} · ${it.value ?? 'inconnu'}${it.detail ? ` — ${it.detail}` : ''} ${src(S(it.source), i.health.checkedAt)}`);
    L.push('');
  }

  L.push('## 4. Marché', '');
  if (!i.market) L.push('Aucune donnée de marché.', '');
  else {
    const m = i.market;
    L.push(`- Prix : ${usd(m.price.primary.value)} ${src(S(m.price.primary.source), m.price.primary.fetchedAt)}${m.price.secondary ? ` · Jupiter : ${usd(m.price.secondary.value)}, écart ${pct(m.price.spreadPct)}${m.price.spreadWarn ? ' (au-dessus du seuil)' : ''}` : ''}`,
      `- Variations : 5 min ${pct(m.priceChange.m5)} · 1 h ${pct(m.priceChange.h1)} · 6 h ${pct(m.priceChange.h6)} · 24 h ${pct(m.priceChange.h24)}`,
      `- Dérivée : ${m.momentum.label}`,
      `- Capitalisation source (${S(m.mcap.sourceName)}) : ${m.mcap.sourceIsFdv ? 'non fournie, FDV substituée' : usd(m.mcap.sourceValue)} · recalculée (prix × offre nette) : ${usd(m.mcap.local)} · FDV : ${usd(m.mcap.fdvLocal)}${m.mcap.gapPct !== null ? ` · écart source / recalculée ${pct(m.mcap.gapPct)}${m.mcap.gapWarn ? ' (anormal)' : ''}` : ''}`,
      `- Offre émise nette des burns : ${num(m.supply.net)} (mint ${num(m.supply.minted)}, adresses de burn ${num(m.supply.incinerated)}) ${src(S(m.supply.source), m.supply.fetchedAt)}`,
      `- Liquidité : pool principal ${usd(m.liquidity.mainPoolUsd)} (${pct(m.liquidity.ratioPct)} de la capitalisation, ${m.liquidity.bandLabel ?? 'bande inconnue'}) · ${m.liquidity.poolsCount} pool(s) connus pour ${usd(m.liquidity.totalUsd)} (${pct(m.liquidity.totalRatioPct)}, ${m.liquidity.totalBandLabel ?? 'bande inconnue'}) ${src(S(m.liquidity.source), m.fetchedAt)}`,
      `- Volume 24 h, tous pools connus : ${usd(m.volume.h24Usd)} (pool principal ${usd(m.volume.mainPoolH24Usd)}) ${src(S(m.volume.source))} · ratio volume / capitalisation ${m.volume.toMcap === null ? 'inconnu' : fr.format(m.volume.toMcap)}${m.volume.bandLabel ? ` (${m.volume.bandLabel})` : ''}`);
    if (m.liquidity.pools.length) {
      L.push('', '| DEX | Type de pool | Liquidité | Volume 24 h |', '|---|---|---|---|');
      for (const p of m.liquidity.pools.slice(0, 10)) L.push(`| ${p.dexId}${p.isMain ? ' (principal)' : ''} | ${p.poolType} | ${usd(p.liquidityUsd)} | ${usd(p.volumeH24Usd)} |`);
    }
    L.push('');
  }

  L.push('## 5. Offre dans le temps', '');
  if (!i.supply || !i.supply.burnRates.length) L.push('Pas encore d’historique.', '');
  else {
    for (const b of i.supply.burnRates) L.push(`- ${b.windowLabel} : offre alors ${num(b.supplyThen)}, brûlé ${b.burned === null ? 'pas encore d’historique' : num(b.burned)}${b.burnedPct !== null ? ` (${pct(b.burnedPct, 4)})` : ''}`);
    L.push('');
  }

  L.push('## 6. Détenteurs', '');
  const h = i.holders?.latest ?? null;
  if (!h) L.push('Aucun relevé des détenteurs.', '');
  else {
    L.push(`- Relevé du ${date(h.ts)} ${src(S(h.source))}${h.truncated ? ' · liste tronquée par la source (top 20 seulement)' : ''}`,
      `- Détenteurs : ${h.holderCount === null ? 'inconnu' : fr.format(h.holderCount)}`,
      `- Top 5 : ${pct(h.top5Pct, 1)} · Top 10 : ${pct(h.top10Pct, 1)} · Top 20 : ${pct(h.top20Pct, 1)} · Top 50 : ${pct(h.top50Pct, 1)} · Top 100 : ${pct(h.top100Pct, 1)} (pools et adresses de burn exclus)`);
    if (i.holders?.topHolders.length) L.push(`- Dix premiers portefeuilles : ${i.holders.topHolders.slice(0, 10).map((x) => `${x.owner.slice(0, 6)}… ${pct(x.pct, 1)}`).join(' · ')}`);
    L.push('');
  }

  L.push('## 7. Équipe et engagements', '');
  if (i.creator?.creatorAddress) {
    L.push(`- Créateur \`${i.creator.creatorAddress}\` : ${i.creator.available ? `${i.creator.activities.length} activité(s) lue(s)` : 'activités non lisibles dans la configuration actuelle'}`);
    for (const a of i.creator.activities.slice(0, 15)) L.push(`  - ${date(a.ts)} · ${a.kind} · ${a.description ?? ''}${a.amountUsd !== null ? ` · ${usd(a.amountUsd)}` : a.amount !== null ? ` · ${num(a.amount)}` : ''}`);
  } else L.push('- Créateur non identifiable.');
  if (i.actions.length) {
    L.push(`- Mouvements des portefeuilles d’équipe sur 30 jours (${i.actions.length}) :`);
    for (const a of i.actions.slice(0, 20)) L.push(`  - ${date(a.ts)} · ${a.walletLabel ?? a.walletAddress.slice(0, 6)} · ${KIND[a.kind] ?? a.kind}${a.amount !== null ? ` · ${num(a.amount)}` : ''}${a.counterpartyLabel ? ` → ${a.counterpartyLabel}` : ''}`);
  } else L.push('- Aucun mouvement de portefeuille d’équipe enregistré sur 30 jours (ou non lisible).');
  if (i.claims.length) {
    L.push(`- Engagements (${i.claims.length}) :`);
    for (const c of i.claims.slice(0, 20)) L.push(`  - ${date(c.publishedAt)} · ${CLAIM_STATUS[c.status] ?? c.status}${c.dueAt ? ` · échéance ${date(c.dueAt)}` : ''} · « ${c.text.slice(0, 200)}${c.text.length > 200 ? '…' : ''} »${c.url ? ` · ${c.url}` : ''}`);
  } else L.push('- Aucun engagement noté.');
  L.push('');

  L.push('## 8. Veille : changements et actualités (30 jours)', '');
  const projectSources = i.watchSources.filter((s) => s.enabled && ['website', 'docs', 'github', 'x_account'].includes(s.kind));
  if (!projectSources.length) L.push('**Surveillance du site et du compte X non active** : aucune source du projet n’est déclarée dans la veille. Cette section ne couvre donc ni le site, ni les annonces, ni une éventuelle suspension du compte X. Ce qui suit vient uniquement de recherches d’actualités tierces.', '');
  else L.push(`Sources du projet surveillées : ${projectSources.map((s) => `${s.label} (${s.kind})`).join(', ')}.`, '');
  if (!i.changes.length && !i.news.length) L.push('Rien d’enregistré.', '');
  else {
    for (const c of i.changes.slice(0, 20)) {
      const nums = c.numericChanges.slice(0, 3).map((n) => `${n.path || 'racine'} : ${n.before} → ${n.after}`).join(' ; ');
      L.push(`- ${date(c.detectedAt)} · ${c.sourceLabel} · sévérité ${c.severity}${c.unannouncedFlag ? ' · sans communication' : c.announced ? ' · annoncé' : ''}${nums ? ` · ${nums}` : ` · ${c.hunks.length} bloc(s) modifié(s)`}`);
    }
    for (const n of i.news.slice(0, 20)) L.push(`- ${date(n.publishedAt)} · ${n.kind} · ${n.title} (${n.domain})${n.promoFlags.length ? ` · signaux de promotion : ${n.promoFlags.map((f) => f.code).join(', ')}` : ''}`);
    L.push('');
  }

  L.push('## 9. Divergences', '');
  const trig = i.divergences.filter((d) => d.status === 'triggered');
  // Une règle « ok » dont les deux séries sont vides n'est pas au repos : elle n'est pas calculable.
  const ok = i.divergences.filter((d) => d.status === 'ok' && (d.seriesA.changePct !== null || d.seriesB.changePct !== null));
  const notComputable = i.divergences.filter((d) => d.status === 'ok' && d.seriesA.changePct === null && d.seriesB.changePct === null);
  const ins = [...i.divergences.filter((d) => d.status === 'insufficient_data'), ...notComputable];
  for (const d of trig) L.push(`- **Déclenchée** · ${d.label} · ${d.explanation} (${d.seriesA.label} ${pct(d.seriesA.changePct)}, ${d.seriesB.label} ${pct(d.seriesB.changePct)}, fenêtre ${d.windowDays} j)`);
  for (const d of ok) L.push(`- Au repos · ${d.label} (${d.seriesA.label} ${pct(d.seriesA.changePct)}, ${d.seriesB.label} ${pct(d.seriesB.changePct)})`);
  if (ins.length) L.push(`- Historique insuffisant : ${ins.map((d) => d.label).join(' ; ')}`);
  L.push('');

  if (i.plans) {
    L.push('## 10. Journal de discipline (inclus sur demande)', '');
    if (!i.plans.length) L.push('Aucun plan.', '');
    for (const p of i.plans) L.push(`- Plan v${p.version}${p.isCurrent ? ' (actuel)' : ''} du ${date(p.createdAt)} : entrée ${usd(p.entryPrice)}, sortie en gain ${usd(p.takeProfitPrice)}, sortie en perte ${usd(p.stopLossPrice)}, montant ${usd(p.amountUsd)}, ratio ${fr.format(p.riskRewardRatio)}${p.note ? ` · « ${p.note} »` : ''}`);
    if (i.plans.length) L.push('');
  }

  // Glossaire limité aux termes réellement présents dans le dossier : un rapport n'a pas à porter 25 définitions.
  const body = L.join('\n').toLowerCase();
  const used = Object.entries(GLOSSARY).filter(([term]) => body.includes(term.toLowerCase()));
  L.push('## Glossaire (termes employés dans ce dossier)', '');
  for (const [term, def] of used) L.push(`- **${term}** : ${def}`);
  L.push('', '---', '', `Généré le ${date(i.generatedAt)} par trading-personal-manager. Données observées, aucune n'est une recommandation.`, '');
  return L.join('\n');
}
