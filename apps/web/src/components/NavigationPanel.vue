<!-- apps/web/src/components/NavigationPanel.vue — authentic supplied Visio plans with touch markers. -->
<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {CultureNavigation,CultureFloor,FloorPoint} from '../utils/culture-types.js';
const props=withDefaults(defineProps<{navigation:CultureNavigation;editable?:boolean}>(),{editable:false});
const emit=defineEmits<{(e:'add-point',value:{floorId:string;x:number;y:number}):void;
  (e:'select-point',value:{floorId:string;id:string}):void}>();
const floorId=ref('floor-1'),selectedPoint=ref(''),zoom=ref(1),category=ref('all');
const floor=computed<CultureFloor|undefined>(()=>props.navigation.floors.find(x=>x.id===floorId.value));
const selected=computed<FloorPoint|undefined>(()=>floor.value?.points.find(x=>x.id===selectedPoint.value));
const filtered=computed(()=>floor.value?.points.filter(x=>category.value==='all'||x.kind===category.value)??[]);
const labels:Record<FloorPoint['kind'],string>={
 hall:'Зал',studio:'Кабинет',service:'Сервис',stairs:'Лестница',exit:'Выход',other:'Другое',
};
const types=Object.entries(labels).map(([id,name])=>({id,name}));
function chooseFloor(id:string){floorId.value=id;selectedPoint.value='';category.value='all';zoom.value=1;}
function choosePoint(id:string){selectedPoint.value=id;emit('select-point',{floorId:floorId.value,id});}
function addPoint(event:MouseEvent){
 if(!props.editable||!floor.value)return;
 const target=event.currentTarget as HTMLElement,box=target.getBoundingClientRect();
 const x=Math.max(0,Math.min(100,Math.round((event.clientX-box.left)/box.width*1000)/10));
 const y=Math.max(0,Math.min(100,Math.round((event.clientY-box.top)/box.height*1000)/10));
 emit('add-point',{floorId:floorId.value,x,y});
}
function setZoom(delta:number){zoom.value=Math.max(1,Math.min(2.5,Math.round((zoom.value+delta)*10)/10));}
watch(()=>props.navigation.floors,()=>{if(!props.navigation.floors.some(x=>x.id===floorId.value))floorId.value='floor-1';});
defineExpose({chooseFloor,choosePoint});
</script>
<template>
 <section class="floor-navigation" aria-label="Поэтажная навигация Дворца культуры">
  <header class="floor-navigation-head">
    <div><span class="eyebrow">ПЛАН ДВОРЦА КУЛЬТУРЫ</span>
      <h2>{{navigation.title}}</h2><p>{{navigation.intro}}</p></div>
  </header>
  <nav class="floor-navigation-tabs" aria-label="Выбор схемы">
    <button v-for="entry in navigation.floors" :key="entry.id" type="button"
      :class="{active:entry.id===floorId}" :aria-pressed="entry.id===floorId"
      @click="chooseFloor(entry.id)">{{entry.title}}</button>
  </nav>
  <div v-if="floor" class="floor-navigation-layout">
    <div class="floor-navigation-map-container">
      <div class="floor-navigation-toolbar">
        <strong>{{floor.title}}</strong>
        <div class="floor-navigation-zoom">
          <button type="button" aria-label="Уменьшить схему" :disabled="zoom<=1" @click="setZoom(-.25)">−</button>
          <span>{{Math.round(zoom*100)}}%</span>
          <button type="button" aria-label="Увеличить схему" :disabled="zoom>=2.5" @click="setZoom(.25)">+</button>
        </div>
      </div>
      <div class="floor-navigation-viewport" tabindex="0" aria-label="План, прокрутка и увеличение">
        <div class="floor-navigation-map" :style="{width:(zoom*100)+'%'}" @click="addPoint">
          <img :src="'/assets/navigation/'+floor.id+'.webp'" 
            :alt="'План ДК: '+floor.title+'. Схема без неподтверждённых подписей помещений.'"
            draggable="false" loading="lazy"/>
          <button v-for="point in floor.points" :key="point.id" type="button"
            class="floor-navigation-pin" :class="['floor-navigation-pin-'+point.kind,{active:selectedPoint===point.id}]"
            :style="{left:point.x+'%',top:point.y+'%'}" :aria-label="point.title"
            :title="point.title" @click.stop="choosePoint(point.id)">
            <span aria-hidden="true">{{point.kind==='exit'?'↗':point.kind==='stairs'?'⇅':'●'}}</span>
          </button>
        </div>
      </div>
      <p class="floor-navigation-source">{{floor.note}}. Планы перенесены из предоставленного файла Visio.</p>
    </div>
    <aside class="floor-navigation-sidebar">
      <div class="floor-navigation-filters" aria-label="Фильтр отметок">
        <button type="button" :class="{active:category==='all'}" @click="category='all'">Все точки</button>
        <button v-for="type in types" :key="type.id" type="button"
          :class="{active:category===type.id}" @click="category=type.id">{{type.name}}</button>
      </div>
      <div v-if="selected" class="floor-navigation-details">
        <span class="eyebrow">ВЫБРАННЫЙ ОБЪЕКТ</span>
        <h3>{{selected.title}}</h3>
        <strong>{{labels[selected.kind]}}</strong>
        <p>{{selected.description||'Сведения об объекте уточняются.'}}</p>
        <span>Точка на плане: {{Math.round(selected.x)}}% / {{Math.round(selected.y)}}%</span>
      </div>
      <div v-else class="floor-navigation-empty">
        <span>⌖</span>
        <strong>{{floor.points.length?'Нажмите на отметку':'Отметки добавляются администратором'}}</strong>
        <p>{{editable?'Нажмите на место на плане, чтобы создать отметку.':'Здесь появятся названия и описание помещений после проверки сотрудниками ДК.'}}</p>
      </div>
      <div class="floor-navigation-list">
        <strong>Помещения на схеме ({{filtered.length}})</strong>
        <button v-for="point in filtered" :key="point.id" type="button"
          :class="{active:selectedPoint===point.id}" @click="choosePoint(point.id)">
          <span>{{labels[point.kind]}}</span><strong>{{point.title}}</strong><span aria-hidden="true">↗</span>
        </button>
      </div>
    </aside>
  </div>
  <p class="floor-navigation-warning">{{navigation.notice}}</p>
 </section>
</template>