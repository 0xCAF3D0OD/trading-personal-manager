import { z } from 'zod';
import { SourceName, Status } from './common.schema.js';

export const TokenProgram = z.enum(['spl-token', 'token-2022']);
export type TokenProgram = z.infer<typeof TokenProgram>;

export const Token = z.object({
  id: z.number(),
  address: z.string(),
  symbol: z.string().nullable(),
  name: z.string().nullable(),
  decimals: z.number(),
  program: TokenProgram,
  createdAt: z.number().nullable(),
  creatorAddress: z.string().nullable(),
  sortOrder: z.number(),
  addedAt: z.number(),
});
export type Token = z.infer<typeof Token>;

export const AddTokenInput = z.object({
  address: z.string().min(32).max(44),
});
export type AddTokenInput = z.infer<typeof AddTokenInput>;

export const ReorderInput = z.object({
  ids: z.array(z.number().int()).min(1),
});
export type ReorderInput = z.infer<typeof ReorderInput>;

/** Ligne de la watchlist : token + dernier snapshot marché. */
export const WatchlistItem = Token.extend({
  priceUsd: z.number().nullable(),
  priceSource: SourceName.nullable(),
  priceChange24hPct: z.number().nullable(),
  marketCapUsd: z.number().nullable(),
  volume24hUsd: z.number().nullable(),
  ageDays: z.number().nullable(),
  lastMarketTs: z.number().nullable(),
  lastHolderTs: z.number().nullable(),
});
export type WatchlistItem = z.infer<typeof WatchlistItem>;

export const HealthItem = z.object({
  key: z.string(),
  label: z.string(),
  status: Status,
  value: z.string().nullable(),
  detail: z.string().nullable(),
  source: SourceName,
});
export type HealthItem = z.infer<typeof HealthItem>;

export const TokenHealth = z.object({
  tokenId: z.number(),
  checkedAt: z.number(),
  mintAuthority: z.string().nullable(),
  freezeAuthority: z.string().nullable(),
  program: TokenProgram,
  token2022Extensions: z.array(z.string()),
  creatorAddress: z.string().nullable(),
  creatorSource: SourceName,
  createdAt: z.number().nullable(),
  createdAtSource: SourceName,
  lpLocked: z.boolean().nullable(),
  lpLockedPct: z.number().nullable(),
  lpLockProtocol: z.string().nullable(),
  lpLockSource: SourceName,
  items: z.array(HealthItem),
});
export type TokenHealth = z.infer<typeof TokenHealth>;
