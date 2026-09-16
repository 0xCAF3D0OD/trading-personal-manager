import { describe, expect, it } from 'vitest';
import { AI_REPORT_PROMPT, GLOSSARY } from '@tpm/shared';
import { buildDossier, type DossierInputs } from '../src/dossier/build.js';
import { mdToHtml, safeFilename, toStandaloneHtml } from '../src/dossier/export.js';
import { buildListDossier, buildScannerDossier } from '../src/dossier/collections.js';

const now = 1_789_000_000;
function inputs(over: Partial<DossierInputs> = {}): DossierInputs {
  return {
    token: { symbol: 'EMBER', name: 'Embercurve', address: '5dvXTZ5qwgafnHtwu3Ls3QrWx1U4LQsFeCuJgkk4QEC6', program: 'spl-token', decimals: 6, createdAt: now - 90 * 86400, creatorAddress: null, addedAt: now - 3 * 86400 },
    tier: 'B',
    jobs: [{ name: 'holder-snapshot', label: 'Relevé des détenteurs (quotidien)', lastRunAt: now - 37 * 3600, status: 'ok', error: null }],
    degraded: [],
    summary: {
      tokenId: 1, computedAt: now,
      answers: [
        { id: 'trap', question: 'Peut-on me piéger ?', purpose: 'Si oui, vous pouvez perdre sans que le prix bouge.', state: 'ok', answer: 'Non : l’équipe ne peut ni créer de tokens, ni geler les comptes, ni prélever de frais.', short: 'sain', source: 'rpc', fetchedAt: now, card: 'health', missing: null },
        { id: 'exit', question: 'Puis-je sortir ?', purpose: 'Un gain n’existe que si vous pouvez vendre.', state: 'warn', answer: 'Avec prudence : liquidité mince, 3,2 % de la capitalisation est disponible pour vendre sur 2 pools.', short: 'mince', source: 'dexscreener', fetchedAt: now, card: 'liquidity', missing: null },
        { id: 'holders', question: 'Qui tient le token ?', purpose: 'Quelques portefeuilles suffisent à effacer une hausse.', state: 'unknown', answer: 'Inconnu : aucun relevé des détenteurs pour l’instant.', short: 'inconnue', source: 'unavailable', fetchedAt: null, card: 'holders', missing: 'SOLANA_RPC_URL (URL Helius)' },
        { id: 'team', question: 'Que fait l’équipe ?', purpose: 'Une équipe qui vend annonce la suite.', state: 'unknown', answer: 'Créateur non identifiable et aucun portefeuille d’équipe déclaré : rien à observer sur la chaîne.', short: 'inconnu', source: 'local', fetchedAt: null, card: 'team', missing: null },
        { id: 'market', question: 'Le marché confirme-t-il l’histoire ?', purpose: 'Une hausse non confirmée tient rarement.', state: 'ok', answer: 'Aucune contradiction sur 5 règles évaluées.', short: 'cohérent', source: 'local', fetchedAt: now, card: 'divergences', missing: null },
      ],
    },
    health: null, market: null, supply: null, holders: null, creator: null,
    watchSources: [], changes: [], claims: [], news: [], actions: [], divergences: [],
    plans: null, generatedAt: now, ...over,
  };
}
const plan = { id: 1, tokenId: 1, version: 1, supersedesPlanId: null, createdAt: now, entryPrice: 0.01, takeProfitPrice: 0.02, stopLossPrice: 0.005, amountUsd: 250, acceptsTotalLoss: true, note: 'note privée', riskRewardRatio: 2, maxLossUsd: 125, isCurrent: true };

