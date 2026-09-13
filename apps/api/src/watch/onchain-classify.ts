import type { OnchainAction } from '@tpm/shared';

export interface ClassifiedAction { kind: OnchainAction['kind']; amount: number | null; counterparty: string | null; counterpartyLabel: string | null; description: string | null }

/** Classe une transaction Helius Enhanced du point de vue d'un wallet et d'un mint donnés. */
export function classifyHeliusTx(tx: any, wallet: string, mint: string, labelOf: (addr: string) => string | null): ClassifiedAction | null {
  const type = String(tx?.type ?? '').toUpperCase();
  const transfers: any[] = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
  const mine = transfers.filter((t) => t.mint === mint);
  const out = mine.filter((t) => t.fromUserAccount === wallet);
  const inn = mine.filter((t) => t.toUserAccount === wallet);
  const sum = (l: any[]) => l.reduce((n, t) => n + Number(t.tokenAmount ?? 0), 0);
  const description = typeof tx?.description === 'string' ? tx.description : null;
  const dex = tx?.source ? `dex:${String(tx.source).toLowerCase()}` : null;

  if (type === 'BURN' || (out.length && out.every((t) => !t.toUserAccount))) return { kind: 'burn', amount: sum(out) || null, counterparty: null, counterpartyLabel: 'burn', description };
  if (type === 'SWAP') {
    if (out.length && !inn.length) return { kind: 'swap_sell', amount: sum(out), counterparty: tx?.source ?? null, counterpartyLabel: dex, description };
    if (inn.length && !out.length) return { kind: 'swap_buy', amount: sum(inn), counterparty: tx?.source ?? null, counterpartyLabel: dex, description };
  }
  if (type === 'WITHDRAW_LIQUIDITY') return { kind: 'lp_remove', amount: sum(inn) || null, counterparty: tx?.source ?? null, counterpartyLabel: dex, description };
  if (type === 'ADD_LIQUIDITY' || type === 'CREATE_POOL') return { kind: 'lp_add', amount: sum(out) || null, counterparty: tx?.source ?? null, counterpartyLabel: dex, description };
  if (type === 'TOKEN_MINT' && inn.length) return { kind: 'mint', amount: sum(inn), counterparty: null, counterpartyLabel: null, description };
  if (out.length) {
    const to = out[0]?.toUserAccount ?? null;
    return { kind: 'transfer_out', amount: sum(out), counterparty: to, counterpartyLabel: to ? labelOf(to) ?? 'wallet' : null, description };
  }
  if (inn.length) {
    const from = inn[0]?.fromUserAccount ?? null;
    return { kind: 'transfer_in', amount: sum(inn), counterparty: from, counterpartyLabel: from ? labelOf(from) ?? 'wallet' : null, description };
  }
  return null;
}
