<script setup lang="ts">
import { toRef } from 'vue';
import QueryState from '@/components/shared/QueryState.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtDate } from '@/composables/useFormat';
import { useNews } from '@/queries/useWatch';

const props = defineProps<{ tokenId: number; kinds: 'news,listing' | 'promo' }>();
const q = useNews(toRef(props, 'tokenId'), props.kinds);
const FLAG: Record<string, string> = {
  price_prediction: 'prédiction de prix', pr_wire: 'communiqué payant', sponsored_mention: 'sponsorisé', young_multi_token_domain: 'domaine récent multi-tokens', also_seen_on: 'aussi vu sur',
};
</script>
<template>
  <div>
    <p v-if="kinds === 'promo'" class="small muted">Contenu repéré comme promotionnel ou payé. Il est séparé des annonces officielles et volontairement dévalué : il mesure le budget marketing, pas la véracité.</p>
    <p v-else class="small muted">Actualités tierces et annonces d'exchanges. Jamais mélangées aux engagements de l'équipe. Pas de classement par popularité : ordre chronologique.</p>
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <div v-if="q.data.value && !q.data.value.data.length" class="empty">Rien pour l'instant. Le job d'actualités passe toutes les heures.</div>
    <table v-else-if="q.data.value" :style="kinds === 'promo' ? 'opacity:.75' : ''">
      <thead><tr><th>Date</th><th>Titre</th><th>Source</th><th>{{ kinds === 'promo' ? 'Signaux' : 'Type' }}</th></tr></thead>
      <tbody>
        <tr v-for="n in q.data.value.data" :key="n.id">
          <td class="small" style="white-space:nowrap">{{ fmtDate(n.publishedAt) }}</td>
          <td><a :href="n.url" target="_blank" rel="noopener">{{ n.title }}</a></td>
          <td class="small faint">{{ n.domain }} <span class="faint">· {{ n.provider }}</span></td>
          <td>
            <template v-if="kinds === 'promo'"><span v-for="f in n.promoFlags" :key="f.code" class="badge warning" style="margin:.1rem" :title="f.detail">{{ FLAG[f.code] ?? f.code }}</span></template>
            <StatusBadge v-else-if="n.kind === 'listing'" status="ok" label="listing" />
            <span v-else class="faint small">actualité</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
