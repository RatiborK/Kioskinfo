<!-- apps/web/src/views/ScreenView.vue — single-screen, touch-first public kiosk. -->
<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {useRoute} from 'vue-router';
import EventCalendar from '../components/EventCalendar.vue';
import DocumentLibrary from '../components/DocumentLibrary.vue';
import CollectivesDirectory from '../components/CollectivesDirectory.vue';
import CultureLanding from '../components/CultureLanding.vue';
import GlobalSearch from '../components/GlobalSearch.vue';
import TicketWidget from '../components/TicketWidget.vue';
import MediaViewer from '../components/MediaViewer.vue';
import type {KioskSearchResult} from '../utils/global-search.ts';
import type {CultureContent} from '../utils/culture-types.js';
import type {PublicEvent,PublicDocument} from '../utils/content-types.js';
import {visiblePosterWindow,shouldReturnHome,posterSwipe} from '../utils/kiosk-behavior.js';

const MUZA_ORGANIZATION='https://muzaticket.ru/iframe/organizations/organization-mau-gdk-kirovskii-448753';
const items=[
  {id:'posters',label:'Афиша',icon:'✦'},
  {id:'groups',label:'Коллективы',icon:'◎'},
  {id:'calendar',label:'Календарь событий',icon:'▦'},
  {id:'documents',label:'Документы ДК',icon:'▤'},
  {id:'safety',label:'Безопасность',icon:'◇'},
  {id:'about',label:'О ДК',icon:'▣'},
  {id:'contacts',label:'Контакты',icon:'↗'},
  {id:'navigation',label:'Навигация',icon:'⌖'},
] as const;
type Section=(typeof items)[number]['id'];
const route=useRoute();
const initial=route.query.section;
const current=ref<Section>(items.some(x=>x.id===initial)?initial as Section:'posters');
const scrollRegion=ref<HTMLElement|null>(null);
const culture=ref<CultureContent|null>(null);
const events=ref<PublicEvent[]>([]);
const documents=ref<PublicDocument[]>([]);
type Poster={name:string;title:string;kind:'image'|'video';url:string;updatedAt:string};
const posters=ref<Poster[]>([]);
const posterIndex=ref(0),posterError=ref('');
const activePoster=computed(()=>posters.value[posterIndex.value]??null);
const posterDots=computed(()=>visiblePosterWindow(posters.value,posterIndex.value,7));
const globalSearchOpen=ref(false),ticketOpen=ref(false),ticketUrl=ref(MUZA_ORGANIZATION);
const activeVideo=ref<{url:string;title:string}|null>(null);
const selectedGroupId=ref(''),groupMount=ref(0),selectedDocumentId=ref(
  typeof route.query.document==='string'?route.query.document:'');
