import { describe, expect, it } from 'vitest';
import { KRAKEN_PRIVATE_WHITELIST, KrakenSource, normalizeAsset, parseBalance, parsePairs, parseTicker, signRequest } from '../src/datasources/kraken/kraken.source.js';

describe('Source Kraken : signature et liste blanche', () => {
  it('signe exactement comme l’exemple de la documentation Kraken', () => {
    // Vecteur public de la documentation Kraken (« Authentication »). Aucune clé réelle.
    const secret = 'kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==';
    const nonce = '1616492376594';
    const post = 'nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25';
    expect(signRequest('/0/private/AddOrder', nonce, post, secret)).toBe('4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==');
  });

  it('n’autorise qu’un seul endpoint privé, Balance, et refuse tout le reste avant tout appel réseau', async () => {
    expect([...KRAKEN_PRIVATE_WHITELIST]).toEqual(['Balance']);
    const src = new KrakenSource({ usage: { record: () => undefined } as never, health: { markOk: () => undefined, markDegraded: () => undefined } as never }, 'http://127.0.0.1:9', 'k', 'c2VjcmV0');
    const call = (src as unknown as { privateCall: (m: string) => Promise<unknown> }).privateCall.bind(src);
    for (const forbidden of ['AddOrder', 'Withdraw', 'Ledgers', 'TradesHistory', 'OpenOrders', 'CancelAll']) {
      await expect(call(forbidden)).rejects.toThrow(/refusée par construction/);
    }
  });

  it('refuse Balance sans clé, avant tout appel réseau', async () => {
    const src = new KrakenSource({ usage: { record: () => undefined } as never, health: {} as never }, 'http://127.0.0.1:9', undefined, undefined);
    expect(src.configured).toBe(false);
    await expect(src.balance()).rejects.toThrow(/KRAKEN_API_KEY/);
  });
});

describe('Source Kraken : codes, soldes et prix', () => {
  it('normalise les codes historiques et lit l’état depuis le suffixe', () => {
    expect(normalizeAsset('XXBT')).toEqual({ asset: 'BTC', state: null });
    expect(normalizeAsset('ZEUR')).toEqual({ asset: 'EUR', state: null });
    expect(normalizeAsset('SOL')).toEqual({ asset: 'SOL', state: null });
    expect(normalizeAsset('SOL.S')).toEqual({ asset: 'SOL', state: 'staking' });
    expect(normalizeAsset('ETH.F')).toEqual({ asset: 'ETH', state: 'earn_flex' });
    expect(normalizeAsset('DOT.B')).toEqual({ asset: 'DOT', state: 'earn_locked' });
    expect(normalizeAsset('XXDG')).toEqual({ asset: 'DOGE', state: null });
  });

  it('ignore les soldes nuls et garde le code brut à côté du code normalisé', () => {
    const b = parseBalance({ ZEUR: '120.5000', XXBT: '0.0000000000', SOL: '12.3', 'SOL.S': '5', EMBER: '1000000', BAD: 'abc' });
    expect(b.map((x) => `${x.asset}${x.state ? `(${x.state})` : ''}=${x.balance}`)).toEqual(['EMBER=1000000', 'EUR=120.5', 'SOL=12.3', 'SOL(staking)=5']);
    expect(b.find((x) => x.asset === 'EUR')?.krakenCode).toBe('ZEUR');
  });

  it('traduit les paires et lit le dernier prix, en ignorant les paires inconnues', () => {
    const pairs = parsePairs({ XXBTZEUR: { altname: 'XBTEUR', wsname: 'XBT/EUR', base: 'XXBT', quote: 'ZEUR' }, SOLEUR: { altname: 'SOLEUR', wsname: 'SOL/EUR', base: 'SOL', quote: 'ZEUR' }, BROKEN: {} });
    expect(pairs.map((p) => `${p.base}/${p.quote}=${p.key}`)).toEqual(['BTC/EUR=XXBTZEUR', 'SOL/EUR=SOLEUR']);
    const t = parseTicker({ XXBTZEUR: { c: ['55000.1', '0.01'], b: ['54999', '1', '1.0'], a: ['55001', '1', '1.0'] }, SOLEUR: { c: ['0', '0'] }, UNKNOWN: { c: ['1'] } }, pairs);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ base: 'BTC', quote: 'EUR', last: 55000.1, bid: 54999, ask: 55001 });
    expect(t[1]).toMatchObject({ base: 'SOL', quote: 'EUR', last: null });
  });
});
