import { sha256 } from '@noble/hashes/sha256';
import { ed25519 } from '@noble/curves/ed25519';
import { decodeBase58, encodeBase58 } from '@tpm/shared';

export const METAPLEX_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Équivalent de PublicKey.findProgramAddressSync, sans @solana/web3.js. */
export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const program = decodeBase58(programId);
  if (!program) throw new Error('programId invalide');
  const marker = new TextEncoder().encode('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), program, marker];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      buf.set(p, off);
      off += p.length;
    }
    const hash = sha256(buf);
    if (!isOnCurve(hash)) return encodeBase58(hash);
  }
  throw new Error('Aucun bump valide');
}

export function metadataPda(mint: string): string {
  const mintBytes = decodeBase58(mint);
  const program = decodeBase58(METAPLEX_PROGRAM_ID);
  if (!mintBytes || !program) throw new Error('mint invalide');
  return findProgramAddress([new TextEncoder().encode('metadata'), program, mintBytes], METAPLEX_PROGRAM_ID);
}

export interface ParsedMetadata {
  updateAuthority: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  creators: { address: string; verified: boolean; share: number }[];
}

/** Décodage borsh minimal du compte Metadata (Token Metadata v1). */
export function parseMetadata(data: Uint8Array): ParsedMetadata | null {
  try {
    let off = 0;
    const u8 = () => data[off++] as number;
    const u16 = () => { const v = (data[off] as number) | ((data[off + 1] as number) << 8); off += 2; return v; };
    const u32 = () => { const v = ((data[off] as number) | ((data[off + 1] as number) << 8) | ((data[off + 2] as number) << 16) | ((data[off + 3] as number) << 24)) >>> 0; off += 4; return v; };
    const pubkey = () => { const s = encodeBase58(data.slice(off, off + 32)); off += 32; return s; };
    const str = () => { const len = u32(); const s = new TextDecoder().decode(data.slice(off, off + len)).replace(/\0+$/g, ''); off += len; return s; };
    u8(); // key
    const updateAuthority = pubkey();
    const mint = pubkey();
    const name = str();
    const symbol = str();
    const uri = str();
    u16(); // sellerFeeBasisPoints
    const creators: ParsedMetadata['creators'] = [];
    if (u8() === 1) {
      const n = u32();
      for (let i = 0; i < n && i < 10; i++) {
        creators.push({ address: pubkey(), verified: u8() === 1, share: u8() });
      }
    }
    return { updateAuthority, mint, name, symbol, uri, creators };
  } catch {
    return null;
  }
}
