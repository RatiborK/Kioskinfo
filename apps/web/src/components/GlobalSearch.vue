<!-- apps/web/src/components/GlobalSearch.vue — kiosk-wide touch-friendly search overlay. -->
<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import KioskKeyboard from './KioskKeyboard.vue';
import {searchKiosk,type KioskSearchResult, type SearchData} from '../utils/global-search.js';
const props=withDefaults(defineProps<{data:SearchData;initialKeyboard?:boolean}>(),{initialKeyboard:false});
const emit=defineEmits<{(e:'close'):void;(e:'open-result',result:KioskSearchResult):void}>();
const query=ref(''),keyboard=ref(props.initialKeyboard),input=ref<HTMLInputElement|null>(null);
const results=computed(()=>searchKiosk(props.data,query.value));
const suggestions=[
 {name:'Коллективы',query:'коллектив'}, {name:'Концерты',query:'концерт'},
 {name:'Безопасность',query:'безопасность'}, {name:'Документы',query:'прейскурант'},
 {name:'Руководители',query:'руководитель'}, {name:'Билеты',query:'купить билет'}
];
function escape(e:KeyboardEvent){if(e.key==='Escape'){e.stopPropagation();emit('close');}}
onMounted(()=>{window.addEventListener('keydown',escape,true);input.value?.focus({preventScroll:true});});
onBeforeUnmount(()=>window.removeEventListener('keydown',escape,true));
</script>
<template>
 <div class="kiosk-global-search-backdrop" role="presentation">
  <section class="kiosk-global-search" role="dialog" aria-modal="true" aria-label="Поиск по НавиКультуре">
    <header class="kiosk-global-search-top">
      <div><span class="eyebrow">НАВИКУЛЬТУРА / ПОИСК ПО ВСЕЙ СИСТЕМЕ</span>
        <h2>Что хотите найти?</h2></div>
      <button class="kiosk-overlay-close" type="button" @click="emit('close')">✕ <span>Закрыть поиск</span></button>
    </header>
    <div class="kiosk-global-search-input">
      <svg viewBox="0 0 24 24" aria-hidden="true" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>
      </svg>
      <input ref="input" v-model="query" aria-label="Поиск по разделам, коллективам, событиям и документам"
        placeholder="Введите название, руководителя, мероприятие, документ…" type="search"
        maxlength="80" autocomplete="off"/>
      <button v-if="query" type="button" @click="query='';input?.focus()">Очистить</button>
      <button type="button" :aria-expanded="keyboard" @click="keyboard=!keyboard">{{keyboard?'⌨ Скрыть':'⌨ Клавиатура'}}</button>
    </div>
    <div class="kiosk-global-search-results">
      <template v-if="query.trim()">
        <p class="kiosk-global-count" role="status">Найдено: {{results.length}}</p>
        <div v-if="results.length" class="kiosk-global-result-grid">
          <button v-for="result in results" :key="result.section+result.id" type="button"
            class="kiosk-global-result" @click="emit('open-result',result)">
            <small>{{result.kind}}</small>
            <strong>{{result.title}}</strong>
            <span>{{result.subtitle}}</span>
            <i aria-hidden="true">↗</i>
          </button>
        </div>
        <p v-else class="kiosk-global-empty">Ничего не найдено. Попробуйте изменить запрос.</p>
      </template>
      <div v-else class="kiosk-global-suggestions">
        <p>Популярные разделы</p>
        <div><button v-for="suggest in suggestions" :key="suggest.name" type="button" @click="query=suggest.query">
          {{suggest.name}} <span aria-hidden="true">↗</span>
        </button></div>
      </div>
    </div>
    <div v-if="keyboard" class="kiosk-global-keyboard"><KioskKeyboard v-model="query" @close="keyboard=false"/></div>
  </section>
 </div>
</template>