const selectedEventDate=ref(''),pendingSafetyId=ref('');
type VisitorTheme='dk'|'holiday'|'modern'|'aurora'|'poster'|'gallery'|'neon'|'kids';
const visitorTheme=ref<VisitorTheme>('dk'),knownThemes=new Set(['dk','holiday','modern','aurora','poster','gallery','neon','kids']);
let refreshTimer:ReturnType<typeof setInterval>|undefined;
let slideTimer:ReturnType<typeof setInterval>|undefined;
let inactivityTimer:ReturnType<typeof setInterval>|undefined;
let lastActivity=Date.now(),lastManualPoster=0;
const IDLE_MS=180000;
let touchStart:{x:number;y:number;id:number}|null=null;
function activity(){lastActivity=Date.now();}
function go(section:Section){
  activity();globalSearchOpen.value=false;
  if(section!==current.value){
    current.value=section;
    selectedGroupId.value='';selectedDocumentId.value='';selectedEventDate.value='';pendingSafetyId.value='';
  }else if(section==='groups')groupMount.value++;
  if(section==='posters')posterIndex.value=Math.max(0,Math.min(posterIndex.value,posters.value.length-1));
  if(scrollRegion.value)scrollRegion.value.scrollTop=0;
}
function onEnter(){
  scrollRegion.value?.scrollTo({top:0,behavior:'instant'});
  if(pendingSafetyId.value){
    const id=pendingSafetyId.value;pendingSafetyId.value='';
    const section=document.getElementById('safety-'+id);
    section?.scrollIntoView({behavior:'smooth',block:'start'});
  }else{
    document.querySelector<HTMLElement>('.screen-content [data-page-title]')?.focus({preventScroll:true});
  }
}
function openSearch(){activity();globalSearchOpen.value=true;}
function closeSearch(){activity();globalSearchOpen.value=false;}
function openTickets(url=MUZA_ORGANIZATION){activity();ticketUrl.value=url;ticketOpen.value=true;globalSearchOpen.value=false;}
function closeTickets(){activity();ticketOpen.value=false;}
function openVideo(url:string,title:string){activity();activeVideo.value={url,title};}
function closeVideo(){activity();activeVideo.value=null;}
function openResult(result:KioskSearchResult){
  activity();globalSearchOpen.value=false;
  if(result.section==='tickets'){openTickets();return;}
  if(result.section==='groups'){
    const from=current.value;current.value='groups';selectedGroupId.value=result.id;
    if(from==='groups')groupMount.value++;
  }else if(result.section==='documents'){
    current.value='documents';selectedDocumentId.value=result.id;
  }else if(result.section==='calendar'){
    current.value='calendar';selectedEventDate.value=result.date??'';
  }else if(result.section==='safety'){
    const already=current.value==='safety';current.value='safety';pendingSafetyId.value=result.id;
    if(already)void nextTick(()=>onEnter());
  }else if(result.section==='posters'){
    current.value='posters';
    const index=posters.value.findIndex(x=>x.name===result.posterName);
    if(index>=0)posterIndex.value=index;
  }else if(result.section==='about'||result.section==='contacts'){
    current.value=result.section;
  }
}
function movePoster(direction:1|-1,manual=true){
  if(!posters.value.length)return;
  if(manual){lastManualPoster=Date.now();activity();}
  posterIndex.value=(posterIndex.value+posters.value.length+direction)%posters.value.length;
}
function selectPoster(index:number){activity();lastManualPoster=Date.now();posterIndex.value=index;}
function posterTouchStart(event:PointerEvent){
  if((event.target as HTMLElement).closest('button'))return;
  if(event.pointerType!=='touch'&&event.pointerType!=='pen'&&event.pointerType!=='mouse')return;
  touchStart={x:event.clientX,y:event.clientY,id:event.pointerId};activity();
}
function posterTouchEnd(event:PointerEvent){
  const start=touchStart;touchStart=null;
  if(!start||start.id!==event.pointerId||(event.target as HTMLElement).closest('button'))return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  const direction=posterSwipe(dx,dy);
  if(direction)movePoster(direction);
}
function posterTouchCancel(){touchStart=null;}
function resetIdle(){
  if(ticketOpen.value||activeVideo.value)return; // avoid interrupting ticket/payment or embedded playback.
  if(!shouldReturnHome(lastActivity,Date.now(),IDLE_MS))return;
  globalSearchOpen.value=false;current.value='posters';posterIndex.value=0;
  selectedGroupId.value='';selectedDocumentId.value='';selectedEventDate.value='';
  pendingSafetyId.value='';scrollRegion.value?.scrollTo({top:0,behavior:'instant'});
  lastActivity=Date.now();
}
async function reloadCulture(){
  try{const r=await fetch('/api/public/culture',{cache:'no-store'});if(!r.ok)return;
    const data:{content:CultureContent}=await r.json();culture.value=data.content;
  }catch{/* Keep previous published version. */}
}
async function reloadEvents(){
  try{const r=await fetch('/api/public/events',{cache:'no-store'});if(!r.ok)return;
    const data:{events:PublicEvent[]}=await r.json();events.value=data.events;
  }catch{/* Keep previous published version. */}
}
async function reloadDocuments(){
  try{const r=await fetch('/api/public/documents',{cache:'no-store'});if(!r.ok)return;
    const data:{documents:PublicDocument[]}=await r.json();documents.value=data.documents;
  }catch{/* Keep previous published version. */}
}
async function reloadPosters(){
  try{const r=await fetch('/api/public/posters',{cache:'no-store'});if(!r.ok)throw Error('Сервер афиш недоступен');
    const data:{posters:Poster[]}=await r.json();const last=posters.value[posterIndex.value]?.name;
    posters.value=data.posters;const index=data.posters.findIndex(item=>item.name===last);
    posterIndex.value=index>=0?index:0;posterError.value='';
  }catch{posterError.value='Сохранена предыдущая подборка афиш. Нет подключения к источнику.';}
}
async function reloadTheme(){
  try{const r=await fetch('/api/public/theme',{cache:'no-store'});if(!r.ok)return;
    const data:{theme:string}=await r.json();if(knownThemes.has(data.theme))visitorTheme.value=data.theme as VisitorTheme;
  }catch{/* Keep last known color theme. */}
}
function browserKey(event:KeyboardEvent){
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){
    event.preventDefault();openSearch();
  }
  if(event.key==='Escape'&&!ticketOpen.value&&!activeVideo.value&&globalSearchOpen.value)closeSearch();
}
onMounted(async()=>{
  await Promise.all([reloadCulture(),reloadEvents(),reloadDocuments(),reloadPosters(),reloadTheme()]);
  refreshTimer=setInterval(()=>{void reloadCulture();void reloadEvents();void reloadDocuments();void reloadPosters();void reloadTheme();},10000);
  slideTimer=setInterval(()=>{if(current.value==='posters'&&!ticketOpen.value&&activePoster.value?.kind!=='video'&&
    Date.now()-lastManualPoster>12000)movePoster(1,false);},8000);
  inactivityTimer=setInterval(resetIdle,12000);
  window.addEventListener('pointerdown',activity,{passive:true});
  window.addEventListener('keydown',activity);
  window.addEventListener('keydown',browserKey,true);
});
onBeforeUnmount(()=>{
  if(refreshTimer)clearInterval(refreshTimer);
  if(slideTimer)clearInterval(slideTimer);
  if(inactivityTimer)clearInterval(inactivityTimer);
  window.removeEventListener('pointerdown',activity);
  window.removeEventListener('keydown',activity);
  window.removeEventListener('keydown',browserKey,true);
});
</script>
<template>
  <main class="shell screen-shell" :class="{'kiosk-home':current==='posters'}" :data-visitor-theme="visitorTheme">
    <Transition name="kiosk-page" mode="out-in" @after-enter="onEnter">
      <div :key="current" ref="scrollRegion" class="screen-content" :class="{'screen-poster-page':current==='posters'}">
        <header class="brand-row">
          <div class="brand-glyph" aria-hidden="true">Н</div>
          <div class="brand-copy"><strong>НАВИКУЛЬТУРА</strong><span>ЦИФРОВОЙ ИНФОЦЕНТР · ГДК «КИРОВСКИЙ»</span></div>
          <button type="button" class="kiosk-search-trigger" aria-label="Поиск по всей НавиКультуре"
            title="Поиск" @click="openSearch">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="27" height="27" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>
            </svg>
          </button>
          <span class="stage-note">ДК «КИРОВСКИЙ» · КРАСНОЯРСК</span>
        </header>
        <section v-if="current==='posters'" class="poster-gallery kiosk-home-gallery" aria-label="Актуальные афиши">
          <div class="poster-heading kiosk-home-heading"><span class="hero-overline">СКОРО НА СЦЕНЕ</span>
            <h1 data-page-title tabindex="-1">Афиша<span class="dot">.</span></h1></div>
          <div v-if="activePoster" class="poster-stage kiosk-home-stage"
            aria-label="Пролистывайте афиши пальцем влево и вправо"
            @pointerdown="posterTouchStart" @pointerup="posterTouchEnd" @pointercancel="posterTouchCancel">
            <Transition name="kiosk-poster">
              <img v-if="activePoster.kind==='image'" :key="'image:'+activePoster.name"
                class="poster-media" :src="activePoster.url" :alt="'Афиша: '+activePoster.title" draggable="false" />
              <video v-else :key="'video:'+activePoster.name"
                class="poster-media" :src="activePoster.url" autoplay muted playsinline
                controls @ended="movePoster(1,false)"></video>
            </Transition>
            <div v-if="posters.length>1" class="poster-controls kiosk-side-arrows">
              <button type="button" aria-label="Предыдущая афиша" @click.stop="movePoster(-1)">‹</button>
              <button type="button" aria-label="Следующая афиша" @click.stop="movePoster(1)">›</button>
            </div>
          </div>
          <div v-else class="poster-empty kiosk-home-empty">
            <strong>Афиши мероприятий</strong><p>Здесь будут показываться опубликованные изображения и видеоролики.</p>
          </div>
          <div class="kiosk-home-bottom">
            <div class="kiosk-home-paging">
              <span v-if="posters.length" class="poster-count">{{posterIndex+1}} / {{posters.length}}</span>
              <div v-if="posters.length>1" class="kiosk-home-dots" aria-label="Выбор афиши">
                <button v-for="item in posterDots" :key="item.poster.name" type="button"
                  :class="{active:posterIndex===item.index}" :aria-current="posterIndex===item.index?'true':undefined"
                  :aria-label="'Афиша '+(item.index+1)" @click="selectPoster(item.index)"></button>
              </div>
            </div>
            <button type="button" class="kiosk-buy-tickets" @click="openTickets()">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6z"/>
                <path d="M12 4v16" stroke-dasharray="2 3"/>
              </svg>
              Купить билет
            </button>
          </div>
          <p v-if="posterError" class="kiosk-poster-status" role="status">{{posterError}}</p>
        </section>
        <section v-else-if="current==='groups'" class="schedule-section culture-directory-page" aria-label="Каталог коллективов">
          <div class="schedule-header"><span class="hero-overline">ГДК «КИРОВСКИЙ» · ТВОРЧЕСКАЯ ЖИЗНЬ</span>
            <h1 data-page-title tabindex="-1">Коллективы<span class="dot">.</span></h1></div>
          <CollectivesDirectory v-if="culture" :key="groupMount" :content="culture" :initial-id="selectedGroupId"
            @open-video="openVideo"/>
        </section>
        <section v-else-if="current==='calendar'" class="schedule-section visitor-calendar-page">
          <div class="schedule-header"><span class="hero-overline">КУЛЬТУРНАЯ АФИША · ПО ДАТАМ</span>
            <h1 data-page-title tabindex="-1">Календарь событий<span class="dot">.</span></h1></div>
          <EventCalendar :events="events" :initial-date="selectedEventDate" @buy-ticket="openTickets"/>
        </section>
        <section v-else-if="current==='documents'" class="schedule-section visitor-documents-page">
          <div class="schedule-header"><span class="hero-overline">ДК «КИРОВСКИЙ» · ОФИЦИАЛЬНАЯ ИНФОРМАЦИЯ</span>
            <h1 data-page-title tabindex="-1">Документы<span class="dot">.</span></h1></div>
          <DocumentLibrary :documents="documents" :initial-id="selectedDocumentId"/>
        </section>
        <section v-else-if="current==='safety'" class="culture-section" aria-label="Профилактика и безопасность">
          <CultureLanding v-if="culture" :content="culture" mode="safety"/>
        </section>
        <section v-else-if="current==='about'" class="culture-section">
          <CultureLanding v-if="culture" :content="culture" mode="about" @open-video="openVideo"/>
        </section>
        <section v-else-if="current==='contacts'" class="culture-section">
          <CultureLanding v-if="culture" :content="culture" mode="contacts"/>
        </section>
        <section v-else class="hero">
          <div class="hero-overline">ИНФОРМАЦИОННАЯ ПЛАТФОРМА</div>
          <h1 data-page-title tabindex="-1">Навигация<span class="dot">.</span></h1>
          <p>Интерактивная схема помещений Дворца культуры находится в разработке.</p>
          <div class="feature-grid"><div class="feature-primary"><b>ПЛАН ДВОРЦА</b><span>Информация о помещениях</span></div>
            <div class="feature-secondary"><b>СКОРО</b><span>Доступная навигация</span></div></div>
        </section>
        <footer v-if="current!=='posters'" class="screen-footer">
          <span>НАВИГАЦИЯ · СОБЫТИЯ · ЛЮДИ</span><span>ГДК «КИРОВСКИЙ»</span>
        </footer>
      </div>
    </Transition>
    <nav class="side-menu" aria-label="Разделы информационной системы">
      <span class="menu-title">НАВИГАЦИЯ / РАЗДЕЛЫ</span>
      <button v-for="(item,index) in items" :key="item.id" type="button" class="nav-item"
        :class="{active:current===item.id}" :aria-current="current===item.id?'page':undefined" @click="go(item.id)">
        <span class="nav-index">{{String(index+1).padStart(2,'0')}}</span>
        <span class="nav-label">{{item.label}}</span><span class="nav-glyph">{{item.icon}}</span>
      </button>
      <a href="/editor" class="kiosk-admin-shortcut" aria-label="Войти в кабинет администратора">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>
        </svg><span>Вход в админку</span>
      </a>
      <div class="menu-bottom">НАВИКУЛЬТУРА / 2026</div>
    </nav>
    <GlobalSearch v-if="globalSearchOpen" :data="{culture,events,documents,posters}"
      @close="closeSearch" @open-result="openResult"/>
    <TicketWidget v-if="ticketOpen" :url="ticketUrl" @close="closeTickets"/>
    <MediaViewer v-if="activeVideo" :url="activeVideo.url" :title="activeVideo.title" @close="closeVideo"/>
  </main>
</template>