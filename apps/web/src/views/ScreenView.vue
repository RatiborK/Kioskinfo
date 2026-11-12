<!-- apps/web/src/views/ScreenView.vue — themed touchscreen interface with live posters and searchable schedule. -->
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import {useRoute} from 'vue-router';
import EventCalendar from '../components/EventCalendar.vue';
import DocumentLibrary from '../components/DocumentLibrary.vue';
import CollectivesDirectory from '../components/CollectivesDirectory.vue';
import CultureLanding from '../components/CultureLanding.vue';
import type {CultureContent} from '../utils/culture-types.js';
import type {PublicEvent,PublicDocument as Document} from '../utils/content-types.js';
import KioskKeyboard from '../components/KioskKeyboard.vue';
import {filterSchedule} from '../utils/kiosk-search.js';
import {visiblePosterWindow,shouldReturnHome} from '../utils/kiosk-behavior.js';

const items = [
  { id: 'posters', label: 'Афиша', icon: '✦' },
  { id: 'schedule', label: 'Расписание', icon: '◷' },
  { id: 'groups', label: 'Коллективы', icon: '◎' },
  { id: 'calendar', label: 'Календарь событий', icon: '▦' },
  { id: 'documents', label: 'Документы ДК', icon: '▤' },
  { id: 'navigation', label: 'Навигация', icon: '⌖' },
  { id: 'about', label: 'О ДК', icon: '▣' },
  { id: 'safety', label: 'Безопасность', icon: '◇' },
  { id: 'tickets', label: 'Билеты', icon: '◈' },
  { id: 'contacts', label: 'Контакты', icon: '↗' },
] as const;
const route=useRoute();
const initialSection=route.query.section;
const current = ref<(typeof items)[number]['id']>(
  items.some(item=>item.id===initialSection)?initialSection as (typeof items)[number]['id']:'posters');
