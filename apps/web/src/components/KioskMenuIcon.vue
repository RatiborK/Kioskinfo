<!-- apps/web/src/components/KioskMenuIcon.vue
     All eight kiosk menu glyphs use real two-tone SVG and inherit the published visitor theme.
     Poster keeps its distinctive star; calendar keeps its grid motif. -->
<script setup lang="ts">
type MenuSection='posters'|'groups'|'calendar'|'documents'|'safety'|'about'|'contacts'|'navigation';
defineProps<{name:MenuSection}>();
</script>

<template>
  <svg class="kiosk-menu-svg" viewBox="0 0 28 28" width="32" height="32"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
    fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <!-- Афиша: same recognizable star silhouette, with a contrasting dot/orbit -->
    <g v-if="name==='posters'">
      <path class="menu-icon-secondary-solid" d="m14 1.8 2.5 8.2 8.3 4-8.3 3-2.5 9.2-2.5-9.2-8.3-3 8.3-4Z"/>
      <path class="menu-icon-primary" d="M4 4.5h3.5M20.5 23.5H24"/>
    </g>
    <!-- Коллективы: two contrasting stage masks -->
    <g v-else-if="name==='groups'">
      <path class="menu-icon-primary" d="M2.4 4.2h10.8v9.6c0 5-2.4 8-5.4 9.9-3.1-2.1-5.4-4.9-5.4-9.9V4.2Z"/>
      <path class="menu-icon-secondary" d="M14.8 5h10.8v9.4c0 5-2.4 8-5.4 9.8-3.1-1.8-5.4-4.8-5.4-9.8V5Z"/>
      <path class="menu-icon-primary" d="M5.4 10h.1m4.1 0h.1M5.2 16c1.7-2 3.9-2 5.6 0"/>
      <path class="menu-icon-secondary" d="M17.6 11h.1m4 0h.1m-4.4 6c1.8 1.6 3.7 1.6 5.5 0"/>
    </g>
    <!-- Календарь: recognizable grid, highlighted date -->
    <g v-else-if="name==='calendar'">
      <rect class="menu-icon-primary" x="3.5" y="5.5" width="21" height="19" rx="2.4"/>
      <path class="menu-icon-primary" d="M8.5 3v5m11-5v5M3.5 11h21M8.5 15.5h3M8.5 19.5h3M16 19.5h3"/>
      <rect class="menu-icon-secondary-solid" x="15.2" y="14.2" width="5.5" height="3.8" rx="1"/>
    </g>
    <!-- Документы: archival document with accented seal -->
    <g v-else-if="name==='documents'">
      <path class="menu-icon-primary" d="M6 2.7h11l5 5.2v16.4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4.7a2 2 0 0 1 2-2Z"/>
      <path class="menu-icon-primary" d="M17 2.7v5.5h5M8.4 13.4h10M8.4 17.2h7.1"/>
      <circle class="menu-icon-secondary" cx="17.7" cy="21.8" r="3.2"/>
      <path class="menu-icon-secondary" d="m15.8 24.4-1 2.3m4.8-2.3 1 2.3"/>
    </g>
    <!-- Безопасность: two-tone protection shield -->
    <g v-else-if="name==='safety'">
      <path class="menu-icon-primary" d="M14 2.5 4.8 6v7.2c0 6.4 3.6 10 9.2 12.5 5.6-2.5 9.2-6.1 9.2-12.5V6L14 2.5Z"/>
      <path class="menu-icon-secondary" d="m9.2 13.9 3.4 3.4 6.7-7.1"/>
    </g>
    <!-- О ДК: classical culture-house facade with colored roof -->
    <g v-else-if="name==='about'">
      <path class="menu-icon-secondary" d="m2 9 12-6.2L26 9v2H2V9Z"/>
      <path class="menu-icon-primary" d="M2.5 24.4h23M4.5 21.1h19M6.2 11v10m5.2-10v10m5.2-10v10m5.2-10v10"/>
      <path class="menu-icon-secondary" d="M9.7 14h8.6"/>
    </g>
    <!-- Контакты: ID card with accented person -->
    <g v-else-if="name==='contacts'">
      <rect class="menu-icon-primary" x="2.4" y="4" width="23.2" height="20" rx="3"/>
      <circle class="menu-icon-secondary" cx="9" cy="11.1" r="2.4"/>
      <path class="menu-icon-secondary" d="M4.8 19c0-2.7 1.5-4.1 4.2-4.1s4.2 1.4 4.2 4.1"/>
      <path class="menu-icon-primary" d="M16.7 10.7h5M16.7 15.2h5m-5 4.5h3.2"/>
    </g>
    <!-- Навигация: folded map with colored destination pin -->
    <g v-else-if="name==='navigation'">
      <path class="menu-icon-primary" d="m2.8 6.5 7.4-3.2 7.5 3.2 7.5-3.2v18.1l-7.5 3.2-7.5-3.2-7.4 3.2V6.5ZM10.2 3.3v18.1m7.5-14.9v6.1m0 7.2v4.8"/>
      <path class="menu-icon-secondary" d="M22.8 13.2c0 2.7-3.4 5.9-3.4 5.9s-3.5-3.2-3.5-5.9a3.45 3.45 0 0 1 6.9 0Z"/>
      <circle class="menu-icon-secondary-solid" cx="19.4" cy="13.2" r="1"/>
    </g>
  </svg>
</template>
