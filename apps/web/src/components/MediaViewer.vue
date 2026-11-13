<!-- apps/web/src/components/MediaViewer.vue — kiosk modal player; no provider pages or external navigation. -->
<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import {resolveVideoSource} from '../utils/video-sources.js';
const props=defineProps<{url:string;title:string}>();
const emit=defineEmits<{(e:'close'):void}>();
const source=computed(()=>resolveVideoSource(props.url));
const failed=ref(false);
function keyDown(event:KeyboardEvent){
  if(event.key==='Escape'){event.stopPropagation();emit('close');}
}
onMounted(()=>document.addEventListener('keydown',keyDown,true));
onBeforeUnmount(()=>document.removeEventListener('keydown',keyDown,true));
</script>
<template>
 <div class="kiosk-video-scrim">
  <section class="kiosk-video-panel" role="dialog" aria-modal="true" :aria-label="'Видео: '+title">
    <header>
      <h2>{{title}}</h2>
      <button type="button" autofocus @click="emit('close')">✕ Закрыть видео</button>
    </header>
    <div class="kiosk-video-stage">
      <video v-if="source?.kind==='file'" :src="source.src" controls playsinline
        preload="metadata" controlslist="nodownload" @error="failed=true"
        :aria-label="'Видеоплеер: '+title"></video>
      <iframe v-else-if="source?.kind==='embed'" :src="source.src"
        :title="'Видеоплеер: '+title" loading="eager" allowfullscreen
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div v-else class="kiosk-video-error" role="alert">
        Указана не ссылка на видео. Нужен адрес ролика VK Видео, RUTUBE, YouTube или локальный файл MP4/WebM, загруженный в каталог ДК.
      </div>
      <p v-if="failed" class="kiosk-video-error" role="alert">
        Видео не загрузилось. Проверьте формат файла и доступность сервера.
      </p>
    </div>
    <p class="kiosk-video-help">Видео открыто внутри НавиКультуры. Некоторые авторы запрещают встраивание своих роликов: в таком случае загрузите разрешённую локальную копию. Закрытие окна останавливает воспроизведение.</p>
  </section>
 </div>
</template>
