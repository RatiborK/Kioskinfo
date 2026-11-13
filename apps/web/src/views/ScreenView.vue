<!-- apps/web/src/views/ScreenView.vue — single-screen, touch-first public kiosk. -->
<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {useRoute} from 'vue-router';
import EventCalendar from '../components/EventCalendar.vue';
import DocumentLibrary from '../components/DocumentLibrary.vue';
import CollectivesDirectory from '../components/CollectivesDirectory.vue';
import CultureLanding from '../components/CultureLanding.vue';
import NavigationPanel from '../components/NavigationPanel.vue';
import KioskMenuIcon from '../components/KioskMenuIcon.vue';
import DkLogo from '../components/DkLogo.vue';
import GlobalSearch from '../components/GlobalSearch.vue';
import TicketWidget from '../components/TicketWidget.vue';
import MediaViewer from '../components/MediaViewer.vue';
import {DK_BACKGROUND,DK_GLOW,dkThemeVars,normalizeHex} from '../utils/dk-colors.js';
import type {KioskSearchResult} from '../utils/global-search.ts';
import type {CultureContent} from '../utils/culture-types.js';
import type {PublicEvent,PublicDocument} from '../utils/content-types.js';
import {visiblePosterWindow,shouldReturnHome,posterSwipe,sectionSwipe} from '../utils/kiosk-behavior.js';

const MUZA_ORGANIZATION='https://muzaticket.ru/iframe/organizations/organization-mau-gdk-kirovskii-448753';
const items=[
  {id:'posters',label:'Афиша'},
  {id:'groups',label:'Коллективы'},
  {id:'calendar',label:'Календарь событий'},
  {id:'documents',label:'Документы ДК'},
  {id:'safety',label:'Безопасность'},
  {id:'about',label:'О ДК'},
  {id:'contacts',label:'Контакты'},
  {id:'navigation',label:'Навигация'},
] as const;
type Section=(typeof items)[number]['id'];
const route=useRoute();
const initial=route.query.section;
const current=ref<Section>(items.some(x=>x.id===initial)?initial as Section:'posters');
const scrollRegion=ref<HTMLElement|null>(null);
const scrollCueVisible=ref(false);
let scrollCueTimer:ReturnType<typeof setInterval>|undefined;
// Support the main visitor scroller and legacy nested scroll areas.
function activeScrollHost():HTMLElement|null {
  const root=scrollRegion.value;
  if(!root)return null;
  if(root.scrollHeight>root.clientHeight+32)return root;
  const selectors='.schedule-section,.culture-section,.floor-navigation-viewport,.documents-visitor,.document-pdf-frame';
  for(const element of Array.from(root.querySelectorAll<HTMLElement>(selectors))){
    if(element.scrollHeight>element.clientHeight+32 &&
       /auto|scroll/.test(getComputedStyle(element).overflowY))return element;
  }
  return root;
}
function updateScrollCue(){
  if(current.value==='posters'||ticketOpen.value||globalSearchOpen.value||activeVideo.value){
    scrollCueVisible.value=false;return;
  }
  const host=activeScrollHost();
  scrollCueVisible.value=!!host && host.scrollHeight-host.clientHeight-host.scrollTop>48;
}
function scrollMore(){
  const host=activeScrollHost();
  if(!host)return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  host.scrollBy({top:Math.max(240,Math.floor(host.clientHeight*.75)),behavior:motion});
  activity();
}

const culture=ref<CultureContent|null>(null);
const cultureError=ref('');
const events=ref<PublicEvent[]>([]);
const documents=ref<PublicDocument[]>([]);
type Poster={name:string;title:string;kind:'image'|'video';url:string;updatedAt:string};
const posters=ref<Poster[]>([]);
const posterIndex=ref(0),posterError=ref('');
const activePoster=computed(()=>posters.value[posterIndex.value]??null);
const posterDots=computed(()=>visiblePosterWindow(posters.value,posterIndex.value,7));
const globalSearchOpen=ref(false),searchKeyboardRequested=ref(false),ticketOpen=ref(false),ticketUrl=ref(MUZA_ORGANIZATION);
const activeVideo=ref<{url:string;title:string}|null>(null);
const selectedGroupId=ref(''),groupMount=ref(0),selectedDocumentId=ref(
  typeof route.query.document==='string'?route.query.document:'');
