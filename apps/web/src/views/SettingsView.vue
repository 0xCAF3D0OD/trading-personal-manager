<script setup lang="ts">
import { ref } from 'vue';
import MarketSettingsPanel from '@/components/settings/MarketSettingsPanel.vue';
import ScannerSettingsPanel from '@/components/settings/ScannerSettingsPanel.vue';
import WatchSettingsPanel from '@/components/watch/WatchSettingsPanel.vue';
const tab = ref<'market' | 'watch' | 'scanner'>('market');
</script>
<template>
  <div class="stack" style="gap:1rem">
    <h1>Réglages</h1>
    <p class="small muted" style="margin:0">Chaque module a ses défauts versionnés dans le code. Chaque enregistrement crée une nouvelle version ; la remise à zéro se fait module par module.</p>
    <nav class="row" style="gap:.25rem;border-bottom:1px solid var(--border);padding-bottom:.5rem">
      <button :class="tab === 'market' ? 'primary' : 'ghost'" @click="tab = 'market'">Métriques de marché</button>
      <button :class="tab === 'watch' ? 'primary' : 'ghost'" @click="tab = 'watch'">Veille</button>
      <button :class="tab === 'scanner' ? 'primary' : 'ghost'" @click="tab = 'scanner'">Scanner</button>
    </nav>
    <MarketSettingsPanel v-if="tab === 'market'" />
    <ScannerSettingsPanel v-else-if="tab === 'scanner'" />
    <WatchSettingsPanel v-else :token-id="0" />
  </div>
</template>