const events=ref<PublicEvent[]>([]);
const documents=ref<Document[]>([]);
const culture=ref<CultureContent|null>(null);
const directoryRef=ref<{toggleSearch:()=>void}|null>(null);
async function reloadCulture(){
  try{const response=await fetch('/api/public/culture',{cache:'no-store'});
    if(response.ok){const data:{content:CultureContent}=await response.json();culture.value=data.content;}
  }catch{/* Last published content remains on screen during temporary connection errors. */}
}
const initialDocumentId=typeof route.query.document==='string'?route.query.document:'';
async function reloadEvents(){
  try{const r=await fetch('/api/public/events',{cache:'no-store'});
    if(r.ok){const data:{events:PublicEvent[]}=await r.json();events.value=data.events;}
  }catch{/* The last received published calendar remains visible while offline. */}
}
async function reloadDocuments(){
  try{const r=await fetch('/api/public/documents',{cache:'no-store'});
    if(r.ok){const data:{documents:Document[]}=await r.json();documents.value=data.documents;}
  }catch{/* Do not hide already received documents on a transient network failure. */}
}
const welcome = ref<{ title:string; body:string } | null>(null);
type VisitorTheme='dk'|'holiday'|'modern'|'aurora'|'poster'|'gallery'|'neon'|'kids';
const visitorTheme=ref<VisitorTheme>('dk');
const knownThemeIds=new Set(['dk','holiday','modern','aurora','poster','gallery','neon','kids']);
async function reloadVisitorTheme(){
  try{
    const response=await fetch('/api/public/theme',{cache:'no-store'});
    if(!response.ok)return;
    const body:{theme:string}=await response.json();
    if(knownThemeIds.has(body.theme))visitorTheme.value=body.theme as VisitorTheme;
  }catch{/* Keep the last known theme while offline. */}
}
type Poster = {name:string; title:string; kind:'image'|'video'; url:string; updatedAt:string};
const posters = ref<Poster[]>([]);
const posterIndex = ref(0);
const posterError = ref('');
type ScheduleEntry = { id:string;label:string;group:string;leader:string;time:string;room:string;description:string;age:string;theme:'orange'|'blue'|'neutral' };
type SchedulePayload = {entries:ScheduleEntry[];version:string;stale:boolean;message:string};
const schedule = ref<ScheduleEntry[]>([]);
const selectedScheduleId = ref<string|null>(null);
const scheduleStatus = ref('');
const searchQuery=ref('');
const keyboardOpen=ref(false);
const searchOpen=ref(false);
const searchInput=ref<HTMLInputElement|null>(null);
const filteredSchedule=computed(()=>filterSchedule(schedule.value,searchOpen.value?searchQuery.value:''));
const selectedSchedule = computed(()=>schedule.value.find(x=>x.id===selectedScheduleId.value) ?? null);
async function reloadSchedule(){
  try {
    const res=await fetch('/api/public/schedule',{cache:'no-store'});
    if(!res.ok) throw new Error('Расписание временно недоступно');
    const data:SchedulePayload=await res.json();
    schedule.value=data.entries;
    if(selectedScheduleId.value && !data.entries.some(x=>x.id===selectedScheduleId.value)) selectedScheduleId.value=null;
    scheduleStatus.value=data.stale?'Данные временно не обновляются. Показана последняя корректная версия.':'';
  } catch { scheduleStatus.value='Нет соединения. Показаны последние полученные данные.'; }
}
let reloadHandle: ReturnType<typeof setInterval> | undefined;
let slideshowHandle: ReturnType<typeof setInterval> | undefined;
let idleHandle: ReturnType<typeof setInterval> | undefined;
let lastActivity=Date.now();
let lastManualPosterInput=0;
const IDLE_RETURN_MS=180000;
function noteActivity(){lastActivity=Date.now();}
function changeSection(section:(typeof items)[number]['id']){
  noteActivity();
  // Navigation changes the entire page; a previous visitor's query must not leak to another section.
  if(section!==current.value){
    current.value=section;
    selectedScheduleId.value=null;
    searchOpen.value=false;
    keyboardOpen.value=false;
    searchQuery.value='';
  }
}
function focusSearchInput(){searchInput.value?.focus({preventScroll:true});}
function focusSchedulePanel(){
  if(selectedSchedule.value){
    document.querySelector<HTMLElement>('.schedule-detail [data-schedule-title]')?.focus({preventScroll:true});
  }else if(searchOpen.value){
    focusSearchInput();
  }else{
    document.querySelector<HTMLElement>('.schedule-index-layout .schedule-button')?.focus({preventScroll:true});
  }
}
function focusCurrentPage(){
  document.querySelector<HTMLElement>('.screen-content')?.scrollTo({top:0,behavior:'instant'});
  if(searchOpen.value && (current.value==='schedule'||current.value==='groups')){
    focusSearchInput();return;
  }
  document.querySelector<HTMLElement>('.screen-content [data-page-title]')?.focus({preventScroll:true});
}
function toggleSearch(){
  noteActivity();
  if(current.value==='groups'){directoryRef.value?.toggleSearch();return;}
  if(current.value!=='schedule'){
    selectedScheduleId.value=null;
    keyboardOpen.value=false;
    searchQuery.value='';
    searchOpen.value=true;
    current.value='schedule';
    return;
  }
  if(selectedScheduleId.value)selectedScheduleId.value=null;
  searchOpen.value=!searchOpen.value;
  if(!searchOpen.value){
    searchQuery.value='';
    keyboardOpen.value=false;
  }
}
function openSchedule(id:string){noteActivity();keyboardOpen.value=false;selectedScheduleId.value=id;}
function backToSchedule(){noteActivity();selectedScheduleId.value=null;}
function resetIfIdle(){
  if(!shouldReturnHome(lastActivity,Date.now(),IDLE_RETURN_MS))return;
  if(current.value!=='posters'||selectedScheduleId.value||searchOpen.value||keyboardOpen.value||searchQuery.value){
    current.value='posters';selectedScheduleId.value=null;searchOpen.value=false;keyboardOpen.value=false;searchQuery.value='';
    posterIndex.value=0;
  }
}
async function reloadPosters(){
  try {
    const response = await fetch('/api/public/posters', {cache:'no-store'});
    if(!response.ok) throw new Error('Пока нет соединения с медиасервером');
    const data:{posters:Poster[]} = await response.json();
    const previous=posters.value[posterIndex.value]?.name;
    posters.value=data.posters;
    const index=posters.value.findIndex(item=>item.name===previous);
    posterIndex.value=index>=0?index:0;
    posterError.value='';
  }catch { posterError.value='Афиши пока недоступны. Отображается последняя полученная подборка.'; }
}
function movePoster(direction:1|-1,manual=true){
  if(manual){lastManualPosterInput=Date.now();noteActivity();}
  if(posters.value.length)posterIndex.value=(posterIndex.value+posters.value.length+direction)%posters.value.length;
}
const activePoster=computed(()=>posters.value[posterIndex.value]);
const posterThumbs=computed(()=>visiblePosterWindow(posters.value,posterIndex.value,6));
function selectPoster(index:number){lastManualPosterInput=Date.now();noteActivity();posterIndex.value=index;}
onMounted(async () => {
  await Promise.all([reloadPosters(),reloadSchedule(),reloadVisitorTheme(),reloadEvents(),reloadDocuments(),reloadCulture()]);
  reloadHandle=setInterval(()=>{void reloadPosters();void reloadSchedule();void reloadVisitorTheme();void reloadEvents();void reloadDocuments();void reloadCulture();},10000);
  slideshowHandle=setInterval(()=>{if(activePoster.value?.kind!=='video' && Date.now()-lastManualPosterInput>=12000)movePoster(1,false);},8000);
  idleHandle=setInterval(resetIfIdle,12000);
  window.addEventListener('pointerdown',noteActivity,{passive:true});
  window.addEventListener('keydown',noteActivity);
  try { const response = await fetch('/api/public/pages/welcome', {cache:'no-store'});
    if (response.ok) {const data:{page:{title:string;body:string}} = await response.json(); welcome.value=data.page;}
  } catch { /* available only when API and DB are running */ }
});
const selected = computed(() => items.find((item) => item.id === current.value) ?? items[0]);
onBeforeUnmount(()=>{if(reloadHandle)clearInterval(reloadHandle);if(slideshowHandle)clearInterval(slideshowHandle);
  if(idleHandle)clearInterval(idleHandle);
  window.removeEventListener('pointerdown',noteActivity);window.removeEventListener('keydown',noteActivity);
});
</script>

