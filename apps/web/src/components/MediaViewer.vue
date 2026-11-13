<!-- apps/web/src/components/MediaViewer.vue — embedded media, no new browser tabs. -->
<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount} from 'vue';
const props=defineProps<{url:string;title:string}>();
const emit=defineEmits<{(e:'close'):void}>();
const source=computed(()=>{
 try{
  const url=new URL(props.url);
  if(url.protocol!=='https:'||url.username||url.password)return null;
  const hosts=['vk.com','vkvideo.ru','rutube.ru','www.rutube.ru','youtube.com','www.youtube.com','youtu.be'];
  return hosts.includes(url.hostname.toLowerCase())?url.href:null;
 }catch{return null;}
});
function keyDown(event:KeyboardEvent){if(event.key==='Escape'){event.stopPropagation();emit('close');}}
onMounted(()=>document.addEventListener('keydown',keyDown,true));
onBeforeUnmount(()=>document.removeEventListener('keydown',keyDown,true));
</script>
<template>
 <div class="kiosk-video-scrim" role="presentation">
  <section class="kiosk-video-panel" role="dialog" aria-modal="true" :aria-label="'Видео: '+title">
    <header><h2>{{title}}</h2><button type="button" autofocus @click="emit('close')">✕ Закрыть видео</button></header>
    <iframe v-if="source" :src="source" :title="title" loading="eager"
      sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>
    <p v-else>Для этого видео требуется корректная ссылка на разрешённую видеоплатформу.</p>
    <p class="kiosk-video-help">Если видео не отображается, потребуется прямая ссылка на встраивание или локальный видеофайл. Переходы на другие сайты отключены.</p>
  </section>
 </div>
</template>