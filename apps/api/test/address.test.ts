import { describe, expect, it } from 'vitest';
import { isSolanaAddress } from '@tpm/shared';
import { metadataPda } from '../src/datasources/rpc/metaplex.js';

describe('Adresses Solana', () => {
  it('valide des adresses base58 de 32 octets', () => {
    expect(isSolanaAddress('So11111111111111111111111111111111111111112')).toBe(true);
    expect(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
    expect(isSolanaAddress('0x0000000000000000000000000000000000000000')).toBe(false);
    expect(isSolanaAddress('abc')).toBe(false);
    expect(isSolanaAddress('')).toBe(false);
  });

  it('dérive la PDA de métadonnées Metaplex (USDC)', () => {
    // Valeur de référence connue pour le mint USDC
    expect(metadataPda('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe('5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq');
  });
});
