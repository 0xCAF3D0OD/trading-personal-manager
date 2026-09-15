import type { ScanResult, ScanRetroView, ScannerOverview, TokenSummary, WatchlistItem } from '@tpm/shared';
import { AI_REPORT_PROMPT_VERSION, GLOSSARY, SUMMARY_DISCLAIMER } from '@tpm/shared';

/**
 * Dossiers de collection (docs/05, B.8) : la liste de surveillance entière, ou les résultats du scanner.
 * Même principe que le dossier d'un token : Markdown, sourcé, daté, consigne en tête, jamais de classement ni de note.
 */
export const COLLECTION_PROMPT = `Tu reçois un dossier qui décrit plusieurs tokens Solana observés par un outil personnel. Rédige une lecture comparée, en français courant, pour quelqu'un qui découvre la crypto.

Règles :
1. Ne classe pas les tokens du « meilleur » au « pire » : regroupe-les par ce qui est vérifié (par exemple : ceux où l'équipe garde un pouvoir de piège, ceux dont la liquidité est trop mince pour sortir, ceux où une donnée manque).
2. Pour chaque token, reprends les cinq réponses et dis ce qu'elles impliquent concrètement, en citant la section.
3. Signale les données manquantes ou « inconnues » et ce qu'elles empêchent de conclure.
4. Ne conseille jamais d'acheter, de vendre ni de conserver. Ni note, ni score, ni probabilité, ni cible de prix, ni prévision.
5. Définis chaque terme technique à sa première apparition, avec le glossaire en fin de dossier.
6. Termine par ce qu'il faudrait vérifier soi-même avant toute décision, token par token.`;

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 });
const usd = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? 'inconnu' : Math.abs(v) >= 1000 ? `${compact.format(v)} $` : Math.abs(v) >= 0.01 ? `${fr.format(v)} $` : `${v.toPrecision(4)} $`);
const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'inconnu' : `${v > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v)} %`);
const date = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) : 'date inconnue');
const age = (h: number | null) => (h === null ? 'âge inconnu' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} j`);

function header(title: string, intro: string, generatedAt: number): string[] {
  return [`# ${title}`, '', `> Consigne pour l'IA (version ${AI_REPORT_PROMPT_VERSION})`, ...COLLECTION_PROMPT.split('\n').map((l) => `> ${l}`), '', intro, '', `Généré le ${date(generatedAt)}.`, ''];
}
function glossary(body: string[]): string[] {
  const text = body.join('\n').toLowerCase();
  const used = Object.entries(GLOSSARY).filter(([t]) => text.includes(t.toLowerCase()));
  return ['## Glossaire (termes employés dans ce dossier)', '', ...used.map(([t, d]) => `- **${t}** : ${d}`), '', '---', '', 'Produit par trading-personal-manager. Données observées, aucune n’est une recommandation.', ''];
}

export interface ListDossierInputs { items: WatchlistItem[]; summaries: Record<number, TokenSummary>; tier: string; generatedAt: number; filterNote: string | null }

export function buildListDossier(i: ListDossierInputs): string {
  const L = header('Dossier : liste de surveillance', `${SUMMARY_DISCLAIMER} ${i.items.length} token(s)${i.filterNote ? `, ${i.filterNote}` : ''}. Palier de sources : ${i.tier}.`, i.generatedAt);
  if (!i.items.length) L.push('Aucun token dans la sélection.', '');
  L.push('## Vue d’ensemble', '', '| Token | Prix | 24 h | Âge | Piège ? | Sortie ? | Détenteurs | Équipe | Marché |', '|---|---|---|---|---|---|---|---|---|');
  for (const t of i.items) {
    const s = i.summaries[t.id];
    const cells = s ? s.answers.map((a) => a.short) : ['?', '?', '?', '?', '?'];
    L.push(`| ${t.symbol ?? t.address.slice(0, 8)} | ${usd(t.priceUsd)} | ${pct(t.priceChange24hPct)} | ${t.ageDays === null ? 'inconnu' : `${t.ageDays} j`} | ${cells.join(' | ')} |`);
  }
  L.push('');
  i.items.forEach((t, k) => {
    const s = i.summaries[t.id];
    L.push(`## ${k + 1}. ${t.symbol ?? t.address.slice(0, 8)}${t.name && t.name !== t.symbol ? ` (${t.name})` : ''}`, '',
      `- Adresse : \`${t.address}\` · ${t.program === 'token-2022' ? 'Token-2022' : 'SPL Token'} · créé ${date(t.createdAt)} · suivi depuis ${date(t.addedAt)}`,
      `- Prix ${usd(t.priceUsd)} (${t.priceSource ?? 'source inconnue'}, ${date(t.lastMarketTs)}) · 24 h ${pct(t.priceChange24hPct)} · capitalisation ${usd(t.marketCapUsd)} · volume 24 h ${usd(t.volume24hUsd)}`,
      `- Dernier relevé des détenteurs : ${date(t.lastHolderTs)}`);
    if (!s) L.push('- Synthèse indisponible.');
    else for (const a of s.answers) L.push(`- **${a.question}** ${a.answer} (${a.source}${a.fetchedAt ? `, ${date(a.fetchedAt)}` : ''})${a.missing ? ` · variable manquante : ${a.missing}` : ''}`);
    L.push('');
  });
  L.push(...glossary(L));
  return L.join('\n');
}

export interface ScannerDossierInputs { overview: ScannerOverview; results: ScanResult[]; days: number; retro: ScanRetroView | null; excludedByReason: { label: string; count: number }[]; generatedAt: number; filterNote: string | null }

