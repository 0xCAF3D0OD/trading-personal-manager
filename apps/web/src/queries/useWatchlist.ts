import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { tokensApi } from '@/api/tokens.api';
import { qk } from './keys';

/** staleTime aligné sur le TTL prix backend (60 s) : le polling front ne déclenche jamais d'appel externe. */
export function useWatchlist() {
  return useQuery({ queryKey: qk.watchlist, queryFn: () => tokensApi.list(), staleTime: 55_000, refetchInterval: 60_000 });
}

export function useWatchlistMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.watchlist });
  return {
    add: useMutation({ mutationFn: (address: string) => tokensApi.add(address), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: number) => tokensApi.remove(id), onSuccess: invalidate }),
    reorder: useMutation({ mutationFn: (ids: number[]) => tokensApi.reorder(ids), onSuccess: invalidate }),
  };
}
