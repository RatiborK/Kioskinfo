<!-- apps/web/src/components/SafetyMedia.vue — original prevention leaflets from DK, displayed inside kiosk. -->
<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
const props=defineProps<{sectionId:string}>();
type Leaflet={name:string;title:string;caption:string};
const registry:Record<string,Leaflet[]>={
 extremism:[
  {name:'extremism1-1.webp',title:'Экстремизму — нет',caption:'Памятка: определения, виды и действия при обнаружении материалов'},
  {name:'extremism2-1.webp',title:'Ответственность за экстремизм',caption:'Административная и уголовная ответственность, памятка учреждения'},
  {name:'prosecutor-1.webp',title:'Транспортная прокуратура · 1/4',caption:'Что такое экстремизм и правовые основы'},
  {name:'prosecutor-2.webp',title:'Транспортная прокуратура · 2/4',caption:'Ответственность по статье 20.3 КоАП РФ'},
  {name:'prosecutor-3.webp',title:'Транспортная прокуратура · 3/4',caption:'Статьи 20.3.1, 20.29, 13.53 КоАП РФ'},
  {name:'prosecutor-4.webp',title:'Транспортная прокуратура · 4/4',caption:'Уголовная ответственность по УК РФ'},
 ],
 diversion:[{name:'sabotage.webp',title:'Поджог — преступление',caption:'Информационный плакат о безопасности транспортной инфраструктуры'}],
};
const items=computed(()=>registry[props.sectionId]??[]);
const active=ref<number|null>(null);
function close(){active.value=null;}
function move(direction:number){
 if(active.value!==null)active.value=(active.value+direction+items.value.length)%items.value.length;
}
function keydown(e:KeyboardEvent){
 if(active.value===null)return;
 if(e.key==='Escape'){e.stopPropagation();close();}
 if(e.key==='ArrowRight')move(1);
 if(e.key==='ArrowLeft')move(-1);
}
onMounted(()=>window.addEventListener('keydown',keydown,true));
onBeforeUnmount(()=>window.removeEventListener('keydown',keydown,true));
</script>
<template>
 <div v-if="items.length" class="safety-media">
  <span class="eyebrow">МАТЕРИАЛЫ ДЛЯ ОЗНАКОМЛЕНИЯ</span>
  <div class="safety-media-grid">
   <button v-for="(item,index) in items" :key="item.name" class="safety-media-tile" type="button" @click="active=index">
    <img :src="'/assets/safety/'+item.name" :alt="item.title" loading="lazy"/>
    <span><strong>{{item.title}}</strong><small>Развернуть памятку ↗</small></span>
   </button>
  </div>
  <p>Материалы предоставлены в исходном виде. Для правовых выводов сверяйте действующую редакцию законодательства.</p>
  <div v-if="active!==null" class="safety-media-backdrop">
   <section class="safety-media-dialog" role="dialog" aria-modal="true" :aria-label="items[active]?.title">
    <header><strong>{{items[active]?.title}}</strong><button type="button" autofocus @click="close">✕ Закрыть</button></header>
    <div class="safety-media-dialog-content">
      <img :src="'/assets/safety/'+items[active]?.name" :alt="items[active]?.title"/>
    </div>
    <footer>
      <button type="button" :disabled="items.length<2" @click="move(-1)">← Предыдущая</button>
      <span>{{active+1}} / {{items.length}} · {{items[active]?.caption}}</span>
      <button type="button" :disabled="items.length<2" @click="move(1)">Следующая →</button>
    </footer>
   </section>
  </div>
 </div>
</template>