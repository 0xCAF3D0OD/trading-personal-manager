import type { SourceName } from '@tpm/shared';
import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';
import type { CreatorInfo, MintInfo, RawHolder, SupplyInfo } from '../types.js';
import { metadataPda, parseMetadata } from './metaplex.js';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const BURN_ADDRESSES = new Set([
  '1nc1nerator11111111111111111111111111111111',
  '11111111111111111111111111111111',
  'deadbeef11111111111111111111111111111111111',
]);

interface RpcResponse<T> { result?: T; error?: { code: number; message: string } }

interface ParsedAccount {
  lamports: number;
  owner: string;
  data: { parsed?: { type: string; info: any }; program?: string } | [string, string];
  executable: boolean;
}

export class SolanaRpcSource {
  readonly name: SourceName;
  private id = 1;

  constructor(private readonly deps: HttpDeps, private readonly url: string, isHelius: boolean) {
    this.name = isHelius ? 'helius' : 'rpc';
  }

  async call<T>(method: string, params: unknown[], cu = 0): Promise<T> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: this.id++, method, params });
    const res = await fetchJson<RpcResponse<T>>(this.deps, 'rpc', method, this.url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cu,
    });
    if (res.error) throw new Error(`RPC ${method} : ${res.error.message} (${res.error.code})`);
    return res.result as T;
  }

  async getMintInfo(mint: string): Promise<MintInfo> {
    const r = await this.call<{ value: ParsedAccount | null }>('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    const acc = r.value;
    if (!acc) throw new Error('Compte introuvable : cette adresse n’existe pas sur mainnet.');
    if (Array.isArray(acc.data) || !acc.data.parsed || acc.data.parsed.type !== 'mint') {
      throw new Error('Cette adresse n’est pas un mint de token SPL.');
    }
    const info = acc.data.parsed.info;
    const program = acc.owner === TOKEN_2022_PROGRAM ? 'token-2022' : 'spl-token';
    const decimals = Number(info.decimals);
    const supplyRaw = String(info.supply);
    const extensions: string[] = Array.isArray(info.extensions)
      ? info.extensions.map((e: { extension?: string }) => e.extension ?? 'unknown')
      : [];
    let transferFeeBps: number | null = null;
    if (Array.isArray(info.extensions)) {
      const fee = info.extensions.find((e: { extension?: string }) => e.extension === 'transferFeeConfig');
      const bps = Number(fee?.state?.newerTransferFee?.transferFeeBasisPoints ?? fee?.state?.olderTransferFee?.transferFeeBasisPoints);
      if (Number.isFinite(bps)) transferFeeBps = bps;
    }
    return {
      address: mint, program, decimals, supplyRaw,
      supply: Number(supplyRaw) / 10 ** decimals,
      mintAuthority: info.mintAuthority ?? null,
      freezeAuthority: info.freezeAuthority ?? null,
      extensions,
      transferFeeBps,
    };
  }

  async getTokenSupply(mint: string): Promise<SupplyInfo> {
    const r = await this.call<{ value: { amount: string; decimals: number; uiAmount: number | null } }>('getTokenSupply', [mint, { commitment: 'confirmed' }]);
    const decimals = r.value.decimals;
    return { supply: Number(r.value.amount) / 10 ** decimals, decimals, source: 'rpc' };
  }

  /** Solde total d'un mint détenu par un propriétaire (somme de ses comptes token). */
  async getOwnerTokenBalance(owner: string, mint: string, decimals: number): Promise<number> {
    const r = await this.call<{ value: { account: { data: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }[] }>(
      'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    );
    let total = 0n;
    for (const acc of r.value ?? []) {
      const raw = acc.account?.data?.parsed?.info?.tokenAmount?.amount;
      if (raw) total += BigInt(raw);
    }
    return Number(total) / 10 ** decimals;
  }

  /** Top 20 comptes token, propriétaires résolus. */
  async getLargestAccounts(mint: string, decimals: number): Promise<RawHolder[]> {
    const r = await this.call<{ value: { address: string; amount: string }[] }>('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
    const accounts = r.value;
    if (!accounts.length) return [];
    const owners = await this.getMultipleParsed(accounts.map((a) => a.address));
    return accounts.map((a, i) => {
      const acc = owners[i];
      const owner = acc && !Array.isArray(acc.data) && acc.data.parsed ? String(acc.data.parsed.info?.owner ?? '') : '';
      return { account: a.address, owner: owner || a.address, amount: Number(a.amount) / 10 ** decimals };
    });
  }

  async getMultipleParsed(addresses: string[]): Promise<(ParsedAccount | null)[]> {
    const out: (ParsedAccount | null)[] = [];
    for (let i = 0; i < addresses.length; i += 100) {
      const chunk = addresses.slice(i, i + 100);
      const r = await this.call<{ value: (ParsedAccount | null)[] }>('getMultipleAccounts', [chunk, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
      out.push(...r.value);
    }
    return out;
  }

  /**
   * Classe des propriétaires : un wallet est un compte système (ou inexistant).
   * Tout compte détenu par un programme est un PDA : pool, vault, escrow, bonding curve.
   */
  async classifyOwners(owners: string[]): Promise<Map<string, 'wallet' | 'program-owned' | 'burn'>> {
    const map = new Map<string, 'wallet' | 'program-owned' | 'burn'>();
    const toFetch = owners.filter((o) => {
      if (BURN_ADDRESSES.has(o)) { map.set(o, 'burn'); return false; }
      return true;
    });
    const accounts = await this.getMultipleParsed(toFetch);
    toFetch.forEach((o, i) => {
      const acc = accounts[i];
      if (!acc || acc.owner === SYSTEM_PROGRAM) map.set(o, 'wallet');
      else map.set(o, 'program-owned');
    });
    return map;
  }

  /** Créateur + date de création via la PDA de métadonnées Metaplex, gratuit. */
  async getCreatorInfo(mint: string): Promise<CreatorInfo> {
    const pda = metadataPda(mint);
    const r = await this.call<{ value: ParsedAccount | null }>('getAccountInfo', [pda, { encoding: 'base64', commitment: 'confirmed' }]);
    let creator: string | null = null;
    let name: string | null = null;
    let symbol: string | null = null;
    if (r.value && Array.isArray(r.value.data)) {
      const bytes = Uint8Array.from(Buffer.from(r.value.data[0], 'base64'));
      const meta = parseMetadata(bytes);
      if (meta) {
        name = meta.name || null;
        symbol = meta.symbol || null;
        // Une adresse nulle (programme système) n'est pas un créateur : métadonnées immuables ou slot vide.
        const real = (a: string | undefined): string | null => (a && a !== SYSTEM_PROGRAM ? a : null);
        const creators = meta.creators.filter((c) => real(c.address));
        const verified = creators.find((c) => c.verified);
        creator = real(verified?.address) ?? real(creators[0]?.address) ?? real(meta.updateAuthority);
      }
    }
    // La PDA de métadonnées a très peu de transactions : sa plus ancienne signature ≈ création du token.
    let createdAt: number | null = null;
    const target = r.value ? pda : mint;
    createdAt = await this.oldestSignatureTime(target, 3);
    return { creator, createdAt, name, symbol, source: 'rpc' };
  }

  async oldestSignatureTime(address: string, maxPages: number): Promise<number | null> {
    let before: string | undefined;
    let oldest: number | null = null;
    for (let page = 0; page < maxPages; page++) {
      const sigs = await this.call<{ signature: string; blockTime: number | null }[]>('getSignaturesForAddress', [
        address, { limit: 1000, ...(before ? { before } : {}), commitment: 'confirmed' },
      ]);
      if (!sigs.length) break;
      const last = sigs[sigs.length - 1] as { signature: string; blockTime: number | null };
      if (last.blockTime) oldest = last.blockTime;
      before = last.signature;
      if (sigs.length < 1000) return oldest;
    }
    // Trop de pages : on n'est pas sûr d'avoir atteint la première transaction.
    return null;
  }
}
