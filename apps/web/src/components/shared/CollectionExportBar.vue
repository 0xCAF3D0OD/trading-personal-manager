<script setup lang="ts">
import { computed, ref } from 'vue';
import { useNotificationsStore } from '@/stores/notifications.store';

/**
 * Dossier d'une collection (liste ou scanner) : copier pour une IA, ou télécharger en Markdown / page HTML.
 * Les liens visent l'API sur la même origine ; les paramètres reflètent la sélection filtrée à l'écran.
 */
const props = defineProps<{ path: string; params: Record<string, string>; label: string }>();
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';
const notify = useNotificationsStore();
const busy = ref(false);
const copied = ref(false);
const url = (extra: Record<string, string>) => {
  const q = new URLSearchParams({ ...props.params, ...extra });
  return `${API}${props.path}?${q.toString()}`;
};
const mdHref = computed(() => url({ format: 'md', download: '1' }));
const htmlHref = computed(() => url({ format: 'html', download: '1' }));
async function copy() {
  busy.value = true;
  try {
    const res = await fetch(url({ format: 'md' }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await navigator.clipboard.writeText(await res.text());
    copied.value = true; notify.push('success', `${props.label} copié. Collez-le dans votre IA.`); setTimeout(() => (copied.value = false), 3000);
  } catch (e) { notify.push('error', `Copie impossible : ${String((e as Error).message ?? e)}`, 8000); }
  finally { busy.value = false; }
}
</script>
<template>
  <span class="row" style="gap:.25rem">
    <span class="muted small">{{ label }} :</span>
    <button class="ghost small" :disabled="busy" @click="copy">{{ copied ? 'Copié ✓' : 'Copier pour une IA' }}</button>
    <a :href="mdHref" download><button class="ghost small">.md</button></a>
    <a :href="htmlHref" download title="Page autonome, imprimable en PDF"><button class="ghost small">.html</button></a>
  </span>
</template>
