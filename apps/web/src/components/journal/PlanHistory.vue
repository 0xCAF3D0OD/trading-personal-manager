<script setup lang="ts">
import type { Plan, PlanRevision } from '@tpm/shared';
import { computed } from 'vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtDate, fmtUsd } from '@/composables/useFormat';
const props = defineProps<{ plans: Plan[]; revisions: PlanRevision[] }>();
const FIELD: Record<string, string> = { stopLossPrice: 'Stop de perte', takeProfitPrice: 'Objectif de gain', entryPrice: 'Prix d’entrée', amountUsd: 'Montant' };
const loosenedCount = computed(() => props.revisions.reduce((n, r) => n + r.changes.filter((c) => c.direction === 'loosened').length, 0));
const tightenedCount = computed(() => props.revisions.reduce((n, r) => n + r.changes.filter((c) => c.direction === 'tightened').length, 0));
</script>
<template>
  <section class="card">
    <div class="card-head"><h2>Historique des versions</h2><span class="faint small">{{ plans.length }} version(s)</span></div>
    <div v-if="!plans.length" class="empty">Aucun plan enregistré. Écrivez vos seuils avant de prendre position.</div>
    <template v-else>
      <div v-if="revisions.length" class="banner small" :class="loosenedCount > tightenedCount ? 'warn' : ''" style="border-color: var(--border)">
        Sur {{ revisions.length }} révision(s) : <strong>{{ loosenedCount }}</strong> seuil(s) assoupli(s), <strong>{{ tightenedCount }}</strong> resserré(s).
        <span v-if="loosenedCount > tightenedCount">Vous déplacez vos seuils dans le sens qui vous arrange plus souvent que l’inverse.</span>
      </div>
      <div class="overflow">
        <table>
          <thead><tr><th>Version</th><th>Date</th><th class="num">Entrée</th><th class="num">Gain</th><th class="num">Perte</th><th class="num">Montant</th><th class="num">R/R</th><th>Note</th></tr></thead>
          <tbody>
            <tr v-for="p in plans" :key="p.id" :style="p.isCurrent ? '' : 'opacity:.7'">
              <td>v{{ p.version }} <span v-if="p.isCurrent" class="badge ok">actuel</span></td>
              <td class="small">{{ fmtDate(p.createdAt) }}</td>
              <td class="num">{{ fmtUsd(p.entryPrice) }}</td>
              <td class="num up">{{ fmtUsd(p.takeProfitPrice) }}</td>
              <td class="num down">{{ fmtUsd(p.stopLossPrice) }}</td>
              <td class="num">{{ fmtUsd(p.amountUsd) }}</td>
              <td class="num">{{ p.riskRewardRatio }}</td>
              <td class="small muted">{{ p.note ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="revisions.length" style="margin-top:1rem">
        <h3>Ce qui a changé à chaque révision</h3>
        <ul class="stack" style="list-style:none; padding:0; margin:0">
          <li v-for="r in revisions" :key="r.toVersion" class="small">
            <strong>v{{ r.fromVersion }} → v{{ r.toVersion }}</strong> <span class="faint">{{ fmtDate(r.at) }}</span>
            <span v-for="c in r.changes" :key="c.field" style="margin-left:.75rem">
              {{ FIELD[c.field] ?? c.field }} : {{ fmtUsd(c.from) }} → {{ fmtUsd(c.to) }} <StatusBadge v-if="c.direction !== 'neutral'" :status="c.direction" />
            </span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
