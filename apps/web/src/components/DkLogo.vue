<!-- apps/web/src/components/DkLogo.vue
  Reusable DK branding. The mark is the approved SVG under public/brand.
  Keep the sign stable across eight visitor themes and staff tools. -->
<template>
  <span class="dk-brand-lockup" role="img" aria-label="Кировский — Дворец культуры, Красноярск">
    <img class="dk-brand-mark" src="/brand/dk-kirovsky-symbol.svg" alt="" aria-hidden="true"
      width="90" height="100" decoding="async" />
    <span class="dk-brand-wordmark" aria-hidden="true">
      <strong class="dk-brand-name">КИРОВСКИЙ</strong>
      <span class="dk-brand-subline">ДВОРЕЦ КУЛЬТУРЫ</span>
      <small class="dk-brand-city">КРАСНОЯРСК</small>
    </span>
  </span>
</template>
