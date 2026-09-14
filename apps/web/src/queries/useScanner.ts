import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { scannerApi } from '@/api/scanner.api';

/** Rafraîchissement toutes les 5 minutes, aligné sur le job. Pas de flux temps réel : c'est voulu. */
const FIVE_MIN = 5 * 60_000;

export function useScannerOverview() { return useQuery({ queryKey: ['scanner', 'overview'], queryFn: () => scannerApi.overview(), staleTime: 60_000, refetchInterval: FIVE_MIN }); }
export function useScanResults(days: Ref<number>) { return useQuery({ queryKey: computed(() => ['scanner', 'results', days.value]), queryFn: () => scannerApi.results(days.value), staleTime: 60_000, refetchInterval: FIVE_MIN }); }
export function useScanExcluded(days: Ref<number>) { return useQuery({ queryKey: computed(() => ['scanner', 'excluded', days.value]), queryFn: () => scannerApi.excluded(days.value), staleTime: 60_000, refetchInterval: FIVE_MIN }); }
export function useScanRuns() { return useQuery({ queryKey: ['scanner', 'runs'], queryFn: () => scannerApi.runs(), staleTime: 60_000, refetchInterval: FIVE_MIN }); }
export function useScanRetro() { return useQuery({ queryKey: ['scanner', 'retro'], queryFn: () => scannerApi.retro(), staleTime: FIVE_MIN }); }
export function useScannerRun() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => scannerApi.run(), onSuccess: () => qc.invalidateQueries({ queryKey: ['scanner'] }) });
}
