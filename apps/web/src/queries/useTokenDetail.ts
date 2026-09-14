import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { tokensApi } from '@/api/tokens.api';
import { qk } from './keys';

export function useToken(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.token(id.value)), queryFn: () => tokensApi.get(id.value), staleTime: 55_000, refetchInterval: 60_000 });
}
export function useHealth(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.health(id.value)), queryFn: () => tokensApi.health(id.value), staleTime: 5 * 60_000 });
}
export function useMarket(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.market(id.value)), queryFn: () => tokensApi.market(id.value), staleTime: 55_000, refetchInterval: 60_000 });
}
export function useSupply(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.supply(id.value)), queryFn: () => tokensApi.supply(id.value), staleTime: 5 * 60_000, refetchInterval: 15 * 60_000 });
}
export function useHolders(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.holders(id.value)), queryFn: () => tokensApi.holders(id.value), staleTime: 5 * 60_000 });
}
export function useDivergences(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.divergences(id.value)), queryFn: () => tokensApi.divergences(id.value), staleTime: 5 * 60_000 });
}
export function useHistory(id: Ref<number>, days: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.history(id.value, days.value)), queryFn: () => tokensApi.history(id.value, days.value), staleTime: 5 * 60_000 });
}
export function useSlippage(id: Ref<number>, enabled: Ref<boolean>) {
  return useQuery({ queryKey: computed(() => ['tokens', id.value, 'slippage'] as const), queryFn: () => tokensApi.slippage(id.value), enabled, staleTime: 55_000 });
}
export function useCreator(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.creator(id.value)), queryFn: () => tokensApi.creator(id.value), staleTime: 30 * 60_000 });
}

export function useTokenRefresh(id: Ref<number>) {
  const qc = useQueryClient();
  return {
    holders: useMutation({
      mutationFn: () => tokensApi.refreshHolders(id.value),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.holders(id.value) });
        qc.invalidateQueries({ queryKey: qk.divergences(id.value) });
      },
    }),
    health: useMutation({
      mutationFn: () => tokensApi.refreshHealth(id.value),
      onSuccess: () => qc.invalidateQueries({ queryKey: qk.health(id.value) }),
    }),
  };
}
