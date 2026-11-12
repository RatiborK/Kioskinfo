<!-- apps/web/src/views/ScreenView.vue — first visual prototype; no real posters yet. -->
<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';

const items = [
  { id: 'posters', label: 'Афиша', icon: '✦' },
  { id: 'schedule', label: 'Расписание', icon: '◷' },
  { id: 'groups', label: 'Коллективы', icon: '◎' },
  { id: 'navigation', label: 'Навигация', icon: '⌖' },
  { id: 'about', label: 'О ДК', icon: '▣' },
  { id: 'contacts', label: 'Контакты', icon: '↗' },
] as const;
const current = ref<(typeof items)[number]['id']>('posters');
const welcome = ref<{ title:string; body:string } | null>(null);
onMounted(async () => {
  try { const response = await fetch('/api/public/pages/welcome', {cache:'no-store'});
    if (response.ok) {const data:{page:{title:string;body:string}} = await response.json(); welcome.value=data.page;}
  } catch { /* available only when API and DB are running */ }
});
const selected = computed(() => items.find((item) => item.id === current.value) ?? items[0]);
</script>

<template>
  <main class="shell screen-shell">
    <div class="screen-content">
      <header class="brand-row">
        <div class="brand-glyph" aria-hidden="true">Н</div>
        <div class="brand-copy"><strong>НАВИКУЛЬТУРА</strong><span>ЦИФРОВОЙ ИНФОЦЕНТР · ГДК «КИРОВСКИЙ»</span></div>
        <span class="stage-note">ПРОТОТИП 00</span>
      </header>
      <section class="hero" aria-live="polite">
        <div class="hero-overline"><i></i> ИНФОРМАЦИОННАЯ ПЛАТФОРМА</div>
        <h1>{{ selected.label }}<span class="dot">.</span></h1>
        <p v-if="current === 'posters'">Скоро здесь появятся актуальные мероприятия, концерты и выставки Дворца культуры.</p>
        <p v-else-if="current === 'schedule'">Расписание занятий и мероприятий будет формироваться автоматически из данных сотрудников.</p>
        <p v-else-if="current === 'groups'">Информация о творческих коллективах, руководителях и направлениях.</p>
        <p v-else-if="current === 'navigation'">Поиск помещений и интерактивная навигация по зданию.</p>
        <p v-else-if="current === 'about'">{{ welcome?.body ?? 'Информация об учреждении и его деятельности.' }}</p>
        <p v-else>Контакты и сведения для посетителей.</p>
        <div class="feature-grid">
          <div class="feature-primary"><span class="feature-index">01 / НАВИКУЛЬТУРА</span><b>ИНФОРМАЦИЯ<br/>БЕЗ ОЖИДАНИЯ</b><span>Автоматическое обновление материалов</span></div>
          <div class="feature-secondary"><span class="feature-index">00 / СТАДИЯ РАЗРАБОТКИ</span><b>СКОРО</b><span>Демонстрационные данные, без реальных афиш</span></div>
        </div>
      </section>
      <footer class="screen-footer"><span>НАВИГАЦИЯ · СОБЫТИЯ · ЛЮДИ</span><span>ДК «КИРОВСКИЙ»</span></footer>
    </div>
    <nav class="side-menu" aria-label="Разделы информационной системы">
      <span class="menu-title">РАЗДЕЛЫ</span>
      <button v-for="(item,index) in items" :key="item.id" type="button" class="nav-item" :class="{active:current===item.id}" @click="current=item.id">
        <span class="nav-index">{{ String(index+1).padStart(2,'0') }}</span><span class="nav-label">{{ item.label }}</span><span class="nav-glyph" aria-hidden="true">{{ item.icon }}</span>
      </button>
      <div class="menu-bottom">NAVIKULTURA / 2026</div>
    </nav>
  </main>
</template>
