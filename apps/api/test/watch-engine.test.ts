import { describe, expect, it } from 'vitest';
import { WATCH_DEFAULTS } from '@tpm/shared';
import { diffLines, dice, hashLines } from '../src/watch/differ.js';
import { htmlToLines, jsonToLines, looksClientRendered } from '../src/watch/normalizer.js';
import { comparableText, extractNumbers, volatileKey } from '../src/watch/numbers.js';
import { isAllowedByRobots } from '../src/watch/robots.js';
import { filterVolatile, updateVolatility } from '../src/watch/volatility.js';
import { draftFromText, extractDueAt, parseOembed, textMentionsChange } from '../src/watch/claims-extract.js';
import { canonicalUrl, classifyNews, dedupKey } from '../src/watch/news-rules.js';
import { classifyHeliusTx } from '../src/watch/onchain-classify.js';

const opts = { similarityThreshold: WATCH_DEFAULTS.similarityThreshold, keywords: WATCH_DEFAULTS.tokenomicsKeywords };

describe('Normalisation des nombres', () => {
  it('reconnaît 80 %, 80%, 80 percent comme la même valeur avec unité %', () => {
    for (const s of ['80 %', '80%', '80 percent', '80 %']) {
      const n = extractNumbers(s);
      expect(n).toHaveLength(1);
      expect(n[0]!.value).toBe(80);
      expect(n[0]!.unit).toBe('%');
    }
  });
  it('lit 1.5M, 1 500 000 et 1,500,000 comme 1 500 000', () => {
    expect(extractNumbers('1.5M')[0]!.value).toBe(1_500_000);
    expect(extractNumbers('1 500 000 tokens')[0]!.value).toBe(1_500_000);
    expect(extractNumbers('1,500,000')[0]!.value).toBe(1_500_000);
    expect(extractNumbers('2,5 %')[0]!.value).toBe(2.5);
  });
  it('ignore les longues suites de chiffres sans unité (adresses, identifiants)', () => {
    expect(extractNumbers('tx 1234567890123456789')).toHaveLength(0);
  });
  it('produit une clé de volatilité indépendante des chiffres', () => {
    expect(volatileKey('Stats', 'Prix : 0.0042 $')).toBe(volatileKey('Stats', 'Prix : 0.0051 $'));
    expect(volatileKey('Stats', 'Prix : 0.0042 $')).not.toBe(volatileKey('Stats', 'Détenteurs : 0.0042 $'));
  });
  it('compare les textes sans tenir compte de la casse et de la ponctuation', () => {
    expect(comparableText('80% of Taxes, redistributed!')).toBe(comparableText('80 % of taxes redistributed'));
  });
});

describe('HTML → lignes', () => {
  const html = `<html><head><title>Ember</title><script>var x=1;</script></head><body>
    <h1>Tokenomics</h1><h2>Taxes</h2><p>80% of taxes redistributed to holders</p>
    <ul><li>Buy tax: 5%</li><li>Sell tax: 5%</li></ul>
    <h2>Links</h2><p><a href="https://x.com/ember">Twitter</a></p>
    <div>Prix en direct : 0.0042 $</div></body></html>`;
  it('extrait des lignes avec leur chemin de titres, sans les scripts', () => {
    const { title, lines } = htmlToLines(html);
    expect(title).toBe('Ember');
    const tax = lines.find((l) => l.text.startsWith('80%'));
    expect(tax?.path).toBe('Tokenomics > Taxes');
    expect(lines.some((l) => l.text.includes('var x'))).toBe(false);
    expect(lines.find((l) => l.text.startsWith('Twitter'))?.text).toContain('[https://x.com/ember]');
  });
  it('détecte une page rendue côté client', () => {
    const shell = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
    const { lines } = htmlToLines(shell);
    expect(looksClientRendered(shell, lines)).toBe(true);
    expect(looksClientRendered(html, htmlToLines(html).lines)).toBe(false);
  });
});

