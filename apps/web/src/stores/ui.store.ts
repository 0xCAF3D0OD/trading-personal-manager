import type { UiMode, UiSettings } from '@tpm/shared';
import { UI_DEFAULTS } from '@tpm/shared';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { watchApi } from '@/api/watch.api';

/**
 * État UI : le mode de lecture (simple / détail) est mémorisé dans les réglages serveur (module `ui`, docs/05 A.1)
 * et mis en cache localement pour s'appliquer avant la première réponse. Les données métier restent dans vue-query.
 */
export const useUiStore = defineStore('ui', () => {
  const historyDays = ref<number>(Number(localStorage.getItem('ui.historyDays') ?? 30));
  watch(historyDays, (v) => localStorage.setItem('ui.historyDays', String(v)));

  const settings = ref<UiSettings>({ ...UI_DEFAULTS, mode: (localStorage.getItem('ui.mode') as UiMode) ?? UI_DEFAULTS.mode });
  const loaded = ref(false);

  async function load(): Promise<void> {
    if (loaded.value) return;
    try {
      const env = await watchApi.settings('ui');
      settings.value = env.data.settings as UiSettings;
      localStorage.setItem('ui.mode', settings.value.mode);
    } catch { /* défauts locaux conservés */ }
    loaded.value = true;
  }

  async function setMode(mode: UiMode): Promise<void> {
    settings.value = { ...settings.value, mode };
    localStorage.setItem('ui.mode', mode);
    try { await watchApi.updateSettings('ui', settings.value, `Mode ${mode === 'simple' ? 'lecture simple' : 'détail'}`); } catch { /* la valeur locale suffit */ }
  }

  function apply(next: UiSettings): void {
    settings.value = next;
    localStorage.setItem('ui.mode', next.mode);
  }

  return { historyDays, settings, loaded, load, setMode, apply };
});
