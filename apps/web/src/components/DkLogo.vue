<!-- apps/web/src/components/DkLogo.vue
     Local vector recreation of the DK Kirovsky mark from the supplied image.
     Replace with the institution's approved master SVG when available.
     No external image requests; the wordmark stays visible on every visitor theme. -->
<script setup lang="ts">
import {useId} from 'vue';
const titleId=useId();
</script>
<template>
  <svg class="dk-brand-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 424 96"
    role="img" :aria-labelledby="titleId" preserveAspectRatio="xMinYMid meet">
    <title :id="titleId">Кировский — Дворец культуры</title>
    <g class="dk-brand-symbol">
      <!-- Angular letter K / architectural silhouette -->
      <path fill="#17191c" d="M7 29 25 18v61L7 71Z"/>
      <path fill="#17191c" d="M29 17 43 9v64L29 81Z"/>
      <path fill="#17191c" d="M48 11 64 3v31L48 42Z"/>
      <path fill="#17191c" d="M76 24 91 18 62 46 93 60 76 68 47 51Z"/>
      <!-- Orange and blue brand folds, matching the supplied reference -->
      <path fill="#fa6900" d="M43 52 56 58v28L43 79Z"/>
      <path fill="#0868bf" d="m56 58 26 15v18L56 76Z"/>
      <path fill="#f28b22" d="m29 72 13-8v15L29 86Z"/>
    </g>
    <g fill="#111316" font-family="'Arial Narrow','Arial Black','Segoe UI',Arial,sans-serif">
      <text x="108" y="48" font-size="41" font-weight="950" letter-spacing="-1.6">КИРОВСКИЙ</text>
      <text x="111" y="72" font-size="15" font-weight="800" letter-spacing="5.2">ДВОРЕЦ КУЛЬТУРЫ</text>
    </g>
  </svg>
</template>
