<!-- apps/web/src/components/DkLogo.vue — exact approved mark, adaptive dark ink in UI. -->
<template>
  <span class="dk-brand-lockup" role="img" aria-label="Кировский — Дворец культуры, Красноярск">
    <!-- Keep geometry and orange/blue fills identical to public/brand/dk-kirovsky-symbol.svg.
         Only the original black polygons inherit accessible ink from their current theme. -->
    <svg class="dk-brand-mark" xmlns="http://www.w3.org/2000/svg" viewBox="128 90 990 1100"
      width="90" height="100" fill="none" aria-hidden="true" focusable="false">
      <polygon points="502,250 313,321 302,382 262,394 142,995 200,979 185,1074 408,998" fill="currentColor"/>
      <polygon points="791,162 562,104 523,309 476,655 716,540" fill="currentColor"/>
      <polygon points="1102,413 556,650 553,710 679,815 1102,647" fill="currentColor"/>
      <polygon points="474,681 423,1048 578,1086 621,812" fill="#FF7900"/>
      <polygon points="643,825 604,1083 902,1176 901,946" fill="#0874FF"/>
    </svg>
    <span class="dk-brand-wordmark" aria-hidden="true">
      <strong class="dk-brand-name">КИРОВСКИЙ</strong>
      <span class="dk-brand-subline">ДВОРЕЦ КУЛЬТУРЫ</span>
      <small class="dk-brand-city">КРАСНОЯРСК</small>
    </span>
  </span>
</template>
