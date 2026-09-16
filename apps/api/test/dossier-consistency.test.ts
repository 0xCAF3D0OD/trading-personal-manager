import { describe, expect, it } from 'vitest';
import type { MarketMetricsView, TokenHealth } from '@tpm/shared';
import type { PairInfo } from '../src/datasources/types.js';
import { nowS } from '../src/db/client.js';
import { insertToken, testServices } from './helpers.js';

/**
 * Cohérence interne du document produit (revue du 16/09/2026) : la synthèse (section 2, calculée sur la base)
 * et le corps (section 4, calculé sur la vue de marché) doivent citer les mêmes chiffres pour la même métrique.
 * Ce test aurait attrapé le « 1 % du pool = 271 212 $ » et le « prix 0,01 $ » d'un dossier réel.
 */
const MINT = 'So11111111111111111111111111111111111111112';
const now = nowS();
const view: MarketMetricsView = {
  price: { primary: { value: 0.0138, source: 'dexscreener', fetchedAt: now }, secondary: { value: 0.01409, source: 'jupiter', fetchedAt: now }, spreadPct: 2.11, spreadWarn: true, spreadConsecutiveOver: 1 },
  priceChange: { m5: 0.1, h1: 0.4, h6: 26.0, h24: -21.83 },
  momentum: { state: 'none', hourlyRates: { h24: -0.9, h6: 4.3, h1: 0.4, m5: 1.2 }, label: 'Sans tendance nette : —' },
  mcap: { sourceValue: 13_732_995, sourceName: 'dexscreener', sourceIsFdv: false, local: 13_732_995, fdvLocal: 13_732_995, fdvSource: null, gapPct: 0, gapWarn: false },
  supply: { minted: 993_450_000, incinerated: 0, net: 993_450_000, incineratorAddresses: [], source: 'rpc', fetchedAt: now },
  liquidity: { mainPoolUsd: 657_705.4, totalUsd: 1_929_252.18, poolsCount: 22, ratioPct: 4.789, band: 'thin', bandLabel: 'Liquidité mince, prix structurellement fragile', totalRatioPct: 14.05, totalBand: 'comfortable', totalBandLabel: 'Liquidité confortable', ignoredPools: 0, pools: [], source: 'dexscreener' },
  volume: { h24Usd: 3_820_000, mainPoolH24Usd: 2_817_115, source: 'dexscreener', toMcap: 0.278, band: 'low', bandLabel: 'Activité faible', ratioChange24hPct: null, ratioChange7dPct: null },
  pair: { dexId: 'raydium', pairAddress: 'Pool1', url: null, createdAt: null }, source: 'dexscreener', fetchedAt: now,
};
const pair: PairInfo = { dexId: 'raydium', pairAddress: 'Pool1', url: null, priceUsd: 0.0138, priceChange: { m5: 0.1, h1: 0.4, h6: 26, h24: -21.83 }, volume24hUsd: 2_817_115, volumeM5Usd: null, liquidityUsd: 657_705.4, fdvUsd: null, marketCapUsd: 13_732_995, pairCreatedAt: null, baseSymbol: 'TST', baseName: 'Test', anomalous: false };

describe('Cohérence interne du dossier', () => {
  it('la synthèse et le corps citent les mêmes chiffres : ratio du pool principal, repère de taille, variation 24 h, prix à 4 chiffres', async () => {
    const { db, services } = testServices();
    const id = insertToken(db, MINT);
    // Ce que le job de relevé aurait écrit à partir de la même vue, et ce que la carte Prix lit en cache.
    services.ctx.snapshots.insertMarket({
      tokenId: id, ts: now, priceUsd: view.price.primary.value, priceSource: 'dexscreener', priceAltUsd: 0.01409, priceAltSource: 'jupiter',
      marketCapUsd: view.mcap.local, fdvUsd: view.mcap.fdvLocal, volume24hUsd: view.volume.h24Usd, liquidityUsd: view.liquidity.mainPoolUsd,
      supplyCirc: view.supply.net, supplyTotal: view.supply.minted, supplySource: 'rpc',
      pctH24: view.priceChange.h24, liquidityToMcapPct: view.liquidity.ratioPct, poolsCount: view.liquidity.poolsCount, liquidityTotalUsd: view.liquidity.totalUsd,
    });
    services.ctx.cache.set(`ds:pairs:${MINT}`, [pair], 'dexscreener', now, 60);
    const health: TokenHealth = { tokenId: id, checkedAt: now, mintAuthority: null, freezeAuthority: null, program: 'spl-token', token2022Extensions: [], creatorAddress: null, creatorSource: 'unavailable', createdAt: now - 90 * 86400, createdAtSource: 'rpc', lpLocked: true, lpLockedPct: 100, lpLockProtocol: 'raydium_locker', lpLockSource: 'rugcheck', items: [] };
    services.ctx.health.upsert({ token_id: id, mint_authority: null, freeze_authority: null, token2022_extensions: '[]', lp_locked: 1, lp_locked_pct: 100, lp_lock_protocol: 'raydium_locker', lp_lock_source: 'rugcheck', checked_at: now });
    // Les sources réseau sont remplacées par la même vue figée : aucune requête ne sort.
    services.market.getView = async () => ({ value: view, cached: true });
    services.health.get = async () => ({ value: health, fetchedAt: now, cached: true, source: 'local' });
    services.supply.getView = async () => ({ value: { current: { supplyCirc: view.supply.net, supplyTotal: view.supply.minted, source: 'rpc', fetchedAt: now }, burnRates: [], series: [] }, cached: true });
    services.creator.get = async () => ({ value: { creatorAddress: null, available: false, missingVariable: null, source: 'unavailable', fetchedAt: null, activities: [] }, cached: true });

    const md = (await services.dossier.get(id)).markdown;
    const q2 = md.slice(md.indexOf('### 2.2'), md.indexOf('### 2.3'));
    const s4 = md.slice(md.indexOf('## 4. Marché'), md.indexOf('## 5.'));
    const q5 = md.slice(md.indexOf('### 2.5'), md.indexOf('## 3.'));

    // Même ratio du pool principal des deux côtés.
    expect(q2).toContain('4,8 % de la capitalisation');
    expect(s4).toMatch(/pool principal 657.71.k.\$ \(4,79 %/);
    // Le repère de taille vaut un centième du pool principal cité dans le corps.
    const marker = /Repère de taille : 1 % du pool principal = ([\d   ]+) \$/.exec(q2);
    expect(marker).not.toBeNull();
    expect(Number(marker![1]!.replace(/[^\d]/g, ''))).toBeCloseTo(Math.round(view.liquidity.mainPoolUsd! / 100), -1);
    // Même variation 24 h, même paire, même instant.
    expect(q5).toContain('-21,8 %');
    expect(s4).toContain('24 h -21,83 %');
    // Prix lisible.
    expect(s4).toContain('- Prix : 0,0138 $');
    // Jamais un pourcentage nul affiché comme un résultat.
    expect(md).not.toContain('0,00 %');
    expect(md).not.toMatch(/ 0,0 % de la capitalisation/);
  });
});
