<!-- apps/web/src/components/CollectivesDirectory.vue — catalog by category, portraits and video labels. -->
<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {CultureContent,CultureCollective} from '../utils/culture-types.js';
const props=defineProps<{content:CultureContent;initialId?:string}>();
const emit=defineEmits<{(e:'open-video',url:string,title:string):void}>();
const category=ref('all'),query=ref(''),searchOpen=ref(false),selectedId=ref('');
const categories=computed(()=>[{id:'all',title:'Все направления',symbol:'∞',description:'Весь каталог'},...props.content.categories]);
const filtered=computed(()=>{
  const term=query.value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  return props.content.collectives.filter(group=>{
    if(category.value!=='all'&&group.category!==category.value)return false;
    if(!term)return true;
    const leaderNames=group.leaderIds.map(id=>props.content.leaders.find(p=>p.id===id)?.name??'').join(' ');
    return [group.name,group.description,leaderNames,group.room,group.programs.join(' ')]
      .join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(term);
  });
});
const selected=computed(()=>props.content.collectives.find(x=>x.id===selectedId.value)??null);
const currentLeaders=computed(()=>selected.value?.leaderIds.map(id=>props.content.leaders.find(x=>x.id===id))
  .filter((x):x is CultureContent['leaders'][number]=>Boolean(x))??[]);
const selectedCategory=computed(()=>props.content.categories.find(c=>c.id===selected.value?.category));
function choose(id:string){category.value=id;selectedId.value='';}
function open(group:CultureCollective){selectedId.value=group.id;}
function back(){selectedId.value='';}
function toggleSearch(){searchOpen.value=!searchOpen.value;if(!searchOpen.value)query.value='';}
watch(()=>props.initialId,id=>{if(id&&props.content.collectives.some(g=>g.id===id)){
   selectedId.value=id;category.value='all';
 }},{immediate:true});
