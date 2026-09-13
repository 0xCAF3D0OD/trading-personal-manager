import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

/** État UI uniquement : les données serveur vivent dans vue-query, pas ici. */
export const useUiStore = defineStore('ui', () => {
  const historyDays = ref<number>(Number(localStorage.getItem('ui.historyDays') ?? 30));
  watch(historyDays, (v) => localStorage.setItem('ui.historyDays', String(v)));
  return { historyDays };
});
