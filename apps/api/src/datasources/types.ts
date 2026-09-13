import type { SourceName, TokenProgram } from '@tpm/shared';

export interface MintInfo {
  address: string;
  program: TokenProgram;
  decimals: number;
  supplyRaw: string;
  supply: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: string[];
}

export interface SupplyInfo {
  supply: number;
  decimals: number;
  source: SourceName;
}

export interface RawHolder {
  /** Compte token (ATA ou autre) */
  account: string;
  /** Propriétaire du compte token */
  owner: string;
  /** Montant en unités entières (déjà divisé par 10^decimals) */
  amount: number;
}

export interface HoldersResult {
  holders: RawHolder[];
  /** Nombre total de comptes à solde > 0, si connu */
  totalHolders: number | null;
  truncated: boolean;
  source: SourceName;
  cuSpent: number;
}

export interface PairInfo {
  dexId: string;
  pairAddress: string;
  url: string | null;
  priceUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  pairCreatedAt: number | null;
  baseSymbol: string | null;
  baseName: string | null;
}

export interface CreatorInfo {
  creator: string | null;
  createdAt: number | null;
  name: string | null;
  symbol: string | null;
  source: SourceName;
}

export interface LpLockInfo {
  locked: boolean | null;
  lockedPct: number | null;
  protocol: string | null;
  source: SourceName;
  detail: string | null;
}

export interface CreatorActivity {
  signature: string;
  ts: number;
  kind: string;
  description: string | null;
  amount: number | null;
  amountUsd: number | null;
  involvesToken: boolean;
  raw: unknown;
}