describe('Diff de lignes', () => {
  it('80 % → 50 % : un hunk changed, un changement numérique tokenomics avec son chemin', () => {
    const a = htmlToLines('<h1>Tokenomics</h1><p>80% of taxes redistributed to holders</p>').lines;
    const b = htmlToLines('<h1>Tokenomics</h1><p>50% of taxes redistributed to holders</p>').lines;
    const r = diffLines(a, b, opts);
    expect(r.hunks.filter((h) => h.op === 'changed')).toHaveLength(1);
    expect(r.severity).toBe('tokenomics');
    expect(r.numericChanges).toHaveLength(1);
    expect(r.numericChanges[0]).toMatchObject({ path: 'Tokenomics', beforeValue: 80, afterValue: 50, unit: '%' });
    expect(r.numericChanges[0]!.keywords).toContain('tax');
  });
  it('apparie deux lignes de même gabarit dont seuls les chiffres changent', () => {
    const r = diffLines([{ path: 'Tokenomics', text: 'Buy tax: 5%' }], [{ path: 'Tokenomics', text: 'Buy tax: 6%' }], opts);
    expect(r.hunks).toHaveLength(1);
    expect(r.hunks[0]!.op).toBe('changed');
    expect(r.numericChanges).toHaveLength(1);
  });
  it('une reformulation sans chiffre est un changement de contenu ; casse et ponctuation seules sont mineures', () => {
    const a = [{ path: 'About', text: 'We build the future of finance.' }];
    expect(diffLines(a, [{ path: 'About', text: 'We build the future of payments.' }], opts).severity).toBe('content');
    expect(diffLines(a, [{ path: 'About', text: 'WE BUILD THE FUTURE OF FINANCE' }], opts).severity).toBe('minor');
    expect(diffLines(a, a, opts).severity).toBeNull();
  });
  it('mesure la similarité par bigrammes', () => {
    expect(dice('80% of taxes redistributed', '50% of taxes redistributed')).toBeGreaterThan(0.8);
    expect(dice('hello world', 'tokenomics')).toBeLessThan(0.2);
  });
  it('hash stable pour un contenu identique', () => {
    expect(hashLines([{ path: 'a', text: 'b' }])).toBe(hashLines([{ path: 'a', text: 'b' }]));
  });
});

describe('JSON → lignes', () => {
  it('aplatit par chemin de clés et détecte 80 → 50', () => {
    const a = jsonToLines({ tax: { holders: 80, lp: 20 } });
    const b = jsonToLines({ tax: { holders: 50, lp: 20 } });
    const r = diffLines(a, b, { ...opts, pairByPath: true });
    expect(r.numericChanges).toHaveLength(1);
    expect(r.numericChanges[0]).toMatchObject({ path: '/tax/holders', beforeValue: 80, afterValue: 50 });
    expect(r.severity).toBe('tokenomics');
  });
  it('un tableau réordonné d’objets identifiés ne change pas', () => {
    const a = jsonToLines({ pools: [{ id: 'a', liq: 1 }, { id: 'b', liq: 2 }] });
    const b = jsonToLines({ pools: [{ id: 'b', liq: 2 }, { id: 'a', liq: 1 }] });
    expect(diffLines(a, b, { ...opts, pairByPath: true }).hunks).toHaveLength(0);
  });
  it('respecte un pointeur de sous-arbre', () => {
    expect(jsonToLines({ a: { b: 1 }, c: 2 }, '/a')).toEqual([{ path: '/b', text: '1' }]);
  });
});

