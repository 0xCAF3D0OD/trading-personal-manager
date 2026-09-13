import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { CreateClaimInput, CreateTeamWalletInput, CreateWatchSourceInput, ResolveClaimInput, UpdateWatchSourceInput } from '@tpm/shared';
import { computed, type Ref } from 'vue';
import { watchApi } from '@/api/watch.api';

const k = {
  overview: (id: number) => ['watch', id, 'overview'] as const,
  changes: (id: number) => ['watch', id, 'changes'] as const,
  claims: (id: number, status?: string) => ['watch', id, 'claims', status ?? 'all'] as const,
  news: (id: number, kinds: string) => ['watch', id, 'news', kinds] as const,
  wallets: (id: number) => ['watch', id, 'wallets'] as const,
  onchain: (id: number) => ['watch', id, 'onchain'] as const,
  timeline: (id: number) => ['watch', id, 'timeline'] as const,
  snapshots: (sid: number) => ['watch', 'snapshots', sid] as const,
  settings: (m: string) => ['settings', m] as const,
};

/** Rafraîchissement toutes les 5 minutes, aligné sur les jobs. Pas de flux temps réel : c'est voulu. */
const FIVE_MIN = 5 * 60_000;

export function useWatchOverview(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => k.overview(id.value)), queryFn: () => watchApi.overview(id.value), staleTime: 60_000, refetchInterval: FIVE_MIN });
}
export function useWatchChanges(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => k.changes(id.value)), queryFn: () => watchApi.changes(id.value), staleTime: 60_000, refetchInterval: FIVE_MIN });
}
export function useClaims(id: Ref<number>, status: Ref<string | undefined>) {
  return useQuery({ queryKey: computed(() => k.claims(id.value, status.value)), queryFn: () => watchApi.claims(id.value, status.value), staleTime: 60_000 });
}
export function useNews(id: Ref<number>, kinds: string) {
  return useQuery({ queryKey: computed(() => k.news(id.value, kinds)), queryFn: () => watchApi.news(id.value, kinds), staleTime: FIVE_MIN, refetchInterval: FIVE_MIN });
}
export function useTeamWallets(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => k.wallets(id.value)), queryFn: () => watchApi.wallets(id.value), staleTime: FIVE_MIN });
}
export function useOnchain(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => k.onchain(id.value)), queryFn: () => watchApi.onchain(id.value), staleTime: FIVE_MIN, refetchInterval: FIVE_MIN });
}
export function useTimeline(id: Ref<number>) {
  return useQuery({ queryKey: computed(() => k.timeline(id.value)), queryFn: () => watchApi.timeline(id.value), staleTime: FIVE_MIN, refetchInterval: FIVE_MIN });
}
export function useSnapshots(sourceId: Ref<number | null>) {
  return useQuery({ queryKey: computed(() => k.snapshots(sourceId.value ?? 0)), queryFn: () => watchApi.snapshots(sourceId.value as number), enabled: computed(() => sourceId.value !== null) });
}
export function useModuleSettings(module: string) {
  return useQuery({ queryKey: k.settings(module), queryFn: () => watchApi.settings(module), staleTime: FIVE_MIN });
}

export function useWatchMutations(id: Ref<number>) {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ['watch', id.value] });
  return {
    createSource: useMutation({ mutationFn: (i: CreateWatchSourceInput) => watchApi.createSource(id.value, i), onSuccess: inv }),
    updateSource: useMutation({ mutationFn: ({ sid, patch }: { sid: number; patch: UpdateWatchSourceInput }) => watchApi.updateSource(sid, patch), onSuccess: inv }),
    deleteSource: useMutation({ mutationFn: (sid: number) => watchApi.deleteSource(sid), onSuccess: inv }),
    discover: useMutation({ mutationFn: (sid: number) => watchApi.discover(sid), onSuccess: inv }),
    checkNow: useMutation({ mutationFn: (sid: number) => watchApi.checkNow(sid), onSuccess: inv }),
    reviewChange: useMutation({ mutationFn: ({ cid, note }: { cid: number; note: string | null }) => watchApi.reviewChange(cid, note), onSuccess: inv }),
    draft: useMutation({ mutationFn: (i: { text: string; publishedAt: number | null; url: string | null }) => watchApi.draft(id.value, i.text, i.publishedAt, i.url) }),
    draftFromX: useMutation({ mutationFn: (url: string) => watchApi.draftFromX(id.value, url) }),
    createClaim: useMutation({ mutationFn: (i: CreateClaimInput) => watchApi.createClaim(id.value, i), onSuccess: inv }),
    resolveClaim: useMutation({ mutationFn: ({ cid, input }: { cid: number; input: ResolveClaimInput }) => watchApi.resolveClaim(cid, input), onSuccess: inv }),
    addWallet: useMutation({ mutationFn: (i: CreateTeamWalletInput) => watchApi.addWallet(id.value, i), onSuccess: inv }),
    removeWallet: useMutation({ mutationFn: (wid: number) => watchApi.removeWallet(id.value, wid), onSuccess: inv }),
    saveSettings: useMutation({ mutationFn: ({ settings, note }: { settings: unknown; note: string | null }) => watchApi.updateSettings('watch', settings, note), onSuccess: () => qc.invalidateQueries({ queryKey: k.settings('watch') }) }),
    resetSettings: useMutation({ mutationFn: () => watchApi.resetSettings('watch'), onSuccess: () => qc.invalidateQueries({ queryKey: k.settings('watch') }) }),
  };
}
