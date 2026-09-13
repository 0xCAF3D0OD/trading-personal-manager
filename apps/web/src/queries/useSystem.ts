import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { systemApi } from '@/api/system.api';
import { qk } from './keys';

export function useSources() {
  return useQuery({ queryKey: qk.sources, queryFn: () => systemApi.sources(), staleTime: 30_000, refetchInterval: 60_000 });
}
export function useUsage() {
  return useQuery({ queryKey: qk.usage, queryFn: () => systemApi.usage(), staleTime: 30_000, refetchInterval: 60_000 });
}
export function useRunJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: 'market-snapshot' | 'holder-snapshot') => systemApi.runJob(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.usage }); qc.invalidateQueries({ queryKey: ['tokens'] }); },
  });
}
