import { describe, expect, it } from 'vitest';
import { decodeBase58, encodeBase58, isSolanaAddress } from '@tpm/shared';
import { metadataPda } from '../src/datasources/rpc/metaplex.js';

describe('Adresses Solana', () => {
  it('valide des adresses base58 de 32 octets', () => {
    expect(isSolanaAddress('So11111111111111111111111111111111111111112')).toBe(true);
    expect(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
    expect(isSolanaAddress('0x0000000000000000000000000000000000000000')).toBe(false);
    expect(isSolanaAddress('abc')).toBe(false);
    expect(isSolanaAddress('')).toBe(false);
  });

  it('encode 32 octets à zéro en exactement 32 « 1 » (adresse nulle)', () => {
    const zero = encodeBase58(new Uint8Array(32));
    expect(zero).toBe('11111111111111111111111111111111');
    expect(zero).toHaveLength(32);
    expect(isSolanaAddress(zero)).toBe(true);
  });

  it('encode et décode une adresse réelle sans perte', () => {
    const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    expect(encodeBase58(decodeBase58(usdc)!)).toBe(usdc);
    expect(encodeBase58(Uint8Array.from([0, 5]))).toBe('16');
    // Adresses commençant par '1' (octets nuls de tête) : incinérateur et programme système.
    expect(isSolanaAddress('1nc1nerator11111111111111111111111111111111')).toBe(true);
    expect(isSolanaAddress('11111111111111111111111111111111')).toBe(true);
    expect(isSolanaAddress('111111111111111111111111111111111')).toBe(false);
  });

  it('dérive la PDA de métadonnées Metaplex (USDC)', () => {
    // Valeur de référence connue pour le mint USDC
    expect(metadataPda('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe('5x38Kp4hvdomTCnCrAny4UtMUt5rQBdB6px2K1Ui45Wq');
  });
});
