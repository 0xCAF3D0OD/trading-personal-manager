<script setup lang="ts">
import { computed, reactive } from 'vue';
import { ApiHttpError } from '@/api/http';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate, fmtUsd } from '@/composables/useFormat';
import { useAlertEvents, useAlertMutations, useAlerts } from '@/queries/useAlerts';
import { useWatchlist } from '@/queries/useWatchlist';
import { useNotificationsStore } from '@/stores/notifications.store';

const alerts = useAlerts();
const events = useAlertEvents();
const tokens = useWatchlist();
const m = useAlertMutations();
const notify = useNotificationsStore();
const symbolOf = computed(() => new Map((tokens.data.value?.data ?? []).map((t) => [t.id, t.symbol ?? t.address.slice(0, 6)])));
const form = reactive({ tokenId: 0, type: 'price_below' as 'price_above' | 'price_below', threshold: 0 });

async function createAlert() {
  try {
    await m.create.mutateAsync({ tokenId: form.tokenId, type: form.type, threshold: form.threshold });
    notify.push('success', 'Alerte créée.');
  } catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : 'Échec', 8000); }
}
async function test() {
  try {
    const r = await m.test.mutateAsync();
    const ok = r.data.filter((d) => d.ok).map((d) => d.channel);
    const ko = r.data.filter((d) => !d.ok);
    if (ok.length) notify.push('success', `Envoyé sur : ${ok.join(', ')}`);
    for (const k of ko) notify.push('error', `${k.channel} : ${k.error}`, 10000);
  } catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : 'Échec', 8000); }
}
async function evaluateNow() {
  try { const r = await m.evaluate.mutateAsync(); notify.push('info', `${r.data.evaluated} alertes évaluées, ${r.data.fired} déclenchée(s).`); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : 'Échec', 8000); }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <div class="row" style="justify-content:space-between">
      <h1>Alertes</h1>
      <div class="row"><button @click="test">Tester les notifications</button><button @click="evaluateNow">Évaluer maintenant</button></div>
    </div>

    <section class="card">
      <h2>Nouvelle alerte de prix</h2>
      <p class="small muted">Les alertes issues d’un plan (entrée, gain, perte) sont créées automatiquement depuis le journal. Les alertes de divergence sont créées à l’ajout du token.</p>
      <form class="row" @submit.prevent="createAlert">
        <select v-model.number="form.tokenId" required style="width:auto"><option :value="0" disabled>Token…</option><option v-for="t in tokens.data.value?.data ?? []" :key="t.id" :value="t.id">{{ t.symbol ?? t.address.slice(0, 8) }}</option></select>
        <select v-model="form.type" style="width:auto"><option value="price_below">Prix en dessous de</option><option value="price_above">Prix au-dessus de</option></select>
        <input v-model.number="form.threshold" type="number" step="any" min="0" placeholder="Seuil en $" required style="width:160px" />
        <button class="primary" type="submit" :disabled="!form.tokenId || !form.threshold || m.create.isPending.value">Créer</button>
      </form>
    </section>

    <section class="card">
      <h2>Règles actives</h2>
      <QueryState :loading="alerts.isLoading.value" :error="alerts.error.value" />
      <div v-if="alerts.data.value && !alerts.data.value.data.length" class="empty">Aucune alerte.</div>
      <div v-else-if="alerts.data.value" class="overflow">
        <table>
          <thead><tr><th>Token</th><th>Règle</th><th class="num">Seuil</th><th class="num">Silence</th><th class="num">Dernier tir</th><th class="num">Active</th><th></th></tr></thead>
          <tbody>
            <tr v-for="a in alerts.data.value.data" :key="a.id" :style="a.enabled ? '' : 'opacity:.55'">
              <td><router-link :to="`/token/${a.tokenId}`">{{ symbolOf.get(a.tokenId) ?? a.tokenId }}</router-link></td>
              <td class="small">{{ a.ruleText }}</td>
              <td class="num">{{ a.threshold === null ? '—' : fmtUsd(a.threshold) }}</td>
              <td class="num small">{{ Math.round(a.cooldownS / 3600) }} h</td>
              <td class="num small">{{ a.lastFiredAt ? fmtDate(a.lastFiredAt) : '—' }}</td>
              <td class="num"><input type="checkbox" style="width:auto" :checked="a.enabled" @change="m.update.mutate({ id: a.id, patch: { enabled: ($event.target as HTMLInputElement).checked } })" /></td>
              <td class="num"><button v-if="!a.planId && a.type.startsWith('price_')" class="ghost danger" @click="m.remove.mutate(a.id)">✕</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Historique des déclenchements</h2>
      <QueryState :loading="events.isLoading.value" :error="events.error.value" />
      <div v-if="events.data.value && !events.data.value.data.length" class="empty">Aucune alerte déclenchée pour l’instant.</div>
      <div v-else-if="events.data.value" class="stack" style="gap:.5rem">
        <article v-for="e in events.data.value.data" :key="e.id" class="card" style="background:var(--bg-elev-2)" :style="e.acknowledgedAt ? 'opacity:.6' : ''">
          <div class="row" style="justify-content:space-between">
            <strong>{{ e.tokenSymbol ?? e.tokenId }} — {{ e.type }}</strong>
            <span class="faint small">{{ fmtDate(e.firedAt) }}</span>
          </div>
          <p class="small" style="margin:.25rem 0"><strong>Règle que vous vous étiez fixée :</strong> {{ e.ruleText }}</p>
          <p class="small muted" style="margin:0">
            <template v-if="e.observed !== null">Constaté : {{ fmtUsd(e.observed) }}</template>
            <template v-if="e.threshold !== null"> · Seuil : {{ fmtUsd(e.threshold) }}</template>
            · Livré : {{ e.deliveredTo.map((d) => `${d.channel}${d.ok ? ' ✓' : ' ✗'}`).join(', ') || 'aucun canal' }}
          </p>
          <button v-if="!e.acknowledgedAt" class="ghost small" style="margin-top:.25rem" @click="m.ack.mutate(e.id)">Marquer comme lue</button>
        </article>
      </div>
    </section>
  </div>
</template>