export function buildScannerDossier(i: ScannerDossierInputs): string {
  const L = header('Dossier : résultats du scanner', `Le scanner réduit le flux des nouveaux pools Solana aux tokens à +100 % sur 24 h ayant passé cinq filtres structurels. Il élimine, il ne promeut pas : un token gardé n'est pas un token recommandé, c'est un token où le scanner n'a rien trouvé, et il n'a pas tout vu. ${i.results.length} token(s) gardé(s) sur ${i.days} jour(s)${i.filterNote ? `, ${i.filterNote}` : ''}.`, i.generatedAt);
  const o = i.overview;
  L.push('## État du scanner', '',
    `- ${o.enabled ? 'Actif' : 'Désactivé'} · dernier passage : ${o.lastRun ? `${date(o.lastRun.finishedAt ?? o.lastRun.startedAt)} · ${o.lastRun.poolsChecked} pools vérifiés · ${o.lastRun.passedStage2} après l’étage 2 · ${o.lastRun.passedStage3} après l’étage 3 · ${o.lastRun.keptCount} gardés · ${o.lastRun.status}` : 'jamais'}`,
    `- Pools suivis : ${o.pools.hot} chauds, ${o.pools.warm} tièdes, ${o.pools.cold} froids, ${o.pools.retired} retirés · voie ${o.lane === 'geckoterminal' ? 'GeckoTerminal public' : 'CoinGecko démo (secours)'}${o.breaker.open ? ' · disjoncteur ouvert' : ''}`,
    `- ${o.heliusAvailable ? 'Helius disponible : créateur en série vérifié' : 'Sans Helius : le drapeau « créateur en série » n’est pas vérifié, l’alerte zéro drapeau est impossible'}`, '');
  if (i.excludedByReason.length) {
    L.push('## Pourquoi les autres ont été exclus', '', ...i.excludedByReason.map((r) => `- ${r.label} : ${r.count}`), '');
  }
  L.push('## Tokens gardés', '');
  if (!i.results.length) L.push('Aucun. C’est le cas la plupart du temps : les seuils sont faits pour éliminer.', '');
  L.push('| Token | Âge | 24 h | Capitalisation | Liquidité | Filtres | Drapeaux levés | Non vérifiés | Où l’acheter |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of i.results) {
    L.push(`| ${r.tokenSymbol ?? r.tokenAddress.slice(0, 8)} | ${age(r.metrics.ageHours)} | ${pct(r.metrics.pctH24, 0)} | ${usd(r.metrics.capUsd)}${r.metrics.mcapIsFdv ? ' (FDV)' : ''} | ${usd(r.metrics.liquidityUsd)} | ${r.structuralPassed ?? '?'}/${r.structuralTotal ?? '?'} | ${r.flagCount} | ${r.unverifiedCount} | ${r.venues.map((v) => v.name).join(', ') || 'inconnu'} |`);
  }
  L.push('');
  i.results.forEach((r, k) => {
    L.push(`### ${k + 1}. ${r.tokenSymbol ?? r.tokenAddress.slice(0, 8)}${r.tokenName ? ` (${r.tokenName})` : ''}`, '',
      `- Adresse : \`${r.tokenAddress}\` · pool ${r.metrics.dexId} \`${r.poolAddress}\` · relevé du ${date(r.observedAt)}${r.inWatchlist ? ' · déjà dans la liste de surveillance' : ''}`,
      `- Prix ${usd(r.metrics.priceUsd)} (${r.metrics.priceSource}) · 1 h ${pct(r.metrics.pctH1)} · 24 h ${pct(r.metrics.pctH24, 0)} · volume 24 h ${usd(r.metrics.volumeH24Usd)} · volume / capitalisation ${r.metrics.volumeToMcap === null ? 'inconnu' : fr.format(r.metrics.volumeToMcap)} · liquidité / capitalisation ${pct(r.metrics.liquidityToMcapPct)}`,
      ...(r.metrics.txH24 ? [`- 24 h : ${r.metrics.txH24.buys} achats / ${r.metrics.txH24.sells} ventes, ${r.metrics.txH24.buyers} acheteurs / ${r.metrics.txH24.sellers} vendeurs`] : []),
      `- Filtres structurels : ${r.structural.map((c) => `${c.label} ${c.passed ? 'passé' : 'échoué'} (${c.observed ?? '—'}, ${c.source})`).join(' · ') || 'non évalués'}`,
      `- Drapeaux : ${r.flags.map((f) => `${f.label} ${!f.verified ? 'non vérifié' : f.raised ? 'LEVÉ' : 'absent'}${f.observed !== null ? ` (${f.observed})` : ''}`).join(' · ') || 'non évalués'}`,
      `- Où l’acheter : ${r.venues.map((v) => `${v.name} (${v.kind === 'dex' ? 'DEX' : 'plateforme centralisée'}${v.isKraken ? ', Kraken' : ''})`).join(', ') || 'aucune plateforme connue'}${r.venuesNote ? ` · ${r.venuesNote}` : ''}`, '');
  });
  if (i.retro) {
    L.push('## Rétrospective', '', 'Si l’on avait acheté chaque token remonté : médiane d’abord, parce qu’un seul x50 masque cinquante pertes. Deux calculs : tokens disparus comptés à −100 %, ou exclus.', '');
    for (const s of i.retro.stats) L.push(`- ${s.horizon === 'd1' ? 'J+1' : s.horizon === 'd7' ? 'J+7' : 'J+30'} : ${s.count} token(s) échus, ${s.unavailable} disparu(s) · médiane ${pct(s.withLoss.medianPct, 0)} (disparus à −100 %) / ${pct(s.excluding.medianPct, 0)} (exclus) · en gain ${pct(s.withLoss.positivePct, 0)} · sous −50 % ${pct(s.withLoss.belowMinus50Pct, 0)}`);
    L.push('');
  }
  L.push(...glossary(L));
  return L.join('\n');
}
