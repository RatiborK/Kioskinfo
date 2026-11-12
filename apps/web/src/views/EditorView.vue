<!-- apps/web/src/views/EditorView.vue — read-only editor prototype. Authentication comes before editing. -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
const health = ref('Проверка API…');
onMounted(async () => {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('API недоступен');
    const data: { status: string } = await response.json();
    health.value = data.status === 'ok' ? 'Сервер отвечает' : 'Неизвестный ответ сервера';
  } catch { health.value = 'API не отвечает — проверьте npm run dev:api'; }
});
const blocks = [
  { label: 'Афиши', icon: '▧', description: 'Автозагрузка изображений и видео — этап 02' },
  { label: 'Расписание', icon: '▦', description: 'Excel, кнопки и страницы — этап 03' },
  { label: 'Коллективы', icon: '◎', description: 'Карточки и руководители — этап 03' },
  { label: 'Конструктор', icon: '◫', description: 'Блочные шаблоны оформления — этап 04' },
] as const;
</script>

<template>
  <main class="editor-shell">
    <header class="editor-header"><div><span class="eyebrow">NAVIKULTURA / CONTENT MANAGEMENT</span><h1>Панель сотрудника<span class="dot">.</span></h1></div><a class="editor-link" href="/screen">Открыть экран →</a></header>
    <section class="editor-callout"><strong>ПРОТОТИП · ДАННЫЕ НЕ СОХРАНЯЮТСЯ</strong><p>Это проверка внешнего вида. Без авторизации сервер намеренно не принимает изменения. В следующих этапах появятся формы с автосохранением и импорт файлов.</p></section>
    <div class="status-line"><span class="status-dot"></span> {{ health }}</div>
    <section class="editor-grid"><article v-for="block in blocks" :key="block.label" class="editor-card"><span class="editor-card-icon">{{ block.icon }}</span><h2>{{ block.label }}</h2><p>{{ block.description }}</p><span class="editor-soon">В РАЗРАБОТКЕ</span></article></section>
  </main>
</template>