describe('Dossier pour l’IA', () => {
  it('commence par la consigne, contient les cinq questions avec leur finalité, et le glossaire', () => {
    const md = buildDossier(inputs());
    expect(md.startsWith('# Dossier : EMBER (Embercurve)')).toBe(true);
    expect(md).toContain(AI_REPORT_PROMPT.split('\n')[0]);
    for (const q of ['Peut-on me piéger ?', 'Puis-je sortir ?', 'Qui tient le token ?', 'Que fait l’équipe ?', 'Le marché confirme-t-il l’histoire ?']) expect(md).toContain(q);
    expect(md).toContain('À quoi ça sert : Un gain n’existe que si vous pouvez vendre.');
    expect(md).toContain('variable manquante : SOLANA_RPC_URL (URL Helius)');
    // Glossaire limité aux termes employés : « liquidité » l'est (question 2), « produit constant » ne l'est pas ici.
    expect(md).toContain('**liquidité**');
    expect(md).not.toContain('**produit constant**');
    expect(Object.keys(GLOSSARY).length).toBeGreaterThan(20);
    expect(md).toContain('Surveillance du site et du compte X non active');
    expect(md).toContain('Relevé des détenteurs (quotidien) :');
    expect(md).toContain('(il y a 37 h)');
    expect(md).toContain('aucune n\'est une recommandation');
  });

  it('exclut le plan par défaut et l’inclut sur demande, sans jamais contenir de clé', () => {
    const sans = buildDossier(inputs());
    expect(sans).not.toContain('Journal de discipline');
    expect(sans).not.toContain('note privée');
    const avec = buildDossier(inputs({ plans: [plan] }));
    expect(avec).toContain('## 10. Journal de discipline');
    expect(avec).toContain('note privée');
    expect(avec).not.toMatch(/api-key|HELIUS_API_KEY=|Bearer /);
  });

  it('dit « inconnu » ou « aucun » plutôt que d’inventer quand une section est vide', () => {
    const md = buildDossier(inputs());
    expect(md).toContain('## 3. Santé structurelle\n\nNon relevée.');
    expect(md).toContain('Aucune donnée de marché.');
    expect(md).toContain('Aucun relevé des détenteurs.');
    expect(md).toContain('Créateur non identifiable.');
    expect(md).toContain('Rien d’enregistré.');
  });
});

describe('Prix dans le dossier', () => {
  it('garde quatre chiffres significatifs sous 1 $ : 0,0138 $, pas 0,01 $', () => {
    const md = buildDossier(inputs({ market: { price: { primary: { value: 0.0138, source: 'dexscreener', fetchedAt: now }, secondary: null, spreadPct: null, spreadWarn: false, spreadConsecutiveOver: 0 }, priceChange: { m5: null, h1: null, h6: null, h24: -21.83 }, momentum: { state: 'none', hourlyRates: { h24: null, h6: null, h1: null, m5: null }, label: 'Sans tendance nette : —' }, mcap: { sourceValue: 13_732_995, sourceName: 'dexscreener', sourceIsFdv: false, local: 13_732_995, fdvLocal: 13_732_995, fdvSource: null, gapPct: 0, gapWarn: false }, supply: { minted: 993_450_000, incinerated: 0, net: 993_450_000, incineratorAddresses: [], source: 'rpc', fetchedAt: now }, liquidity: { mainPoolUsd: 657_705, totalUsd: 1_929_252, poolsCount: 22, ratioPct: 4.79, band: 'thin', bandLabel: 'Liquidité mince', totalRatioPct: 14.05, totalBand: 'comfortable', totalBandLabel: 'Liquidité confortable', ignoredPools: 1, pools: [], source: 'dexscreener' }, volume: { h24Usd: 3_820_000, mainPoolH24Usd: 2_817_115, source: 'dexscreener', toMcap: 0.28, band: 'low', bandLabel: 'Activité faible', ratioChange24hPct: null, ratioChange7dPct: null }, pair: null, source: 'dexscreener', fetchedAt: now } }));
    expect(md).toContain('- Prix : 0,0138 $');
    expect(md).not.toContain('- Prix : 0,01 $');
  });
});