const selectedEventDate=ref(''),pendingSafetyId=ref('');
const selectedFloorId=ref('floor-1'),selectedMapPoint=ref('');
type VisitorTheme='dk'|'holiday'|'modern'|'aurora'|'poster'|'gallery'|'neon'|'kids';
const visitorTheme=ref<VisitorTheme>('dk'),knownThemes=new Set(['dk','holiday','modern','aurora','poster','gallery','neon','kids']);
const fullscreenEnabled=ref(false),fullscreenActive=ref(false);
const nativeFullscreenShell=Boolean((window as Window & {navikulturaDesktop?:unknown}).navikulturaDesktop);
const dkBackground=ref(DK_BACKGROUND),dkGlow=ref(DK_GLOW);
const dkStyle=computed(()=>visitorTheme.value==='dk'?dkThemeVars(dkBackground.value,dkGlow.value):undefined);
let fullscreenGestureFailed=false;
function syncFullscreen(){fullscreenActive.value=!!document.fullscreenElement;}
function fullscreenOnGesture(){
  if(nativeFullscreenShell||!fullscreenEnabled.value||document.fullscreenElement||fullscreenGestureFailed)return;
  void document.documentElement.requestFullscreen().catch(()=>{fullscreenGestureFailed=true;});
}
async function fullscreenFromButton(){
  fullscreenGestureFailed=false;
  try{await document.documentElement.requestFullscreen();}catch{fullscreenGestureFailed=true;}
}
let refreshTimer:ReturnType<typeof setInterval>|undefined;
let slideTimer:ReturnType<typeof setInterval>|undefined;
let inactivityTimer:ReturnType<typeof setInterval>|undefined;
let lastActivity=Date.now(),lastManualPoster=0;
const IDLE_MS=180000;
let touchStart:{x:number;y:number;id:number}|null=null;
let sectionTouchStart:{x:number;y:number;id:number}|null=null;
const touchNoSectionSelector='button,a,input,textarea,select,label,iframe,video,audio,[contenteditable],.kiosk-home-stage,.floor-navigation-map,.floor-navigation-map-container,.document-pdf-frame,.kiosk-global-search,.kiosk-ticket-modal,.kiosk-video-panel,.culture-directory-search,.floor-navigation-map-viewport';
function sectionTouchDown(event:PointerEvent){
  if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
  if(current.value==='posters'||globalSearchOpen.value||ticketOpen.value||activeVideo.value||
    (event.target as HTMLElement).closest(touchNoSectionSelector))return;
  sectionTouchStart={x:event.clientX,y:event.clientY,id:event.pointerId};activity();
}
function sectionTouchUp(event:PointerEvent){
  const start=sectionTouchStart;sectionTouchStart=null;
  if(!start||start.id!==event.pointerId||current.value==='posters'||globalSearchOpen.value||ticketOpen.value||activeVideo.value)return;
  if((event.target as HTMLElement).closest(touchNoSectionSelector))return;
  const direction=sectionSwipe(event.clientX-start.x,event.clientY-start.y);
  if(!direction)return;
  const at=items.findIndex(item=>item.id===current.value);
  const next=items[at+direction];
  if(next)go(next.id);
}
function sectionTouchCancel(){sectionTouchStart=null;}
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
  void nextTick(updateScrollCue);
}
function openSearch(){activity();searchKeyboardRequested.value=false;globalSearchOpen.value=true;}
function openKeyboard(){activity();searchKeyboardRequested.value=true;globalSearchOpen.value=true;}
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
  }else if(result.section==='navigation'){
    current.value='navigation';selectedFloorId.value=result.floorId??'floor-1';selectedMapPoint.value=result.pointId??'';
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
  try{
    const r=await fetch('/api/public/culture',{cache:'no-store'});
    if(!r.ok)throw Error('Сервер вернул '+r.status);
    const data:{content:CultureContent}=await r.json();
    if(!data.content||!Array.isArray(data.content.collectives)||!Array.isArray(data.content.leaders))
      throw Error('Некорректный формат каталога');
    culture.value=data.content;
    cultureError.value='';
  }catch(error){
    // Never erase the last loaded catalog; show why its latest revision is unavailable.
    const detail=error instanceof Error?error.message:String(error);
    cultureError.value='Каталог ДК временно недоступен ('+detail+'). Ранее опубликованные материалы не удалены.';
  }
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
    const data:{theme:string;fullscreenEnabled?:boolean;dkBackground?:string;dkGlow?:string}=await r.json();
    dkBackground.value=normalizeHex(data.dkBackground,DK_BACKGROUND);
    dkGlow.value=normalizeHex(data.dkGlow,DK_GLOW);
    if(knownThemes.has(data.theme))visitorTheme.value=data.theme as VisitorTheme;
    const previouslyEnabled=fullscreenEnabled.value;
    fullscreenEnabled.value=data.fullscreenEnabled===true;
    // Managed Edge can allow an automatic Fullscreen API request for this origin.
    // Ordinary browsers will reject it; the explicit button/first user gesture remains.
    if(!nativeFullscreenShell&&fullscreenEnabled.value&&!previouslyEnabled&&!document.fullscreenElement)
      void document.documentElement.requestFullscreen().catch(()=>{});
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
  scrollCueTimer=setInterval(updateScrollCue,1200);
  window.addEventListener('resize',updateScrollCue);
  void nextTick(updateScrollCue);
  window.addEventListener('pointerdown',activity,{passive:true});
  window.addEventListener('pointerdown',fullscreenOnGesture,{capture:true,passive:true});
  document.addEventListener('fullscreenchange',syncFullscreen);
  syncFullscreen();
  window.addEventListener('keydown',activity);
  window.addEventListener('keydown',browserKey,true);
});
onBeforeUnmount(()=>{
  if(refreshTimer)clearInterval(refreshTimer);
  if(slideTimer)clearInterval(slideTimer);
  if(inactivityTimer)clearInterval(inactivityTimer);
  if(scrollCueTimer)clearInterval(scrollCueTimer);
  window.removeEventListener('resize',updateScrollCue);
  window.removeEventListener('pointerdown',activity);
  window.removeEventListener('pointerdown',fullscreenOnGesture,true);
  document.removeEventListener('fullscreenchange',syncFullscreen);
  window.removeEventListener('keydown',activity);
  window.removeEventListener('keydown',browserKey,true);
});
</script>
<template>
  <main class="shell screen-shell" :class="{'kiosk-home':current==='posters'}" :data-visitor-theme="visitorTheme" :style="dkStyle">
    <Transition name="kiosk-page" mode="out-in" @after-enter="onEnter">
      <div :key="current" ref="scrollRegion" class="screen-content" :class="{'screen-poster-page':current==='posters'}"
        @pointerdown="sectionTouchDown" @pointerup="sectionTouchUp" @pointercancel="sectionTouchCancel"
        @scroll.capture="updateScrollCue">
        <header class="brand-row">
          <DkLogo class="kiosk-dk-logo"/>
          <button v-if="fullscreenEnabled&&!fullscreenActive&&!nativeFullscreenShell" type="button"
            class="kiosk-fullscreen-trigger" @click="fullscreenFromButton"
            aria-label="Открыть экран посетителя на весь экран">На весь экран</button>
          <button type="button" class="kiosk-search-trigger" aria-label="Поиск по всей НавиКультуре"
            title="Поиск" @click="openSearch">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="27" height="27" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>
            </svg>
          </button>
          <button type="button" class="kiosk-keyboard-trigger" aria-label="Открыть экранную клавиатуру" title="Экранная клавиатура" @click="openKeyboard">
            <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10" stroke-linecap="round"/>
            </svg>
          </button>
        </header>
        <div v-if="cultureError" class="kiosk-culture-warning" role="status">
          <span>{{cultureError}}</span>
          <button type="button" @click="reloadCulture">Повторить загрузку</button>
        </div>
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
        <section v-else class="culture-section kiosk-navigation-page" aria-label="Интерактивная поэтажная схема ДК">
          <NavigationPanel v-if="culture" :navigation="culture.navigation"
            :initial-floor="selectedFloorId" :initial-point="selectedMapPoint"/>
        </section>
        <footer v-if="current!=='posters'" class="screen-footer">
          <span>НАВИГАЦИЯ · СОБЫТИЯ · ЛЮДИ</span><span>ГДК «КИРОВСКИЙ»</span>
        </footer>
      </div>
    </Transition>
    <button v-if="scrollCueVisible" type="button" class="kiosk-scroll-cue"
      aria-label="Ниже есть информация. Прокрутить страницу вниз" title="Листайте вниз"
      @click="scrollMore">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
        stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true"><path d="m5 9 7 7 7-7"/></svg>
    </button>
    <nav class="side-menu" aria-label="Разделы информационной системы">
      <span class="menu-title">НАВИГАЦИЯ / РАЗДЕЛЫ</span>
      <button v-for="(item,index) in items" :key="item.id" type="button" class="nav-item"
        :class="{active:current===item.id}" :aria-current="current===item.id?'page':undefined" @click="go(item.id)">
        <span class="nav-index">{{String(index+1).padStart(2,'0')}}</span>
        <span class="nav-label">{{item.label}}</span>
        <span class="nav-glyph"><KioskMenuIcon :name="item.id"/></span>
      </button>
      <router-link to="/editor" class="kiosk-admin-shortcut" aria-label="Войти в кабинет администратора">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>
        </svg><span>Вход в админку</span>
      </router-link>
      <div class="menu-bottom">ГДК «КИРОВСКИЙ» / НАВИКУЛЬТУРА</div>
    </nav>
    <GlobalSearch v-if="globalSearchOpen" :data="{culture,events,documents,posters}"
      :initial-keyboard="searchKeyboardRequested"
      @close="closeSearch" @open-result="openResult"/>
    <TicketWidget v-if="ticketOpen" :url="ticketUrl" @close="closeTickets"/>
    <MediaViewer v-if="activeVideo" :url="activeVideo.url" :title="activeVideo.title" @close="closeVideo"/>
  </main>
</template>