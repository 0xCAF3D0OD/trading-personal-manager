import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { CreateAiReportInput } from '@tpm/shared';
import { computed, type Ref } from 'vue';
import { tokensApi } from '@/api/tokens.api';

export function useDossier(id: Ref<number>, enabled: Ref<boolean>) {
  return useQuery({ queryKey: computed(() => ['tokens', id.value, 'dossier'] as const), queryFn: () => tokensApi.dossier(id.value), enabled, staleTime: 60_000 });
}
export function useReports(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => ['tokens', id.value, 'reports'] as const), queryFn: () => tokensApi.reports(id.value), staleTime: 60_000 });
}
export function useCreateReport(id: Ref<number>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: CreateAiReportInput) => tokensApi.createReport(id.value, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['tokens', id.value, 'reports'] }) });
}
