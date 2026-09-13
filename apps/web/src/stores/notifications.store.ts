import type { DegradedInfo } from '@tpm/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast { id: number; kind: 'info' | 'success' | 'error'; text: string }

export const useNotificationsStore = defineStore('notifications', () => {
  const toasts = ref<Toast[]>([]);
  const degraded = ref<DegradedInfo[]>([]);
  let seq = 1;
  function push(kind: Toast['kind'], text: string, ttl = 5000) {
    const id = seq++;
    toasts.value.push({ id, kind, text });
    setTimeout(() => dismiss(id), ttl);
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }
  function setDegraded(list: DegradedInfo[]) {
    degraded.value = list;
  }
  return { toasts, degraded, push, dismiss, setDegraded };
});
