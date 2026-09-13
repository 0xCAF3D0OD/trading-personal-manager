import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'watchlist', component: () => import('./views/WatchlistView.vue') },
    { path: '/token/:id(\\d+)', name: 'token', component: () => import('./views/TokenDetailView.vue'), props: (r) => ({ id: Number(r.params.id) }) },
    { path: '/token/:id(\\d+)/journal', name: 'journal', component: () => import('./views/JournalView.vue'), props: (r) => ({ id: Number(r.params.id) }) },
    { path: '/token/:id(\\d+)/veille', name: 'watch', component: () => import('./views/WatchView.vue'), props: (r) => ({ id: Number(r.params.id) }) },
    { path: '/alerts', name: 'alerts', component: () => import('./views/AlertsView.vue') },
    { path: '/system', name: 'system', component: () => import('./views/SystemView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
