import { computed, ref } from 'vue';
import { isSolanaAddress } from '@tpm/shared';

/** Validation locale avant tout appel réseau. */
export function useSolanaAddress() {
  const input = ref('');
  const trimmed = computed(() => input.value.trim());
  const valid = computed(() => trimmed.value.length > 0 && isSolanaAddress(trimmed.value));
  const error = computed(() => {
    if (!trimmed.value) return null;
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed.value)) return 'Caractères invalides : une adresse Solana est en base58 (pas de 0, O, I, l).';
    if (trimmed.value.startsWith('0x')) return 'Adresse EVM détectée : il faut l’adresse de mint Solana.';
    if (!valid.value) return 'Longueur invalide : 32 octets attendus (32 à 44 caractères).';
    return null;
  });
  return { input, trimmed, valid, error };
}
