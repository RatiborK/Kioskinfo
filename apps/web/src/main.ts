// apps/web/src/main.ts — two browser-facing surfaces, separate routes.
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import ScreenView from './views/ScreenView.vue';
import EditorView from './views/EditorView.vue';
import './styles.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/screen' },
    { path: '/screen', component: ScreenView },
    { path: '/editor', component: EditorView },
    { path: '/:pathMatch(.*)*', redirect: '/screen' },
  ],
});

createApp(App).use(router).mount('#app');
