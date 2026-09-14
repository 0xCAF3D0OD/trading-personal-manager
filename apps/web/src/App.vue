<script setup lang="ts">
import { storeToRefs } from 'pinia';
import DegradedBanner from '@/components/shared/DegradedBanner.vue';
import { useNotificationsStore } from '@/stores/notifications.store';
import { useUiStore } from '@/stores/ui.store';
const store = useNotificationsStore();
const { toasts } = storeToRefs(store);
const ui = useUiStore();
const { settings } = storeToRefs(ui);
void ui.load();
</script>
<template>
  <header class="topbar">
    <router-link to="/" style="color:inherit"><strong>Surveillance Solana</strong> <span class="faint small">observe, historise, alerte — n’exécute rien</span></router-link>
    <nav>
      <router-link to="/">Liste</router-link>
      <router-link to="/scanner">Scanner</router-link>
      <router-link to="/alerts">Alertes</router-link>
      <router-link to="/settings">Réglages</router-link>
      <router-link to="/system">Système</router-link>
    </nav>
    <button class="mode-toggle" :title="settings.mode === 'simple' ? 'Passer en détail : tout afficher' : 'Passer en lecture simple : l’essentiel'" @click="ui.setMode(settings.mode === 'simple' ? 'detail' : 'simple')">
      {{ settings.mode === 'simple' ? 'Lecture simple' : 'Détail' }} <span class="faint">⇄</span>
    </button>
  </header>
  <main class="layout">
    <DegradedBanner />
    <router-view />
  </main>
  <div class="toast-wrap">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind" @click="store.dismiss(t.id)">{{ t.text }}</div>
  </div>
</template>