<template>
  <main class="shell screen-shell" :data-visitor-theme="visitorTheme">
    <Transition name="kiosk-page" mode="out-in" @after-enter="focusCurrentPage">
      <div :key="current" class="screen-content">
      <header class="brand-row">
        <div class="brand-glyph" aria-hidden="true">Н</div>
        <div class="brand-copy"><strong>НАВИКУЛЬТУРА</strong><span>ЦИФРОВОЙ ИНФОЦЕНТР · ГДК «КИРОВСКИЙ»</span></div>
        <button type="button" class="kiosk-search-trigger" :class="{active:searchOpen&&(current==='schedule'||current==='groups')}"
          :aria-expanded="searchOpen&&(current==='schedule'||current==='groups')"
          :aria-controls="searchOpen&&(current==='schedule'||current==='groups')?'kiosk-search-panel':undefined"
          :aria-label="searchOpen&&(current==='schedule'||current==='groups')?'Закрыть поиск':'Открыть поиск по коллективам'"
          title="Поиск" @click="toggleSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="27" height="27" fill="none"
            stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>
          </svg>
        </button>
        <span class="stage-note">ДК «КИРОВСКИЙ» · КРАСНОЯРСК</span>
      </header>
      <section v-if="current==='posters'" class="poster-gallery" aria-label="Актуальные афиши">
        <div class="poster-heading"><span class="hero-overline">ПРОГРАММА МЕРОПРИЯТИЙ</span><h1 data-page-title tabindex="-1">Афиша<span class="dot">.</span></h1></div>
        <div v-if="activePoster" class="poster-stage">
          <Transition name="kiosk-poster">
            <img v-if="activePoster.kind==='image'" :key="'image:'+activePoster.name"
              class="poster-media" :src="activePoster.url" :alt="activePoster.title" />
            <video v-else :key="'video:'+activePoster.name"
              class="poster-media" :src="activePoster.url" autoplay muted playsinline controls
              @ended="movePoster(1,false)"></video>
          </Transition>
          <div class="poster-caption"><strong>{{activePoster.title}}</strong><span>{{posterIndex+1}} / {{posters.length}}</span></div>
          <div v-if="posters.length>1" class="poster-controls"><button type="button" aria-label="Предыдущая афиша" @click="movePoster(-1)">‹</button><button type="button" aria-label="Следующая афиша" @click="movePoster(1)">›</button></div>
        </div>
        <div v-if="posters.length>1" class="poster-filmstrip" aria-label="Выбор афиши">
          <button v-for="item in posterThumbs" :key="item.poster.name" type="button" class="poster-thumbnail"
            :class="{active:posterIndex===item.index}" :aria-current="posterIndex===item.index?'true':undefined"
            :aria-label="'Афиша '+(item.index+1)+': '+item.poster.title" @click="selectPoster(item.index)">
            <img v-if="item.poster.kind==='image'" :src="item.poster.url" alt="" loading="lazy" />
            <span v-else class="poster-thumbnail-video">Видео</span>
            <span class="poster-thumbnail-index">{{item.index+1}}</span>
          </button>
        </div>
        <div v-if="!activePoster" class="poster-empty"><strong>Афиши появятся здесь автоматически</strong><p>Сотрудники могут добавить JPG, PNG или WebP через редактор или папку на сервере.</p></div>
        <p v-if="posterError" class="poster-warning" role="status">{{posterError}}</p>
      </section>
      <section v-else-if="current==='schedule'" class="schedule-section" aria-live="polite">
        <div class="schedule-header"><span class="hero-overline">ГДК «КИРОВСКИЙ» · ИНФОРМАЦИЯ</span><h1 data-page-title tabindex="-1">Расписание<span class="dot">.</span></h1></div>
        <Transition name="kiosk-detail" mode="out-in" @after-enter="focusSchedulePanel">
          <div v-if="selectedSchedule" :key="'detail:'+selectedSchedule.id" class="schedule-detail-layout">
          <button type="button" class="schedule-back" @click="backToSchedule">← Все направления</button>
          <article class="schedule-detail">
            <span class="eyebrow">КАРТОЧКА КОЛЛЕКТИВА</span>
            <h2 data-schedule-title tabindex="-1">{{selectedSchedule.group}}</h2>
            <div class="schedule-detail-rows">
              <p v-if="selectedSchedule.leader"><b>Руководитель</b><span>{{selectedSchedule.leader}}</span></p>
              <p v-if="selectedSchedule.time"><b>Занятия</b><span>{{selectedSchedule.time}}</span></p>
              <p v-if="selectedSchedule.room"><b>Кабинет</b><span>{{selectedSchedule.room}}</span></p>
              <p v-if="selectedSchedule.age"><b>Возраст</b><span>{{selectedSchedule.age}}</span></p>
              <p v-if="selectedSchedule.description"><b>Описание</b><span>{{selectedSchedule.description}}</span></p>
            </div>
          </article>
          </div>
          <div v-else key="catalog" class="schedule-index-layout">
          <Transition name="kiosk-search" @after-enter="focusSearchInput">
          <div v-if="searchOpen" id="kiosk-search-panel" class="kiosk-search-panel" role="search" aria-label="Найти направление или коллектив">
            <label for="schedule-search">Поиск по коллективам, руководителям и кабинетам</label>
            <div class="kiosk-search-row">
              <input id="schedule-search" ref="searchInput" v-model="searchQuery" type="search" maxlength="80"
                autocomplete="off" spellcheck="false" placeholder="Например: Танцы, кабинет 210, руководитель"
                @input="noteActivity" />
              <button type="button" class="kiosk-search-keyboard-toggle" :aria-expanded="keyboardOpen" @click="keyboardOpen=!keyboardOpen">
                {{keyboardOpen?'Скрыть клавиатуру':'⌨ Клавиатура'}}
              </button>
              <button v-if="searchQuery" type="button" class="kiosk-search-clear"
                @click="searchQuery='';noteActivity()">Очистить</button>
            </div>
            <KioskKeyboard v-if="keyboardOpen" v-model="searchQuery" @close="keyboardOpen=false"/>
            <p v-if="schedule.length" class="kiosk-search-count" role="status">
              {{searchQuery.trim()?'Найдено: '+filteredSchedule.length+' из '+schedule.length:'Направлений: '+schedule.length}}
            </p>
          </div>
          </Transition>
          <template v-if="filteredSchedule.length">
            <p class="schedule-hint">Выберите направление, чтобы посмотреть руководителя, дни занятий и кабинет.</p>
            <TransitionGroup name="kiosk-card" tag="div" class="schedule-buttons">
              <button v-for="entry in filteredSchedule" :key="entry.id" type="button" class="schedule-button"
                @click="openSchedule(entry.id)">
                <strong>{{entry.label}}</strong><span>{{entry.time||entry.group}}</span><span class="schedule-arrow">↗</span>
              </button>
            </TransitionGroup>
          </template>
          <div v-else-if="schedule.length" class="kiosk-search-empty" role="status">
            <strong>Ничего не найдено</strong><span>Попробуйте другое название, фамилию руководителя или кабинет.</span>
            <button type="button" class="schedule-back" @click="searchQuery='';keyboardOpen=false;noteActivity()">Показать все направления</button>
          </div>
          <div v-else class="poster-empty"><strong>Расписание появится автоматически</strong><p>Сотрудник создаст карточки через раздел «Расписание» в веб-редакторе. Опубликованные карточки появятся здесь автоматически.</p></div>
          </div>
        </Transition>
        <p v-if="scheduleStatus" class="poster-warning" role="status">{{scheduleStatus}}</p>
      </section>
      <section v-else-if="current==='groups'" class="schedule-section culture-directory-page" aria-live="polite">
        <div class="schedule-header"><span class="hero-overline">ГДК «КИРОВСКИЙ» · ТВОРЧЕСКАЯ ЖИЗНЬ</span>
          <h1 data-page-title tabindex="-1">Коллективы<span class="dot">.</span></h1></div>
        <CollectivesDirectory v-if="culture" ref="directoryRef" :content="culture"/>
      </section>
      <section v-else-if="current==='safety'" class="culture-section" aria-live="polite">
        <CultureLanding v-if="culture" :content="culture" mode="safety"/>
      </section>
      <section v-else-if="current==='tickets'" class="culture-section" aria-live="polite">
        <CultureLanding v-if="culture" :content="culture" mode="tickets"/>
      </section>
      <section v-else-if="current==='about'" class="culture-section" aria-live="polite">
        <CultureLanding v-if="culture" :content="culture" mode="about"/>
      </section>
      <section v-else-if="current==='contacts'" class="culture-section" aria-live="polite">
        <CultureLanding v-if="culture" :content="culture" mode="contacts"/>
      </section>
      <section v-else-if="current==='calendar'" class="schedule-section visitor-calendar-page" aria-live="polite">
        <div class="schedule-header"><span class="hero-overline">КУЛЬТУРНАЯ АФИША · ПО ДАТАМ</span>
          <h1 data-page-title tabindex="-1">Календарь событий<span class="dot">.</span></h1></div>
        <EventCalendar :events="events"/>
      </section>
      <section v-else-if="current==='documents'" class="schedule-section visitor-documents-page" aria-live="polite">
        <div class="schedule-header"><span class="hero-overline">ГДК «КИРОВСКИЙ» · ОФИЦИАЛЬНАЯ ИНФОРМАЦИЯ</span>
          <h1 data-page-title tabindex="-1">Документы<span class="dot">.</span></h1></div>
        <DocumentLibrary :documents="documents" :initial-id="initialDocumentId"/>
      </section>
      <section v-else class="hero" aria-live="polite">
        <div class="hero-overline"><i></i> ИНФОРМАЦИОННАЯ ПЛАТФОРМА</div>
        <h1 data-page-title tabindex="-1">{{ selected.label }}<span class="dot">.</span></h1>
        <p v-if="current === 'navigation'">Поиск помещений и интерактивная навигация по зданию.</p>
        <p v-else-if="current === 'about'">{{ welcome?.body ?? 'Информация об учреждении и его деятельности.' }}</p>
        <p v-else>Контакты и сведения для посетителей.</p>
        <div class="feature-grid">
          <div class="feature-primary"><span class="feature-index">01 / НАВИКУЛЬТУРА</span><b>ИНФОРМАЦИЯ<br/>БЕЗ ОЖИДАНИЯ</b><span>Автоматическое обновление материалов</span></div>
          <div class="feature-secondary"><span class="feature-index">00 / СТАДИЯ РАЗРАБОТКИ</span><b>СКОРО</b><span>Демонстрационные данные, без реальных афиш</span></div>
        </div>
      </section>
      <footer class="screen-footer"><span>НАВИГАЦИЯ · СОБЫТИЯ · ЛЮДИ</span><span>ДК «КИРОВСКИЙ»</span></footer>
      </div>
    </Transition>
    <nav class="side-menu" aria-label="Разделы информационной системы">
      <span class="menu-title">РАЗДЕЛЫ</span>
      <button v-for="(item,index) in items" :key="item.id" type="button" class="nav-item" :class="{active:current===item.id}" :aria-current="current===item.id?'page':undefined" @click="changeSection(item.id)">
        <span class="nav-index">{{ String(index+1).padStart(2,'0') }}</span><span class="nav-label">{{ item.label }}</span><span class="nav-glyph" aria-hidden="true">{{ item.icon }}</span>
      </button>
      <a class="kiosk-admin-shortcut" href="/editor" title="Открыть вход в административную панель" aria-label="Вход в административную панель">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>
        </svg><span>Вход в админку</span>
      </a>
      <div class="menu-bottom">NAVIKULTURA / 2026</div>
    </nav>
  </main>
</template>
