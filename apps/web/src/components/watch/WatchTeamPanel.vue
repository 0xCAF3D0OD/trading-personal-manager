<script setup lang="ts">
import type { TeamWalletLabel } from '@tpm/shared';
import { reactive, toRef } from 'vue';
import { ApiHttpError } from '@/api/http';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate, fmtNum, shortAddr } from '@/composables/useFormat';
import { useOnchain, useTeamWallets, useWatchMutations } from '@/queries/useWatch';
import { useNotificationsStore } from '@/stores/notifications.store';
import { z } from 'zod';

const props = defineProps<{ tokenId: number }>();
const wallets = useTeamWallets(toRef(props, 'tokenId'));
const onchain = useOnchain(toRef(props, 'tokenId'));
const m = useWatchMutations(toRef(props, 'tokenId'));
const notify = useNotificationsStore();
const form = reactive({ address: '', label: 'team' as z.infer<typeof TeamWalletLabel>, note: '' });
const LABEL: Record<string, string> = { creator: 'créateur', team: 'équipe', treasury: 'trésorerie', marketing: 'marketing', lp_owner: 'propriétaire LP', other: 'autre' };
const KIND: Record<string, string> = { transfer_out: 'transfert sortant', transfer_in: 'transfert entrant', swap_sell: 'vente', swap_buy: 'achat', burn: 'burn', lp_add: 'ajout LP', lp_remove: 'retrait LP', mint: 'émission', authority_change: 'autorité', other: 'autre' };
async function add() {
  try { await m.addWallet.mutateAsync({ address: form.address.trim(), label: form.label, note: form.note || undefined }); form.address = ''; form.note = ''; }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <section class="card">
      <h3>Wallets de l'équipe</h3>
      <p class="small muted">Le créateur est ajouté automatiquement. Ajoutez les wallets identifiés comme équipe, trésorerie ou marketing : leurs transactions sont traitées comme des affirmations.</p>
      <QueryState :loading="wallets.isLoading.value" :error="wallets.error.value" />
      <table v-if="wallets.data.value?.data.length">
        <tbody>
          <tr v-for="w in wallets.data.value.data" :key="w.id">
            <td class="mono"><a :href="`https://solscan.io/account/${w.address}`" target="_blank" rel="noopener">{{ shortAddr(w.address, 8) }}</a></td>
            <td><span class="badge neutral">{{ LABEL[w.label] }}</span> <span class="faint small">{{ w.source === 'auto' ? 'automatique' : 'manuel' }}</span></td>
            <td class="small muted">{{ w.note }}</td>
            <td class="num"><button v-if="w.source === 'manual'" class="ghost danger small" @click="m.removeWallet.mutate(w.id)">✕</button></td>
          </tr>
        </tbody>
      </table>
      <form class="row" style="margin-top:.5rem;align-items:flex-end" @submit.prevent="add">
        <div style="flex:2;min-width:260px"><label>Adresse</label><input v-model="form.address" class="mono" required /></div>
        <div><label>Rôle</label><select v-model="form.label" style="width:auto"><option v-for="(l, k) in LABEL" :key="k" :value="k">{{ l }}</option></select></div>
        <div style="flex:1"><label>Note</label><input v-model="form.note" /></div>
        <button class="primary" type="submit" :disabled="m.addWallet.isPending.value">Ajouter</button>
      </form>
    </section>

    <section class="card">
      <h3>Actions on-chain (30 jours)</h3>
      <QueryState :loading="onchain.isLoading.value" :error="onchain.error.value" />
      <template v-if="onchain.data.value">
        <div v-if="!onchain.data.value.data.available" class="banner warn small">Collecte des transactions indisponible : renseignez <code>HELIUS_API_KEY</code> (ou une URL RPC Helius). Les variations d'offre restent suivies.</div>
        <div v-if="!onchain.data.value.data.actions.length" class="empty">Aucune action pertinente collectée.</div>
        <div v-else class="overflow">
          <table>
            <thead><tr><th>Date</th><th>Wallet</th><th>Action</th><th class="num">Montant</th><th>Contrepartie</th><th></th></tr></thead>
            <tbody>
              <tr v-for="a in onchain.data.value.data.actions" :key="a.id">
                <td class="small" style="white-space:nowrap">{{ fmtDate(a.ts) }}</td>
                <td class="mono small">{{ shortAddr(a.walletAddress) }} <span class="faint">{{ a.walletLabel ? LABEL[a.walletLabel] : '' }}</span></td>
                <td><span class="badge" :class="['transfer_out','swap_sell','lp_remove'].includes(a.kind) ? 'warning' : 'neutral'">{{ KIND[a.kind] ?? a.kind }}</span></td>
                <td class="num">{{ fmtNum(a.amount, { compact: true }) }}</td>
                <td class="small">{{ a.counterpartyLabel ?? '' }} <span class="mono faint">{{ shortAddr(a.counterparty) }}</span></td>
                <td><a :href="`https://solscan.io/tx/${a.txSignature}`" target="_blank" rel="noopener" class="small">tx ↗</a></td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3 style="margin-top:1rem">Variations d'offre observées</h3>
        <div v-if="!onchain.data.value.data.supplyEvents.length" class="empty">Aucune variation d'offre sur la période : ni burn ni émission.</div>
        <table v-else>
          <thead><tr><th>Entre</th><th>et</th><th class="num">Variation</th><th class="num">%</th></tr></thead>
          <tbody>
            <tr v-for="e in onchain.data.value.data.supplyEvents" :key="e.id">
              <td class="small">{{ fmtDate(e.tsFrom) }}</td><td class="small">{{ fmtDate(e.tsTo) }}</td>
              <td class="num" :class="e.kind === 'burn' ? 'up' : 'down'">{{ e.kind === 'burn' ? '−' : '+' }}{{ fmtNum(Math.abs(e.delta), { compact: true }) }}</td>
              <td class="num">{{ e.deltaPct.toFixed(4) }} %</td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>
  </div>
</template>
