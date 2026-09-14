import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useUiStore } from '@/stores/ui.store';

/**
 * Une carte a deux niveaux : ce qui se lit en mode simple, et le détail.
 * En mode détail global tout est ouvert ; en lecture simple, chaque carte se déplie individuellement.
 */
export function useCardDetail() {
  const { settings } = storeToRefs(useUiStore());
  const expanded = ref(false);
  const detailMode = computed(() => settings.value.mode === 'detail');
  const open = computed(() => detailMode.value || expanded.value);
  const toggle = () => { expanded.value = !expanded.value; };
  return { open, expanded, detailMode, toggle };
}
