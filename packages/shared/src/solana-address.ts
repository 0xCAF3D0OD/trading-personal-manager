/**
 * Validation d'une adresse Solana (base58, 32 octets) sans dépendance externe.
 * Utilisée côté front avant tout appel réseau, et côté back par défense en profondeur.
 */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function decodeBase58(input: string): Uint8Array | null {
  if (!BASE58_RE.test(input)) return null;
  // Pas d'octet initial : chaque '1' de tête ajoute exactement un octet nul ci-dessous.
  const bytes: number[] = [];
  for (const ch of input) {
    let carry = ALPHABET.indexOf(ch);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) {
      carry += (bytes[i] as number) * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Zéros de tête ('1' en base58)
  for (let k = 0; k < input.length && input[k] === '1'; k++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

export function encodeBase58(bytes: Uint8Array): string {
  // Pas de chiffre initial : 32 octets à zéro doivent donner exactement 32 '1', pas 33.
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += (digits[i] as number) << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i] as number];
  return out;
}

export function isSolanaAddress(input: string): boolean {
  const decoded = decodeBase58(input.trim());
  return decoded !== null && decoded.length === 32;
}
