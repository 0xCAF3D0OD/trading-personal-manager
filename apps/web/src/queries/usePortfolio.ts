import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { portfolioApi } from '@/api/portfolio.api';

/** Le serveur relit Kraken au plus toutes les 15 min ; le front se contente de relire le cache. */
export function usePortfolio() {
  return useQuery({ queryKey: ['portfolio'], queryFn: () => portfolioApi.view(), staleTime: 60_000, refetchInterval: 5 * 60_000 });
}
export function usePortfolioHistory(days: Ref<number>) {
  return useQuery({ queryKey: computed(() => ['portfolio', 'history', days.value]), queryFn: () => portfolioApi.history(days.value), staleTime: 5 * 60_000 });
}
export function usePortfolioRefresh() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => portfolioApi.refresh(), onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio'] }) });
}