describe('Export partageable', () => {
  it('convertit le Markdown du dossier en HTML en échappant tout le texte', () => {
    const html = mdToHtml('# Titre\n\n> consigne\n\n## Section\n\n- point **fort** avec `code`\n- <script>alert(1)</script>\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nParagraphe final.');
    expect(html).toContain('<h1>Titre</h1>');
    expect(html).toContain('<blockquote>consigne</blockquote>');
    expect(html).toContain('<li>point <strong>fort</strong> avec <code>code</code></li>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(html).toContain('<p>Paragraphe final.</p>');
  });
  it('produit une page autonome sans ressource externe, avec titre, date et pied', () => {
    const page = toStandaloneHtml({ title: 'Rapport EMBER', subtitle: 'manuel · dossier abc', generatedAt: now, footer: 'aucune recommandation' }, buildDossier(inputs()));
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('<title>Rapport EMBER</title>');
    expect(page).toContain('aucune recommandation');
    expect(page).not.toMatch(/<(script|link)\b/);
    expect(page).not.toMatch(/src="http|href="http[^"]*\.(css|js)/);
  });
  it('fabrique des noms de fichiers sûrs', () => {
    expect(safeFilename(['rapport', 'EMBER', '2026-09-14', 'manuel'], 'html')).toBe('rapport-ember-2026-09-14-manuel.html');
    expect(safeFilename(['dossier', 'Éclair/Été', null], 'md')).toBe('dossier-eclair-ete.md');
  });
});

describe('Dossiers de collection', () => {
  const token = { id: 1, address: '5dvXTZ5qwgafnHtwu3Ls3QrWx1U4LQsFeCuJgkk4QEC6', symbol: 'EMBER', name: 'Embercurve', decimals: 6, program: 'spl-token' as const, createdAt: now - 90 * 86400, creatorAddress: null, sortOrder: 1, addedAt: now, priceUsd: 0.0123, priceSource: 'dexscreener' as const, priceChange24hPct: 12.5, marketCapUsd: 1_200_000, volume24hUsd: 80_000, ageDays: 90, lastMarketTs: now, lastHolderTs: null };
  it('la liste : vue d’ensemble en tableau, une section par token avec les cinq réponses, jamais de classement', () => {
    const md = buildListDossier({ items: [token], summaries: { 1: inputs().summary }, tier: 'B', generatedAt: now, filterNote: 'sélection de 1 sur 3' });
    expect(md).toContain('# Dossier : liste de surveillance');
    expect(md).toContain('Ne classe pas les tokens');
    expect(md).toContain('| EMBER |');
    expect(md).toContain('## 1. EMBER (Embercurve)');
    expect(md).toContain('**Puis-je sortir ?** Avec prudence');
    expect(md).toContain('sélection de 1 sur 3');
  });
  it('le scanner : état, exclus par motif, tokens gardés avec drapeaux et plateformes, rétrospective', () => {
    const md = buildScannerDossier({
      overview: { lastRun: { id: 1, startedAt: now, finishedAt: now, status: 'ok', settingsId: 1, poolsChecked: 220, passedStage2: 30, passedStage3: 6, keptCount: 4, apiCalls: 12, stage2Reasons: {}, error: null }, pools: { hot: 10, warm: 5, cold: 0, retired: 0 }, breaker: { open: false, until: null, consecutive429: 0 }, lane: 'geckoterminal', callsLastHour: 12, heliusAvailable: false, enabled: true },
      results: [{ id: 1, runId: 1, poolAddress: 'Pool111', tokenAddress: 'Tok111', tokenSymbol: 'NEW', tokenName: 'Nouveau', status: 'kept', excludedStage: null, exclusionReasons: [], structural: [{ code: 'mint', label: 'Autorité de mint révoquée', passed: true, observed: 'révoquée', threshold: null, source: 'rpc' }], structuralPassed: 5, structuralTotal: 5,
        flags: [{ code: 'top10', label: 'Top 10 élevé', raised: true, verified: true, observed: 55, threshold: 40, detail: '', source: 'geckoterminal' }, { code: 'creator', label: 'Créateur en série', raised: false, verified: false, observed: null, threshold: null, detail: '', source: 'helius' }], flagCount: 1, unverifiedCount: 1,
        metrics: { poolAddress: 'Pool111', dexId: 'raydium', priceUsd: 0.002, priceSource: 'geckoterminal', ageHours: 30, poolCreatedAt: now, pctH1: 5, pctH24: 180, capUsd: 900_000, mcapIsFdv: true, fdvUsd: 900_000, marketCapUsd: null, liquidityUsd: 120_000, volumeH24Usd: 500_000, volumeH1Usd: 20_000, volumeToMcap: 0.55, liquidityToMcapPct: 13.3, txH1: null, txH24: { buys: 900, sells: 700, buyers: 400, sellers: 300 }, otherPools: [] },
        observedAt: now, inWatchlist: false, venues: [{ name: 'Raydium', kind: 'dex', identifier: 'raydium', url: null, volume24hUsd: null, isKraken: false }], venuesNote: 'Pas de fiche CoinGecko : les plateformes centralisées ne peuvent pas être vérifiées, seuls les DEX sont listés.' }],
      days: 1, retro: null, excludedByReason: [{ label: 'Liquidité insuffisante', count: 12 }], generatedAt: now, filterNote: null,
    });
    expect(md).toContain('# Dossier : résultats du scanner');
    expect(md).toContain('220 pools vérifiés');
    expect(md).toContain('- Liquidité insuffisante : 12');
    expect(md).toMatch(/\| NEW \| 30 h \| \+180 % \| 900.k.\$ \(FDV\) \|/); // espaces fines de fr-FR
    expect(md).toContain('Top 10 élevé LEVÉ (55)');
    expect(md).toContain('Créateur en série non vérifié');
    expect(md).toContain('Raydium (DEX)');
    expect(md).toContain('un token gardé n\'est pas un token recommandé');
  });
});
