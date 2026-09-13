import { z } from 'zod';

/** Défauts versionnés du module veille. Incrémenter WATCH_DEFAULTS_VERSION à chaque changement de valeur. */
export const WATCH_DEFAULTS_VERSION = 1;

export const WatchSettings = z.object({
  associationWindowH: z.number().min(1).max(720),
  similarityThreshold: z.number().min(0.1).max(1),
  volatileAfterChanges: z.number().int().min(2).max(20),
  notifyContentChanges: z.boolean(),
  headlessWaitMs: z.number().int().min(0).max(30000),
  pageCheckIntervalS: z.number().int().min(600),
  newsIntervalS: z.number().int().min(600),
  onchainIntervalS: z.number().int().min(300),
  pricePredictionMaxTokenAgeDays: z.number().int().min(1),
  claimExpiryDays: z.number().int().min(1),
  teamTransferMinPctSupply: z.number().min(0),
  teamTransferMinUsd: z.number().min(0),
  teamSellMinPctSupply: z.number().min(0),
  tokenomicsKeywords: z.array(z.string().min(2)),
  prWireDomains: z.array(z.string().min(3)),
  sponsoredPatterns: z.array(z.string().min(2)),
  exchangeFeeds: z.array(z.object({ name: z.string(), url: z.string().url() })),
  incineratorAddresses: z.array(z.string().min(32)),
  userAgentContact: z.string().optional(),
});
export type WatchSettings = z.infer<typeof WatchSettings>;

export const WATCH_DEFAULTS: WatchSettings = {
  associationWindowH: 48,
  similarityThreshold: 0.6,
  volatileAfterChanges: 3,
  notifyContentChanges: true,
  headlessWaitMs: 3000,
  pageCheckIntervalS: 6 * 3600,
  newsIntervalS: 3600,
  onchainIntervalS: 900,
  pricePredictionMaxTokenAgeDays: 90,
  claimExpiryDays: 30,
  teamTransferMinPctSupply: 0.5,
  teamTransferMinUsd: 10_000,
  teamSellMinPctSupply: 1,
  tokenomicsKeywords: [
    'tax', 'taxe', 'fee', 'frais', 'redistribu', 'reward', 'récompense', 'recompense', 'burn', 'brûl', 'brul',
    'supply', 'offre', 'holder', 'détenteur', 'detenteur', 'lp', 'liquidit', 'lock', 'verrou', 'vesting',
    'allocation', 'team', 'équipe', 'equipe', 'treasury', 'trésorerie', 'tresorerie', 'airdrop', 'buyback', 'rachat',
    'tokenomic', 'apy', 'apr', 'staking', 'dividend',
  ],
  prWireDomains: [
    'globenewswire.com', 'prnewswire.com', 'accesswire.com', 'businesswire.com', 'newsfilecorp.com', 'chainwire.org',
    'einpresswire.com', 'issuewire.com', 'openpr.com', 'prlog.org', 'marketwatch.com/press-release',
    'cointelegraph.com/press-releases', 'bitcoinist.com/press-release', 'newsbtc.com/press-releases',
    'cryptonews.com/news/pr', 'coincodex.com/article/press', 'techbullion.com', 'analyticsinsight.net',
  ],
  sponsoredPatterns: ['sponsored', 'sponsorisé', 'sponsorise', 'partner content', 'paid partnership', 'contenu partenaire', 'made with ai', 'advertorial', 'publi-rédactionnel', 'press release', 'communiqué de presse'],
  exchangeFeeds: [
    { name: 'Kraken blog', url: 'https://blog.kraken.com/feed' },
  ],
  incineratorAddresses: ['1nc1nerator11111111111111111111111111111111'],
};