describe('Lignes volatiles', () => {
  it('exclut du diff une ligne dont seuls les chiffres bougent trois fois de suite', () => {
    const now = 1_700_000_000;
    let entries: ReturnType<typeof updateVolatility> = [];
    const hunk = (before: string, after: string) => [{ op: 'changed' as const, path: 'Stats', before, after }];
    entries = updateVolatility(entries, hunk('Prix : 1 $', 'Prix : 2 $'), 3, now);
    entries = updateVolatility(entries, hunk('Prix : 2 $', 'Prix : 3 $'), 3, now);
    expect(entries[0]!.volatile).toBe(false);
    entries = updateVolatility(entries, hunk('Prix : 3 $', 'Prix : 4 $'), 3, now);
    expect(entries[0]!.volatile).toBe(true);
    const lines = [{ path: 'Stats', text: 'Prix : 5 $' }, { path: 'Stats', text: 'Détenteurs : 1200' }];
    expect(filterVolatile(lines, entries)).toEqual([{ path: 'Stats', text: 'Détenteurs : 1200' }]);
  });
  it('un changement de mots n’est pas volatile', () => {
    const entries = updateVolatility([], [{ op: 'changed', path: 'p', before: 'Taxe 5 %', after: 'Frais 5 %' }], 3, 0);
    expect(entries).toHaveLength(0);
  });
});

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /private/\nAllow: /private/public\n\nUser-agent: trading-personal-manager\nDisallow: /nobots/`;
  it('applique la règle la plus longue et le groupe dédié à notre agent', () => {
    expect(isAllowedByRobots(txt, '/tokenomics', 'trading-personal-manager/0.1')).toBe(true);
    expect(isAllowedByRobots(txt, '/nobots/page', 'trading-personal-manager/0.1')).toBe(false);
    expect(isAllowedByRobots(txt, '/private/x', 'autre-bot')).toBe(false);
    expect(isAllowedByRobots(txt, '/private/public/x', 'autre-bot')).toBe(true);
    expect(isAllowedByRobots(null, '/anything', 'x')).toBe(true);
  });
});

describe('Engagements : extraction', () => {
  const pub = Math.floor(Date.UTC(2026, 8, 9, 12) / 1000);
  it('propose type, sous-type, nombres et vérification pour une annonce de burn', () => {
    const d = draftFromText('We will burn 5% of the supply within 7 days', pub);
    expect(d.type).toBe('tokenomics');
    expect(d.subtype).toBe('burn');
    expect(d.verificationKind).toBe('supply_decrease');
    expect(d.extractedNumbers[0]).toMatchObject({ value: 5, unit: '%' });
    expect(d.dueAt).toBe(pub + 7 * 86400);
  });
  it('lit une date explicite en français et en anglais', () => {
    expect(extractDueAt("d'ici le 30 septembre", pub)).toBe(Math.floor(Date.UTC(2026, 8, 30, 23, 59) / 1000));
    expect(extractDueAt('by October 15, 2026', pub)).toBe(Math.floor(Date.UTC(2026, 9, 15, 23, 59) / 1000));
    expect(extractDueAt('coming soon', pub)).toBeNull();
  });
  it('analyse une réponse oEmbed de X', () => {
    const o = {
      html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">80% of taxes go back to holders &amp; LP is locked</p>&mdash; Ember (@embercurve) <a href="https://twitter.com/embercurve/status/1">September 9, 2026</a></blockquote>',
      author_name: 'Ember', author_url: 'https://twitter.com/embercurve', url: 'https://twitter.com/embercurve/status/1',
    };
    const r = parseOembed(o);
    expect(r.text).toBe('80% of taxes go back to holders & LP is locked');
    expect(r.author).toBe('Ember (@embercurve)');
    expect(r.publishedAt).toBe(Math.floor(new Date('September 9, 2026').getTime() / 1000));
  });
  it('associe une annonce à un changement par valeur ou par mots-clés', () => {
    const change = { beforeValue: 80, afterValue: 50, unit: '%', keywords: ['tax', 'redistribu'] };
    expect(textMentionsChange('Tax redistribution moves to 50% starting today', change)).toBe(true);
    expect(textMentionsChange('We updated the tax redistribution model', change)).toBe(true);
    expect(textMentionsChange('New partnership announced', change)).toBe(false);
  });
});

describe('Actualités : déduplication et promotion', () => {
  const s = { prWireDomains: WATCH_DEFAULTS.prWireDomains, sponsoredPatterns: WATCH_DEFAULTS.sponsoredPatterns, pricePredictionMaxTokenAgeDays: 90 };
  it('canonise les URL et dédoublonne malgré les paramètres de suivi', () => {
    const a = canonicalUrl('https://www.example.com/article?utm_source=x&id=3#top');
    const b = canonicalUrl('http://example.com/article/?id=3');
    expect(a).toBe(b);
    expect(dedupKey('T', a)).toBe(dedupKey('T2', b));
    expect(dedupKey('Ember lists on Kraken!', 'https://news.google.com/rss/articles/abc')).toBe(dedupKey('Ember Lists on Kraken', 'https://news.google.com/rss/articles/xyz'));
  });
  it('marque une prédiction de prix pluriannuelle sur un token récent, pas sur un token ancien', () => {
    const base = { title: 'EMBER Price Prediction 2030: can it reach $1?', url: 'https://cryptoblog.example/ember-price-prediction-2030', symbol: 'EMBER', domainFirstSeenDaysAgo: null, domainTokenCount: 0 };
    expect(classifyNews({ ...base, tokenAgeDays: 20 }, s).kind).toBe('promo');
    expect(classifyNews({ ...base, tokenAgeDays: 700 }, s).kind).toBe('news');
  });
  it('reconnaît un fil de communiqués, une mention sponsorisée, un listing', () => {
    expect(classifyNews({ title: 'Ember announces', url: 'https://www.globenewswire.com/news/1', symbol: null, tokenAgeDays: 10, domainFirstSeenDaysAgo: null, domainTokenCount: 0 }, s).promoFlags[0]!.code).toBe('pr_wire');
    expect(classifyNews({ title: 'Ember review (sponsored)', url: 'https://blog.example/x', symbol: null, tokenAgeDays: 10, domainFirstSeenDaysAgo: null, domainTokenCount: 0 }, s).promoFlags[0]!.code).toBe('sponsored_mention');
    expect(classifyNews({ title: 'Kraken lists EMBER for spot trading', url: 'https://blog.kraken.com/x', symbol: 'EMBER', tokenAgeDays: 10, domainFirstSeenDaysAgo: null, domainTokenCount: 0 }, s).kind).toBe('listing');
  });
});

describe('Actions on-chain', () => {
  const mint = 'MINT', wallet = 'W1';
  const labelOf = (a: string) => (a === 'EX1' ? 'exchange:kraken' : null);
  it('classe un transfert sortant vers un exchange, une vente, un burn', () => {
    expect(classifyHeliusTx({ type: 'TRANSFER', tokenTransfers: [{ mint, fromUserAccount: wallet, toUserAccount: 'EX1', tokenAmount: 1000 }] }, wallet, mint, labelOf))
      .toMatchObject({ kind: 'transfer_out', amount: 1000, counterpartyLabel: 'exchange:kraken' });
    expect(classifyHeliusTx({ type: 'SWAP', source: 'RAYDIUM', tokenTransfers: [{ mint, fromUserAccount: wallet, toUserAccount: 'POOL', tokenAmount: 50 }] }, wallet, mint, labelOf))
      .toMatchObject({ kind: 'swap_sell', amount: 50, counterpartyLabel: 'dex:raydium' });
    expect(classifyHeliusTx({ type: 'BURN', tokenTransfers: [{ mint, fromUserAccount: wallet, toUserAccount: null, tokenAmount: 10 }] }, wallet, mint, labelOf)?.kind).toBe('burn');
    expect(classifyHeliusTx({ type: 'TRANSFER', tokenTransfers: [{ mint: 'OTHER', fromUserAccount: wallet, toUserAccount: 'X', tokenAmount: 1 }] }, wallet, mint, labelOf)).toBeNull();
  });
});