watch(()=>props.content.collectives,(rows)=>{
  if(selectedId.value&&!rows.find(row=>row.id===selectedId.value))selectedId.value='';
});
defineExpose({toggleSearch});
</script>
<template>
  <section class="culture-directory" aria-label="Каталог коллективов ДК">
    <template v-if="!selected">
      <div class="culture-intro-row">
        <p>Творческие коллективы для детей и взрослых. Выберите направление или найдите занятие по названию, руководителю и кабинету.</p>
        <button type="button" class="culture-search-toggle" :aria-expanded="searchOpen" @click="toggleSearch">
          <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>
          </svg>
          {{searchOpen?'Скрыть поиск':'Найти коллектив'}}
        </button>
      </div>
      <Transition name="kiosk-search">
        <div v-if="searchOpen" class="culture-directory-search">
          <label for="culture-group-search">Поиск по коллективам</label>
          <div><input id="culture-group-search" v-model="query" type="search" maxlength="80"
            placeholder="Название, руководитель, кабинет" autocomplete="off"/>
            <button v-if="query" type="button" @click="query=''">Очистить</button></div>
        </div>
      </Transition>
      <div class="culture-category-grid">
        <button v-for="cat in categories" :key="cat.id" type="button" class="culture-category"
          :class="{active:category===cat.id}" :aria-pressed="category===cat.id" @click="choose(cat.id)">
          <span>{{cat.symbol}}</span><strong>{{cat.title}}</strong>
          <small>{{cat.id==='all'?content.collectives.length:content.collectives.filter(x=>x.category===cat.id).length}} коллективов</small>
        </button>
      </div>
      <div class="culture-count-row"><h2>{{category==='all'?'Творческие объединения':categories.find(x=>x.id===category)?.title}}</h2>
        <span>{{filtered.length}} из {{content.collectives.length}}</span></div>
      <TransitionGroup name="kiosk-card" tag="div" class="culture-group-grid">
        <button v-for="group in filtered" :key="group.id" type="button" class="culture-group-card" @click="open(group)">
          <span v-if="group.photo" class="culture-group-picture"><img :src="group.photo" :alt="'Фотография '+group.name" loading="lazy"/></span>
          <span v-else class="culture-group-picture culture-picture-placeholder">
            <span>{{categories.find(c=>c.id===group.category)?.symbol??'✦'}}</span>
            <small>Фото коллектива</small>
          </span>
          <span class="culture-group-info">
            <small>{{categories.find(c=>c.id===group.category)?.title}}</small>
            <strong>{{group.name}}</strong>
            <span>{{group.age?group.age+' · ':''}}{{group.room||'Место уточняется'}}</span>
            <em>Подробнее ↗</em>
          </span>
        </button>
      </TransitionGroup>
      <div v-if="!filtered.length" class="culture-empty">
        По вашему запросу коллективы не найдены. Попробуйте другое название или категорию.
      </div>
      <p class="culture-data-note">Каталог первоначально составлен по расписанию ДК; сведения о времени занятий уточняются администрацией.</p>
    </template>
    <article v-else class="culture-profile">
      <button type="button" class="schedule-back" @click="back">← Все коллективы</button>
      <div class="culture-profile-hero">
        <div class="culture-profile-photo" :class="{empty:!selected.photo}">
          <img v-if="selected.photo" :src="selected.photo" :alt="selected.name"/>
          <div v-else><span>{{selectedCategory?.symbol||'✦'}}</span><small>Фотография появится здесь</small></div>
        </div>
        <div class="culture-profile-intro">
          <span class="eyebrow">{{selectedCategory?.title.toUpperCase()}}</span>
          <h2>{{selected.name}}</h2>
          <p>{{selected.description}}</p>
          <div class="culture-profile-tags">
            <span v-if="selected.age">{{selected.age}}</span>
            <span v-if="selected.room">{{selected.room}}</span>
          </div>
          <button v-if="selected.videoUrl" type="button" class="culture-video-link"
            @click="emit('open-video',selected.videoUrl,selected.name)">
            <span aria-hidden="true">▶</span> Смотреть видео коллектива
          </button>
          <span v-else class="culture-video-missing"><span aria-hidden="true">▶</span> Видео коллектива — скоро</span>
        </div>
      </div>
      <div class="culture-profile-columns">
        <section class="culture-profile-section"><span class="eyebrow">ИСТОРИЯ И ДЕЯТЕЛЬНОСТЬ</span>
          <h3>О коллективе</h3>
          <p v-if="selected.history">{{selected.history}}</p>
          <p v-else>История этого коллектива будет дополнена архивными материалами и фотографиями сотрудников ДК.</p>
        </section>
        <section class="culture-profile-section"><span class="eyebrow">ГДЕ И КОГДА</span><h3>Расписание занятий</h3>
          <div class="culture-profile-meta"><b>Занятия</b><span>{{selected.schedule||'Уточняется у сотрудников ДК'}}</span></div>
          <div class="culture-profile-meta"><b>Помещение</b><span>{{selected.room||'Уточняется'}}</span></div>
          <div v-if="selected.age" class="culture-profile-meta"><b>Возраст</b><span>{{selected.age}}</span></div>
        </section>
      </div>
      <section v-if="selected.programs.length" class="culture-profile-section culture-programs">
        <span class="eyebrow">ГРУППЫ И НАПРАВЛЕНИЯ</span><h3>Программы</h3>
        <div class="culture-program-grid"><span v-for="program in selected.programs" :key="program">{{program}}</span></div>
      </section>
      <section class="culture-profile-section">
        <span class="eyebrow">ПЕДАГОГИ И РУКОВОДИТЕЛИ</span><h3>Наши руководители</h3>
        <div class="culture-leaders-grid">
          <article v-for="leader in currentLeaders" :key="leader.id" class="culture-leader-card">
            <div v-if="leader.photo" class="culture-leader-image"><img :src="leader.photo" :alt="leader.name" loading="lazy"/></div>
            <div v-else class="culture-leader-image culture-leader-placeholder">
              <span aria-hidden="true">◉</span><small>Фото руководителя</small>
            </div>
            <div><strong>{{leader.name}}</strong>
              <p>{{leader.bio||'Информация о профессиональном пути будет дополнена сотрудниками учреждения.'}}</p>
            </div>
          </article>
        </div>
      </section>
      <p class="culture-source">Источник: {{selected.source}}. Сведения о занятиях могут уточняться.</p>
    </article>
  </section>
</template>