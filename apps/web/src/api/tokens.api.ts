import type { Divergence, HoldersView, MarketMetricsView, SlippageEstimate, SupplyView, Token, TokenHealth, TokenHistoryView, WatchlistItem } from '@tpm/shared';
import { http } from './http.js';

export interface CreatorView {
  creatorAddress: string | null; available: boolean; missingVariable: string | null; source: string; fetchedAt: number | null;
  activities: { signature: string; ts: number; kind: string; description: string | null; amount: number | null; amountUsd: number | null; source: string }[];
}

export const tokensApi = {
  list: () => http.get<WatchlistItem[]>('/tokens'),
  add: (address: string) => http.post<Token>('/tokens', { address }),
  remove: (id: number) => http.delete<void>(`/tokens/${id}`),
  reorder: (ids: number[]) => http.patch<WatchlistItem[]>('/tokens/order', { ids }),
  get: (id: number) => http.get<WatchlistItem>(`/tokens/${id}`),
  health: (id: number) => http.get<TokenHealth>(`/tokens/${id}/health`),
  refreshHealth: (id: number) => http.post<TokenHealth>(`/tokens/${id}/health/refresh`),
  market: (id: number) => http.get<MarketMetricsView>(`/tokens/${id}/market`),
  slippage: (id: number) => http.get<{ sizes: SlippageEstimate[]; history: { ts: number; orderUsd: number; impactPct: number | null; method: string }[] }>(`/tokens/${id}/slippage`),
  supply: (id: number) => http.get<SupplyView>(`/tokens/${id}/supply`),
  holders: (id: number) => http.get<HoldersView>(`/tokens/${id}/holders`),
  refreshHolders: (id: number) => http.post<HoldersView>(`/tokens/${id}/holders/refresh`),
  divergences: (id: number) => http.get<Divergence[]>(`/tokens/${id}/divergences`),
  history: (id: number, days: number) => http.get<TokenHistoryView>(`/tokens/${id}/history?days=${days}`),
  creator: (id: number) => http.get<CreatorView>(`/tokens/${id}/creator`),
};
