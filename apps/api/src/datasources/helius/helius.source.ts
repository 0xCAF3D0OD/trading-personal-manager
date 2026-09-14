import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';
import type { CreatorActivity, HoldersResult, RawHolder } from '../types.js';

interface DasTokenAccount { address: string; mint: string; owner: string; amount: number | string; frozen?: boolean }
interface DasResult { total: number; limit: number; cursor?: string | null; token_accounts: DasTokenAccount[] }

const RELEVANT_TYPES = new Set(['SWAP', 'TRANSFER', 'WITHDRAW_LIQUIDITY', 'ADD_LIQUIDITY', 'BURN', 'TOKEN_MINT', 'CREATE_POOL']);

export class HeliusSource {
  private id = 1;
  constructor(
    private readonly deps: HttpDeps,
    private readonly rpcUrl: string,
    private readonly apiKey: string | undefined,
    private readonly maxPages: number,
  ) {}

  get enhancedAvailable(): boolean {
    return !!this.apiKey;
  }

  /** Tous les comptes token d'un mint via DAS getTokenAccounts (1000 / page, curseur). */
  async getAllHolders(mint: string, decimals: number): Promise<HoldersResult> {
    const byOwner = new Map<string, RawHolder>();
    let cursor: string | undefined;
    let pages = 0;
    let truncated = false;
    for (;;) {
      const body = JSON.stringify({
        jsonrpc: '2.0', id: this.id++, method: 'getTokenAccounts',
        params: { mint, limit: 1000, ...(cursor ? { cursor } : {}), options: { showZeroBalance: false } },
      });
      const res = await fetchJson<{ result?: DasResult; error?: { message: string } }>(
        this.deps, 'helius', 'getTokenAccounts', this.rpcUrl,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body },
      );
      if (res.error) throw new Error(`Helius getTokenAccounts : ${res.error.message}`);
      const result = res.result;
      if (!result) break;
      for (const a of result.token_accounts) {
        const amount = Number(a.amount) / 10 ** decimals;
        if (amount <= 0) continue;
        // Agrégation par propriétaire : un wallet peut avoir plusieurs comptes token.
        const prev = byOwner.get(a.owner);
        if (prev) prev.amount += amount;
        else byOwner.set(a.owner, { account: a.address, owner: a.owner, amount });
      }
      pages++;
      if (!result.cursor || result.token_accounts.length < 1000) break;
      if (pages >= this.maxPages) { truncated = true; break; }
      cursor = result.cursor;
    }
    const holders = [...byOwner.values()].sort((a, b) => b.amount - a.amount);
    return { holders, totalHolders: truncated ? null : holders.length, truncated, source: 'helius', cuSpent: 0 };
  }

  /** Nombre de tokens fongibles créés par une adresse (DAS searchAssets), plafonné à 1000. */
  async countFungibleByCreator(creator: string): Promise<number> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: this.id++, method: 'searchAssets', params: { creatorAddress: creator, tokenType: 'fungible', limit: 1000, page: 1 } });
    const res = await fetchJson<{ result?: { items?: unknown[]; total?: number }; error?: { message: string } }>(
      this.deps, 'helius', 'searchAssets', this.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body },
    );
    if (res.error) throw new Error(`Helius searchAssets : ${res.error.message}`);
    return res.result?.items?.length ?? res.result?.total ?? 0;
  }

  /** Transactions parsées d'un wallet (API Enhanced Transactions). */
  async getAddressActivities(address: string, tokenMint: string, limit = 100): Promise<CreatorActivity[]> {
    if (!this.apiKey) throw new Error('HELIUS_API_KEY absent');
    const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${encodeURIComponent(this.apiKey)}&limit=${limit}`;
    const txs = await fetchJson<any[]>(this.deps, 'helius', 'enhanced-transactions', url);
    const out: CreatorActivity[] = [];
    for (const tx of txs ?? []) {
      const type = String(tx.type ?? 'UNKNOWN');
      if (!RELEVANT_TYPES.has(type)) continue;
      const transfers: any[] = Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : [];
      const tokenTransfers = transfers.filter((t) => t.mint === tokenMint);
      const involvesToken = tokenTransfers.length > 0;
      const amount = tokenTransfers.reduce((n, t) => n + Number(t.tokenAmount ?? 0), 0) || null;
      out.push({
        signature: String(tx.signature), ts: Number(tx.timestamp ?? 0), kind: type.toLowerCase(),
        description: typeof tx.description === 'string' ? tx.description : null,
        amount, amountUsd: null, involvesToken, raw: tx,
      });
    }
    return out;
  }
}
