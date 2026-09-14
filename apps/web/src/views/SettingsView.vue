<script setup lang="ts">
import { ref } from 'vue';
import MarketSettingsPanel from '@/components/settings/MarketSettingsPanel.vue';
import PortfolioSettingsPanel from '@/components/settings/PortfolioSettingsPanel.vue';
import ScannerSettingsPanel from '@/components/settings/ScannerSettingsPanel.vue';
import UiSettingsPanel from '@/components/settings/UiSettingsPanel.vue';
import WatchSettingsPanel from '@/components/watch/WatchSettingsPanel.vue';
const tab = ref<'ui' | 'market' | 'watch' | 'scanner' | 'portfolio'>('ui');
</script>
<template>
  <div class="stack" style="gap:1rem">
    <h1>Réglages</h1>
    <p class="small muted" style="margin:0">Chaque module a ses défauts versionnés dans le code. Chaque enregistrement crée une nouvelle version ; la remise à zéro se fait module par module.</p>
    <nav class="row tabs">
      <button :class="tab === 'ui' ? 'primary' : 'ghost'" @click="tab = 'ui'">Affichage</button>
      <button :class="tab === 'market' ? 'primary' : 'ghost'" @click="tab = 'market'">Métriques de marché</button>
      <button :class="tab === 'watch' ? 'primary' : 'ghost'" @click="tab = 'watch'">Veille</button>
      <button :class="tab === 'scanner' ? 'primary' : 'ghost'" @click="tab = 'scanner'">Scanner</button>
      <button :class="tab === 'portfolio' ? 'primary' : 'ghost'" @click="tab = 'portfolio'">Portefeuille</button>
    </nav>
    <UiSettingsPanel v-if="tab === 'ui'" />
    <MarketSettingsPanel v-else-if="tab === 'market'" />
    <ScannerSettingsPanel v-else-if="tab === 'scanner'" />
    <PortfolioSettingsPanel v-else-if="tab === 'portfolio'" />
    <WatchSettingsPanel v-else :token-id="0" />
  </div>
</template>
