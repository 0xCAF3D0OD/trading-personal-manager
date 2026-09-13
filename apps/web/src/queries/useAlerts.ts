import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { CreateAlertInput, UpdateAlertInput } from '@tpm/shared';
import { computed, type Ref } from 'vue';
import { alertsApi } from '@/api/alerts.api';
import { qk } from './keys';

export function useAlerts(tokenId?: Ref<number | undefined>) {
  return useQuery({
    queryKey: computed(() => qk.alerts(tokenId?.value)),
    queryFn: () => alertsApi.list(tokenId?.value), staleTime: 30_000, refetchInterval: 60_000,
  });
}
export function useAlertEvents(tokenId?: Ref<number | undefined>) {
  return useQuery({
    queryKey: computed(() => qk.alertEvents(tokenId?.value)),
    queryFn: () => alertsApi.events(tokenId?.value), staleTime: 30_000, refetchInterval: 60_000,
  });
}
export function useAlertMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ['alerts'] });
  return {
    create: useMutation({ mutationFn: (i: CreateAlertInput) => alertsApi.create(i), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: number; patch: UpdateAlertInput }) => alertsApi.update(id, patch), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: number) => alertsApi.remove(id), onSuccess: inv }),
    ack: useMutation({ mutationFn: (id: number) => alertsApi.ack(id), onSuccess: inv }),
    test: useMutation({ mutationFn: () => alertsApi.test() }),
    evaluate: useMutation({ mutationFn: () => alertsApi.evaluate(), onSuccess: inv }),
  };
}
