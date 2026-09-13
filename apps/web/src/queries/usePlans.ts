import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { PlanInput } from '@tpm/shared';
import { computed, type Ref } from 'vue';
import { plansApi } from '@/api/plans.api';
import { qk } from './keys';

export function usePlans(tokenId: Ref<number>) {
  return useQuery({ queryKey: computed(() => qk.plans(tokenId.value)), queryFn: () => plansApi.list(tokenId.value) });
}

export function useCreatePlan(tokenId: Ref<number>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanInput) => plansApi.create(tokenId.value, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.plans(tokenId.value) });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
