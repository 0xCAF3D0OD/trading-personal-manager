import type {
  Claim, ClaimDraft, CreateClaimInput, CreateTeamWalletInput, CreateWatchSourceInput, NewsItem, OnchainAction, PageChange, PageSnapshot,
  ResolveClaimInput, SettingsEnvelope, SupplyEvent, TeamWallet, TimelineItem, UpdateWatchSourceInput, WatchOverview, WatchSource,
} from '@tpm/shared';
import { http } from './http.js';

export const watchApi = {
  overview: (tokenId: number) => http.get<WatchOverview>(`/tokens/${tokenId}/watch`),
  sources: (tokenId: number) => http.get<WatchSource[]>(`/tokens/${tokenId}/watch/sources`),
  createSource: (tokenId: number, input: CreateWatchSourceInput) => http.post<WatchSource>(`/tokens/${tokenId}/watch/sources`, input),
  updateSource: (id: number, patch: UpdateWatchSourceInput) => http.patch<WatchSource>(`/watch/sources/${id}`, patch),
  deleteSource: (id: number) => http.delete<void>(`/watch/sources/${id}`),
  discover: (id: number) => http.post<WatchSource>(`/watch/sources/${id}/discover`),
  checkNow: (id: number) => http.post<WatchSource>(`/watch/sources/${id}/check`),
  snapshots: (id: number) => http.get<PageSnapshot[]>(`/watch/sources/${id}/snapshots`),
  snapshot: (id: number) => http.get<PageSnapshot>(`/watch/snapshots/${id}`),
  changes: (tokenId: number) => http.get<PageChange[]>(`/tokens/${tokenId}/watch/changes`),
  reviewChange: (id: number, note: string | null) => http.post<PageChange>(`/watch/changes/${id}/review`, { note }),
  claims: (tokenId: number, status?: string) => http.get<Claim[]>(`/tokens/${tokenId}/claims${status ? `?status=${status}` : ''}`),
  draft: (tokenId: number, text: string, publishedAt: number | null, url: string | null) => http.post<ClaimDraft>(`/tokens/${tokenId}/claims/draft`, { text, publishedAt, url }),
  draftFromX: (tokenId: number, url: string) => http.post<ClaimDraft>(`/tokens/${tokenId}/claims/draft-from-x`, { url }),
  createClaim: (tokenId: number, input: CreateClaimInput) => http.post<Claim>(`/tokens/${tokenId}/claims`, input),
  resolveClaim: (id: number, input: ResolveClaimInput) => http.post<Claim>(`/claims/${id}/resolve`, input),
  news: (tokenId: number, kinds: string) => http.get<NewsItem[]>(`/tokens/${tokenId}/news?kinds=${kinds}`),
  wallets: (tokenId: number) => http.get<TeamWallet[]>(`/tokens/${tokenId}/team-wallets`),
  addWallet: (tokenId: number, input: CreateTeamWalletInput) => http.post<TeamWallet[]>(`/tokens/${tokenId}/team-wallets`, input),
  removeWallet: (tokenId: number, id: number) => http.delete<TeamWallet[]>(`/tokens/${tokenId}/team-wallets/${id}`),
  onchain: (tokenId: number, days = 30) => http.get<{ available: boolean; actions: OnchainAction[]; supplyEvents: SupplyEvent[] }>(`/tokens/${tokenId}/onchain?days=${days}`),
  timeline: (tokenId: number, days = 60) => http.get<TimelineItem[]>(`/tokens/${tokenId}/timeline?days=${days}`),
  settings: (module: string) => http.get<SettingsEnvelope>(`/settings/${module}`),
  updateSettings: (module: string, settings: unknown, note: string | null) => http.put<SettingsEnvelope>(`/settings/${module}`, { settings, note }),
  resetSettings: (module: string) => http.post<SettingsEnvelope>(`/settings/${module}/reset`),
};
