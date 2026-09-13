import { z } from 'zod';

export const WatchSourceKind = z.enum(['website', 'docs', 'github', 'x_account', 'news_query', 'exchange_feed']);
export type WatchSourceKind = z.infer<typeof WatchSourceKind>;
export const WatchSourceMode = z.enum(['html', 'json_api', 'headless']);
export type WatchSourceMode = z.infer<typeof WatchSourceMode>;

export const DiscoveredEndpoint = z.object({
  url: z.string(),
  status: z.number(),
  size: z.number(),
  contentType: z.string().nullable(),
  topKeys: z.array(z.string()),
  preview: z.string(),
  score: z.number(),
});
export type DiscoveredEndpoint = z.infer<typeof DiscoveredEndpoint>;

export const WatchSource = z.object({
  id: z.number(),
  tokenId: z.number(),
  kind: WatchSourceKind,
  label: z.string(),
  url: z.string().nullable(),
  handle: z.string().nullable(),
  mode: WatchSourceMode,
  apiUrl: z.string().nullable(),
  jsonPointer: z.string().nullable(),
  discoveredEndpoints: z.array(DiscoveredEndpoint),
  renderWaitMs: z.number().nullable(),
  enabled: z.boolean(),
  checkIntervalS: z.number(),
  nextCheckAt: z.number(),
  lastCheckedAt: z.number().nullable(),
  lastStatus: z.string().nullable(),
  lastError: z.string().nullable(),
  volatileLines: z.array(z.object({ key: z.string(), sample: z.string(), changes: z.number() })),
  automated: z.boolean(),
  addedAt: z.number(),
  note: z.string().nullable(),
  meta: z.record(z.unknown()).nullable(),
});
export type WatchSource = z.infer<typeof WatchSource>;

export const CreateWatchSourceInput = z.object({
  kind: WatchSourceKind,
  label: z.string().min(1).max(80),
  url: z.string().url().optional(),
  handle: z.string().min(1).max(60).optional(),
  checkIntervalS: z.number().int().min(600).optional(),
  note: z.string().max(500).optional(),
});
export type CreateWatchSourceInput = z.infer<typeof CreateWatchSourceInput>;

