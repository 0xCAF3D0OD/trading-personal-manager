import type { Plan, PlanInput, PlanRevision } from '@tpm/shared';
import { http } from './http.js';

export const plansApi = {
  list: (tokenId: number) => http.get<{ plans: Plan[]; revisions: PlanRevision[] }>(`/tokens/${tokenId}/plans`),
  create: (tokenId: number, input: PlanInput) => http.post<Plan>(`/tokens/${tokenId}/plans`, input),
};
