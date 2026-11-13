<!-- apps/web/src/components/KioskMenuIcon.vue — thematic glyphs for DK sections.
     Poster and calendar retain the original symbols chosen by the curator. -->
<script setup lang="ts">
defineProps<{name:string}>();
</script>
<template>
 <svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true" focusable="false"
  fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <g v-if="name==='groups'">
    <path d="M2.5 3.5h8v7c0 4-1.9 6.4-4 8.1-2.3-1.7-4-4.1-4-8.1v-7Z"/>
    <path d="M13.5 5.5h8v7c0 4-2 6.6-4 8-2.3-1.4-4-4-4-8v-7Z"/>
    <path d="M4.8 8.2h.1m3.2 0h.1m-3.4 4.3q1.7-1.7 3.6 0"/>
    <path d="M15.7 10.3h.1m3 0h.1m-3.2 4.5q1.8 2.3 3.6 0"/>
  </g>
  <g v-else-if="name==='documents'">
    <path d="M6 3h11a4 4 0 0 1 4 4v14H7a4 4 0 0 1-4-4V7a4 4 0 0 1 3-4Z"/>
    <path d="M7 3v14a2 2 0 1 1-4 0M11 8h7M11 12h7M11 16h4"/>
  </g>
  <g v-else-if="name==='safety'">
    <path d="M12 2 4.5 5v6c0 5.4 3.1 8.7 7.5 11 4.4-2.3 7.5-5.6 7.5-11V5L12 2Z"/>
    <path d="m8.5 12.3 2.4 2.2 4.8-5"/>
  </g>
  <g v-else-if="name==='about'">
    <path d="m3 9 9-6 9 6v2H3V9ZM2 21h20M4 18.5h16M5.5 11v7.5M10 11v7.5M14 11v7.5M18.5 11v7.5"/>
  </g>
  <g v-else-if="name==='contacts'">
    <rect x="2.5" y="3.5" width="19" height="17" rx="2"/>
    <circle cx="8.5" cy="10" r="2.1"/>
    <path d="M5 16.5c0-2 1.4-3.1 3.5-3.1s3.5 1.1 3.5 3.1M15 9h3.5M15 13h3.5M15 17h2.5"/>
  </g>
  <g v-else-if="name==='navigation'">
    <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>
    <circle cx="17.5" cy="11" r="1.3"/>
  </g>
 </svg>
</template>
