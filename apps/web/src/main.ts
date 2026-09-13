import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { onDegraded } from './api/http';
import { router } from './router';
import { useNotificationsStore } from './stores/notifications.store';
import './styles/base.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => count < 1 && !(err as { status?: number })?.status,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const app = createApp(App);
const pinia = createPinia();
app.use(pinia).use(router).use(VueQueryPlugin, { queryClient });

// Toute réponse backend porte son état dégradé : on le reflète dans le bandeau global.
const notifications = useNotificationsStore(pinia);
onDegraded((list) => notifications.setDegraded(list));

app.mount('#app');