export const UpdateWatchSourceInput = z.object({
  label: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  checkIntervalS: z.number().int().min(600).optional(),
  mode: WatchSourceMode.optional(),
  apiUrl: z.string().url().nullable().optional(),
  jsonPointer: z.string().nullable().optional(),
  renderWaitMs: z.number().int().min(0).max(30000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  removeVolatileKey: z.string().optional(),
});
export type UpdateWatchSourceInput = z.infer<typeof UpdateWatchSourceInput>;

export const Hunk = z.object({
  op: z.enum(['added', 'removed', 'changed']),
  path: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});
export type Hunk = z.infer<typeof Hunk>;

export const NumericChange = z.object({
  path: z.string(),
  before: z.string(),
  after: z.string(),
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  unit: z.string().nullable(),
  keywords: z.array(z.string()),
});
export type NumericChange = z.infer<typeof NumericChange>;

export const ChangeSeverity = z.enum(['tokenomics', 'content', 'minor']);
export type ChangeSeverity = z.infer<typeof ChangeSeverity>;

export const PageChange = z.object({
  id: z.number(),
  sourceId: z.number(),
  sourceLabel: z.string(),
  sourceUrl: z.string().nullable(),
  tokenId: z.number(),
  fromSnapshotId: z.number(),
  toSnapshotId: z.number(),
  detectedAt: z.number(),
  severity: ChangeSeverity,
  hunks: z.array(Hunk),
  numericChanges: z.array(NumericChange),
  announced: z.boolean().nullable(),
  announcedClaimId: z.number().nullable(),
  announceCheckDueAt: z.number().nullable(),
  unannouncedFlag: z.boolean(),
  alertSentAt: z.number().nullable(),
  unannouncedAlertSentAt: z.number().nullable(),
  reviewedAt: z.number().nullable(),
  reviewNote: z.string().nullable(),
});
export type PageChange = z.infer<typeof PageChange>;

export const PageSnapshot = z.object({
  id: z.number(),
  sourceId: z.number(),
  fetchedAt: z.number(),
  mode: WatchSourceMode,
  contentHash: z.string(),
  title: z.string().nullable(),
  finalUrl: z.string().nullable(),
  lines: z.array(z.object({ path: z.string(), text: z.string() })),
});
export type PageSnapshot = z.infer<typeof PageSnapshot>;

export const ClaimType = z.enum(['tokenomics', 'product', 'partnership', 'listing', 'governance', 'other']);
export type ClaimType = z.infer<typeof ClaimType>;
export const ClaimStatus = z.enum(['pending', 'kept', 'contradicted', 'expired']);
export type ClaimStatus = z.infer<typeof ClaimStatus>;
export const ClaimOrigin = z.enum(['manual', 'x_oembed', 'x_api', 'website', 'github_release', 'news', 'onchain']);
export type ClaimOrigin = z.infer<typeof ClaimOrigin>;
export const VerificationKind = z.enum(['supply_decrease', 'lp_lock', 'wallet_transfer', 'holders_growth', 'page_content']);
export type VerificationKind = z.infer<typeof VerificationKind>;

export const ExtractedNumber = z.object({ value: z.number(), unit: z.string().nullable(), raw: z.string(), context: z.string() });
export type ExtractedNumber = z.infer<typeof ExtractedNumber>;

export const Claim = z.object({
  id: z.number(),
  tokenId: z.number(),
  sourceId: z.number().nullable(),
  origin: ClaimOrigin,
  publishedAt: z.number(),
  capturedAt: z.number(),
  url: z.string().nullable(),
  author: z.string().nullable(),
  text: z.string(),
  type: ClaimType,
  subtype: z.string().nullable(),
  status: ClaimStatus,
  dueAt: z.number().nullable(),
  extractedNumbers: z.array(ExtractedNumber),
  verificationKind: VerificationKind.nullable(),
  verificationRef: z.string().nullable(),
  verificationNote: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  resolvedBy: z.enum(['manual', 'auto']).nullable(),
  linkedChangeId: z.number().nullable(),
});
export type Claim = z.infer<typeof Claim>;

export const CreateClaimInput = z.object({
  text: z.string().min(3).max(5000),
  publishedAt: z.number().int(),
  url: z.string().url().optional().nullable(),
  author: z.string().max(120).optional().nullable(),
  type: ClaimType,
  subtype: z.string().max(40).optional().nullable(),
  dueAt: z.number().int().optional().nullable(),
  verificationKind: VerificationKind.optional().nullable(),
  verificationRef: z.string().max(200).optional().nullable(),
  origin: z.enum(['manual', 'x_oembed']).default('manual'),
  sourceId: z.number().int().optional().nullable(),
});
export type CreateClaimInput = z.infer<typeof CreateClaimInput>;

export const ResolveClaimInput = z.object({
  status: ClaimStatus,
  note: z.string().min(3).max(1000),
});
export type ResolveClaimInput = z.infer<typeof ResolveClaimInput>;

/** Proposition pré-remplie renvoyée par l'analyse d'un texte ou l'import oEmbed : rien n'est imposé. */
export const ClaimDraft = z.object({
  text: z.string(),
  publishedAt: z.number().nullable(),
  url: z.string().nullable(),
  author: z.string().nullable(),
  type: ClaimType,
  subtype: z.string().nullable(),
  dueAt: z.number().nullable(),
  extractedNumbers: z.array(ExtractedNumber),
  verificationKind: VerificationKind.nullable(),
});
export type ClaimDraft = z.infer<typeof ClaimDraft>;

export const NewsKind = z.enum(['news', 'listing', 'promo']);
export const NewsItem = z.object({
  id: z.number(),
  tokenId: z.number(),
  provider: z.string(),
  publishedAt: z.number(),
  fetchedAt: z.number(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  kind: NewsKind,
  promoFlags: z.array(z.object({ code: z.string(), detail: z.string() })),
});
export type NewsItem = z.infer<typeof NewsItem>;

export const TeamWalletLabel = z.enum(['creator', 'team', 'treasury', 'marketing', 'lp_owner', 'other']);
export const TeamWallet = z.object({
  id: z.number(),
  tokenId: z.number(),
  address: z.string(),
  label: TeamWalletLabel,
  source: z.enum(['auto', 'manual']),
  addedAt: z.number(),
  note: z.string().nullable(),
});
export type TeamWallet = z.infer<typeof TeamWallet>;
export const CreateTeamWalletInput = z.object({
  address: z.string().min(32).max(44),
  label: TeamWalletLabel,
  note: z.string().max(300).optional(),
});
export type CreateTeamWalletInput = z.infer<typeof CreateTeamWalletInput>;

export const OnchainActionKind = z.enum(['transfer_out', 'transfer_in', 'swap_sell', 'swap_buy', 'burn', 'lp_add', 'lp_remove', 'mint', 'authority_change', 'other']);
export const OnchainAction = z.object({
  id: z.number(),
  tokenId: z.number(),
  walletAddress: z.string(),
  walletLabel: z.string().nullable(),
  txSignature: z.string(),
  ts: z.number(),
  kind: OnchainActionKind,
  amount: z.number().nullable(),
  amountUsd: z.number().nullable(),
  counterparty: z.string().nullable(),
  counterpartyLabel: z.string().nullable(),
  source: z.string(),
});
export type OnchainAction = z.infer<typeof OnchainAction>;

export const SupplyEvent = z.object({
  id: z.number(),
  tokenId: z.number(),
  tsFrom: z.number(),
  tsTo: z.number(),
  supplyBefore: z.number(),
  supplyAfter: z.number(),
  delta: z.number(),
  deltaPct: z.number(),
  kind: z.enum(['burn', 'mint']),
});
export type SupplyEvent = z.infer<typeof SupplyEvent>;

export const TimelineItem = z.object({
  lane: z.enum(['said', 'done']),
  kind: z.string(),
  ts: z.number(),
  title: z.string(),
  detail: z.string().nullable(),
  refType: z.enum(['claim', 'news', 'onchain', 'supply', 'change']),
  refId: z.number(),
  url: z.string().nullable(),
  status: z.string().nullable(),
});
export type TimelineItem = z.infer<typeof TimelineItem>;

export const WatchOverview = z.object({
  sources: z.array(WatchSource),
  counts: z.object({ claimsPending: z.number(), changesUnreviewed: z.number(), promo: z.number(), news: z.number() }),
  rendererAvailable: z.boolean(),
  automatedSources: z.array(z.string()),
  manualSources: z.array(z.string()),
});
export type WatchOverview = z.infer<typeof WatchOverview>;

export const SettingsEnvelope = z.object({
  module: z.string(),
  settings: z.unknown(),
  defaultsVersion: z.number(),
  codeDefaultsVersion: z.number(),
  isDefault: z.boolean(),
  updatedAt: z.number(),
  history: z.array(z.object({ id: z.number(), createdAt: z.number(), isDefault: z.boolean(), note: z.string().nullable() })),
});
export type SettingsEnvelope = z.infer<typeof SettingsEnvelope>;
