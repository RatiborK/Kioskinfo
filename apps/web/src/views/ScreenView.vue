<!-- apps/web/src/views/ScreenView.vue — first visual prototype; no real posters yet. -->
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';

const items = [
  { id: 'posters', label: 'Афиша', icon: '✦' },
  { id: 'schedule', label: 'Расписание', icon: '◷' },
  { id: 'groups', label: 'Коллективы', icon: '◎' },
  { id: 'navigation', label: 'Навигация', icon: '⌖' },
  { id: 'about', label: 'О ДК', icon: '▣' },
  { id: 'contacts', label: 'Контакты', icon: '↗' },
] as const;
const current = ref<(typeof items)[number]['id']>('posters');
const welcome = ref<{ title:string; body:string } | null>(null);
type Poster = {name:string; title:string; kind:'image'|'video'; url:string; updatedAt:string};
const posters = ref<Poster[]>([]);
const posterIndex = ref(0);
const posterError = ref('');
type ScheduleEntry = { id:string;label:string;group:string;leader:string;time:string;room:string;description:string;age:string;theme:'orange'|'blue'|'neutral' };
type SchedulePayload = {entries:ScheduleEntry[];version:string;stale:boolean;message:string};
const schedule = ref<ScheduleEntry[]>([]);
const selectedScheduleId = ref<string|null>(null);
const scheduleStatus = ref('');
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
function nextPoster(){if(posters.value.length)posterIndex.value=(posterIndex.value+1)%posters.value.length;}
function previousPoster(){if(posters.value.length)posterIndex.value=(posterIndex.value+posters.value.length-1)%posters.value.length;}
const activePoster=computed(()=>posters.value[posterIndex.value]);
onMounted(async () => {
  await Promise.all([reloadPosters(),reloadSchedule()]);
  reloadHandle=setInterval(()=>{void reloadPosters();void reloadSchedule();},10000);
  slideshowHandle=setInterval(()=>{if(activePoster.value?.kind!=='video')nextPoster();},8000);
  try { const response = await fetch('/api/public/pages/welcome', {cache:'no-store'});
    if (response.ok) {const data:{page:{title:string;body:string}} = await response.json(); welcome.value=data.page;}
  } catch { /* available only when API and DB are running */ }
});
const selected = computed(() => items.find((item) => item.id === current.value) ?? items[0]);
onBeforeUnmount(()=>{if(reloadHandle)clearInterval(reloadHandle);if(slideshowHandle)clearInterval(slideshowHandle);});
</script>

<template>
  <main class="shell screen-shell">
    <div class="screen-content">
      <header class="brand-row">
        <div class="brand-glyph" aria-hidden="true">Н</div>
        <div class="brand-copy"><strong>НАВИКУЛЬТУРА</strong><span>ЦИФРОВОЙ ИНФОЦЕНТР · ГДК «КИРОВСКИЙ»</span></div>
        <span class="stage-note">АФИША · ПОДКЛЮЧЕНА</span>
      </header>
      <section v-if="current==='posters'" class="poster-gallery" aria-label="Актуальные афиши">
        <div class="poster-heading"><span class="hero-overline">ПРОГРАММА МЕРОПРИЯТИЙ</span><h1>Афиша<span class="dot">.</span></h1></div>
        <div v-if="activePoster" class="poster-stage">
          <img v-if="activePoster.kind==='image'" class="poster-media" :src="activePoster.url" :alt="activePoster.title" />
          <video v-else :key="activePoster.name" class="poster-media" :src="activePoster.url" autoplay muted playsinline controls @ended="nextPoster"></video>
          <div class="poster-caption"><strong>{{activePoster.title}}</strong><span>{{posterIndex+1}} / {{posters.length}}</span></div>
          <div v-if="posters.length>1" class="poster-controls"><button type="button" aria-label="Предыдущая афиша" @click="previousPoster">‹</button><button type="button" aria-label="Следующая афиша" @click="nextPoster">›</button></div>
        </div>
        <div v-else class="poster-empty"><strong>Афиши появятся здесь автоматически</strong><p>Сотрудники могут добавить JPG, PNG или WebP через редактор или папку на сервере.</p></div>
        <p v-if="posterError" class="poster-warning" role="status">{{posterError}}</p>
      </section>
      <section v-else-if="current==='schedule'||current==='groups'" class="schedule-section" aria-live="polite">
        <div class="schedule-header"><span class="hero-overline">ГДК «КИРОВСКИЙ» · ИНФОРМАЦИЯ</span><h1>{{current==='groups'?'Коллективы':'Расписание'}}<span class="dot">.</span></h1></div>
        <template v-if="selectedSchedule">
          <button type="button" class="schedule-back" @click="selectedScheduleId=null">← Все направления</button>
          <article class="schedule-detail" :class="'theme-'+selectedSchedule.theme">
            <span class="eyebrow">КАРТОЧКА КОЛЛЕКТИВА</span>
            <h2>{{selectedSchedule.group}}</h2>
            <div class="schedule-detail-rows">
              <p v-if="selectedSchedule.leader"><b>Руководитель</b><span>{{selectedSchedule.leader}}</span></p>
              <p v-if="selectedSchedule.time"><b>Занятия</b><span>{{selectedSchedule.time}}</span></p>
              <p v-if="selectedSchedule.room"><b>Кабинет</b><span>{{selectedSchedule.room}}</span></p>
              <p v-if="selectedSchedule.age"><b>Возраст</b><span>{{selectedSchedule.age}}</span></p>
              <p v-if="selectedSchedule.description"><b>Описание</b><span>{{selectedSchedule.description}}</span></p>
            </div>
          </article>
        </template>
        <template v-else-if="schedule.length">
          <p class="schedule-hint">Выберите направление, чтобы посмотреть руководителя, дни занятий и кабинет.</p>
          <div class="schedule-buttons">
            <button v-for="entry in schedule" :key="entry.id" type="button" class="schedule-button" :class="'theme-'+entry.theme" @click="selectedScheduleId=entry.id">
              <strong>{{entry.label}}</strong><span>{{entry.time||entry.group}}</span><span class="schedule-arrow">↗</span>
            </button>
          </div>
        </template>
        <div v-else class="poster-empty"><strong>Расписание появится автоматически</strong><p>Сотрудник создаст карточки через раздел «Расписание» в веб-редакторе. Опубликованные карточки появятся здесь автоматически.</p></div>
        <p v-if="scheduleStatus" class="poster-warning" role="status">{{scheduleStatus}}</p>
      </section>
      <section v-else class="hero" aria-live="polite">
        <div class="hero-overline"><i></i> ИНФОРМАЦИОННАЯ ПЛАТФОРМА</div>
        <h1>{{ selected.label }}<span class="dot">.</span></h1>
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
    <nav class="side-menu" aria-label="Разделы информационной системы">
      <span class="menu-title">РАЗДЕЛЫ</span>
      <button v-for="(item,index) in items" :key="item.id" type="button" class="nav-item" :class="{active:current===item.id}" @click="current=item.id">
        <span class="nav-index">{{ String(index+1).padStart(2,'0') }}</span><span class="nav-label">{{ item.label }}</span><span class="nav-glyph" aria-hidden="true">{{ item.icon }}</span>
      </button>
      <div class="menu-bottom">NAVIKULTURA / 2026</div>
    </nav>
  </main>
</template>
