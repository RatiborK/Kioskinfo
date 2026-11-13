<!-- apps/web/src/components/VisitorThemeEditor.vue — site-wide kiosk appearance, not per-card controls. -->
<script setup lang="ts">
import { computed,onMounted,ref } from 'vue';
import DkLogo from './DkLogo.vue';
import KioskMenuIcon from './KioskMenuIcon.vue';
import {DK_BACKGROUND,DK_GLOW,dkThemeVars,normalizeHex} from '../utils/dk-colors.js';
type ThemeId='dk'|'holiday'|'modern'|'aurora'|'poster'|'gallery'|'neon'|'kids';
type ThemeSettings={draft:ThemeId;published:ThemeId;revision:number;published_revision:number;updatedAt:string;fullscreenEnabled:boolean;dkBackground:string;dkGlow:string};
type ThemeInfo={id:ThemeId;name:string;description:string};
const themes:ThemeInfo[]=[
  {id:'dk',name:'Стиль сайта ДК',description:'Тёмный сине-серый фон, мягкое бирюзовое свечение, оранжевые и синие акценты'},
  {id:'holiday',name:'Праздничная',description:'Тёплый свет, глубокий бордовый и золото'},
  {id:'modern',name:'Стильная',description:'Чистый минимализм, графика и типографика'},
  {id:'aurora',name:'Северное сияние',description:'Бирюзовые и синие световые переливы'},
  {id:'poster',name:'Афишная',description:'Светлая бумага и выразительные заголовки'},
  {id:'gallery',name:'Галерея',description:'Кремовые оттенки и спокойный зелёный'},
  {id:'neon',name:'Неон-сцена',description:'Энергия концерта, яркая сцена'},
  {id:'kids',name:'Детская мастерская',description:'Тёплые цвета и мягкие формы'},
];
type Role='admin'|'editor'|'viewer';
const props=defineProps<{role:Role}>();
const settings=ref<ThemeSettings|null>(null);
const choice=ref<ThemeId>('dk');
const busy=ref(false),error=ref(''),status=ref('Загрузка тем…');
const dkBackground=ref(DK_BACKGROUND),dkGlow=ref(DK_GLOW);
const dkPreviewStyle=computed(()=>dkThemeVars(dkBackground.value,dkGlow.value));
const dkColorDirty=computed(()=>!!settings.value&&(
  dkBackground.value!==settings.value.dkBackground||dkGlow.value!==settings.value.dkGlow));
const dirty=computed(()=>!!settings.value&&choice.value!==settings.value.draft);
const publishedName=computed(()=>themes.find(t=>t.id===settings.value?.published)?.name??'Стиль сайта ДК');
const selectedName=computed(()=>themes.find(t=>t.id===choice.value)?.name??'Стиль сайта ДК');
const headers={'Content-Type':'application/json','X-Navikultura-Action':'1'};
async function request<T>(url:string,init:RequestInit={}):Promise<T>{
  const res=await fetch(url,{...init,credentials:'same-origin',cache:'no-store'});
  const data:unknown=await res.json();
  if(!res.ok)throw Error((data as {error?:string}).error??'Ошибка HTTP '+res.status);
  return data as T;
}
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
async function load(){
  busy.value=true;error.value='';
  try{
    const data=await request<{settings:ThemeSettings}>('/api/editor/theme');
    settings.value=data.settings;choice.value=data.settings.draft;
    dkBackground.value=normalizeHex(data.settings.dkBackground,DK_BACKGROUND);
    dkGlow.value=normalizeHex(data.settings.dkGlow,DK_GLOW);
    status.value='Текущая тема посетителей: '+publishedName.value;
  }catch(e){error.value=message(e);status.value='Не удалось прочитать темы';}
  finally{busy.value=false;}
}
async function save(){
  if(!settings.value||props.role==='viewer'||busy.value||!dirty.value)return;
  busy.value=true;error.value='';
  try{
    const data=await request<{settings:ThemeSettings}>('/api/editor/theme',{
      method:'PATCH',headers,
      body:JSON.stringify({id:choice.value,expectedRevision:settings.value.revision}),
    });
    settings.value=data.settings;status.value='Выбор сохранён. На терминале остаётся опубликованная тема.';
  }catch(e){error.value=message(e);}finally{busy.value=false;}
}
async function publish(){
  if(!settings.value||props.role!=='admin'||busy.value)return;
  if(dirty.value){error.value='Сначала сохраните выбор темы';return;}
  busy.value=true;error.value='';
  try{
    const data=await request<{settings:ThemeSettings}>('/api/editor/theme/publish',{
      method:'POST',headers,body:JSON.stringify({expectedRevision:settings.value.revision}),
    });
    settings.value=data.settings;status.value='Тема опубликована. Экран посетителя обновится автоматически.';
  }catch(e){error.value=message(e);}finally{busy.value=false;}
}
async function saveDkColors(){
  if(!settings.value||props.role!=='admin'||busy.value||!dkColorDirty.value)return;
  busy.value=true;error.value='';
  try{
    const data=await request<{settings:ThemeSettings}>('/api/editor/theme/dk-colors',{
      method:'POST',headers,
      body:JSON.stringify({background:dkBackground.value,glow:dkGlow.value,
        expectedRevision:settings.value.revision}),
    });
    settings.value=data.settings;
    status.value='Цвета ДК применены. Посетительский экран подхватит изменения без перезапуска.';
  }catch(e){error.value=message(e);}finally{busy.value=false;}
}
function resetDkColors(){
  dkBackground.value=DK_BACKGROUND;dkGlow.value=DK_GLOW;
}
async function saveFullscreen(enabled:boolean){
  if(!settings.value||props.role!=='admin'||busy.value)return;
  busy.value=true;error.value='';
  try{
    const data=await request<{settings:ThemeSettings}>('/api/editor/theme/fullscreen',{
      method:'POST',headers,
      body:JSON.stringify({enabled,expectedRevision:settings.value.revision}),
    });
    settings.value=data.settings;
    status.value=enabled
      ? 'Режим для посетителей включён. Полный экран запускается по жесту посетителя или кнопке в Edge.'
      : 'Запрос полноэкранного режима на экране посетителя отключён.';
  }catch(e){error.value=message(e);}finally{busy.value=false;}
}
onMounted(()=>{void load();});
</script>
<template>
  <section class="visitor-theme-workspace">
    <div class="visitor-theme-intro">
      <div>
        <span class="eyebrow">ОФОРМЛЕНИЕ ВСЕЙ НАВИКУЛЬТУРЫ</span>
        <h2>Темы для посетителей</h2>
        <p class="editor-hint">Единый стиль афиш, календаря, карточек и двухцветных значков меню. Выберите тему, посмотрите предпросмотр, сохраните выбор и опубликуйте.</p>
        <p class="editor-hint">Сейчас на экране посетителя: <strong>{{publishedName}}</strong>.</p>
      </div>
      <button type="button" class="secondary-button" :disabled="busy" @click="load">Обновить</button>
    </div>
    <div class="visitor-theme-cards" role="group" aria-label="Выбрать общую тему">
      <button v-for="item in themes" :key="item.id" type="button" class="visitor-theme-card"
        :class="{selected:choice===item.id}" :aria-pressed="choice===item.id"
        :disabled="busy||role==='viewer'" @click="choice=item.id;status='Предпросмотр темы — ещё не опубликована';error=''">
        <div class="visitor-theme-preview" :data-visitor-theme="item.id" :style="item.id==='dk'?dkPreviewStyle:undefined" aria-hidden="true">
          <div class="theme-mini-header"><DkLogo class="theme-mini-dk-logo"/><span>ДК</span></div>
          <div class="theme-mini-title">Афиша.</div>
          <div class="theme-mini-controls theme-mini-icons"><span><KioskMenuIcon name="posters"/> Афиша</span><span><KioskMenuIcon name="groups"/> Коллективы</span></div>
          <div class="theme-mini-bottom"><span>События · Навигация</span><span>01 / 08</span></div>
        </div>
        <strong>{{item.name}}</strong>
        <small>{{item.description}}</small>
        <span class="visitor-theme-flag">{{settings?.published===item.id?'● Опубликована':choice===item.id?'● Выбрана для просмотра':' '}}</span>
      </button>
    </div>
    <div class="visitor-theme-large">
      <span class="eyebrow">ПРЕДПРОСМОТР · {{selectedName.toUpperCase()}}</span>
      <div class="visitor-theme-preview" :data-visitor-theme="choice" :style="choice==='dk'?dkPreviewStyle:undefined" aria-label="Предпросмотр выбранной темы">
        <div class="theme-mini-header"><DkLogo class="theme-mini-dk-logo"/><span>СЕГОДНЯ</span></div>
        <div class="theme-mini-title">Афиша и события.</div>
        <div class="theme-mini-controls theme-mini-icons"><span><KioskMenuIcon name="posters"/> Афиша</span><span><KioskMenuIcon name="calendar"/> Календарь</span><span><KioskMenuIcon name="groups"/> Коллективы</span></div>
        <div class="theme-mini-bottom"><span>Найдите нужное событие</span><span>ГДК «КИРОВСКИЙ»</span></div>
      </div>
    </div>
    <section v-if="choice==='dk'" class="visitor-dk-color-settings" aria-label="Палитра темы ДК">
      <div class="visitor-dk-color-heading"><h3>Цвета фона ДК</h3>
        <p class="editor-hint">Выберите оттенки на цветовом круге. Акценты логотипа и значков остаются прежними.</p></div>
      <div class="visitor-dk-color-grid">
        <label class="visitor-dk-color-field">
          <span>Основной фон</span>
          <input type="color" v-model="dkBackground" :disabled="busy||role!=='admin'"
            aria-label="Выбрать цвет фона ДК"/>
          <code>{{dkBackground}}</code>
        </label>
        <label class="visitor-dk-color-field">
          <span>Движущееся световое пятно</span>
          <input type="color" v-model="dkGlow" :disabled="busy||role!=='admin'"
            aria-label="Выбрать цвет светового пятна ДК"/>
          <code>{{dkGlow}}</code>
        </label>
      </div>
      <div class="visitor-dk-color-actions">
        <button v-if="role==='admin'" type="button" class="primary-button"
          :disabled="busy||!dkColorDirty" @click="saveDkColors">Применить цвета</button>
        <button v-if="role==='admin'" type="button" class="secondary-button"
          :disabled="busy" @click="resetDkColors">Исходные оттенки</button>
        <span class="editor-hint">Предпросмотр меняется сразу. Нажмите «Применить цвета» для сохранения.</span>
      </div>
    </section>
    <section v-if="role==='admin'" class="visitor-kiosk-settings">
      <h3>Режим терминала</h3>
      <label class="visitor-kiosk-fullscreen">
        <input type="checkbox" :checked="settings?.fullscreenEnabled??false"
          :disabled="busy||!settings" @change="saveFullscreen(($event.target as HTMLInputElement).checked)"/>
        <span>Предлагать полноэкранный режим на экране посетителя</span>
      </label>
      <p class="editor-hint">Сохраняется для всей системы. Обычный браузер не разрешает включать полноэкранный режим без действия пользователя; на экране появится кнопка, а на первом касании запускается попытка Fullscreen API. Для принудительного запуска без касания используйте Windows Edge kiosk.</p>
    </section>
    <div class="visitor-theme-actions">
      <button v-if="role!=='viewer'" type="button" class="secondary-button" :disabled="busy||!dirty" @click="save">Сохранить выбор</button>
      <button v-if="role==='admin'" type="button" class="primary-button"
        :disabled="busy||dirty||settings?.draft===settings?.published" @click="publish">Опубликовать тему</button>
      <p role="status">{{status}}</p>
    </div>
    <p v-if="error" class="editor-error" role="alert">{{error}}</p>
    <p class="editor-hint">Тема меняет только внешний вид и два цвета SVG-значков. Данные коллективов, афиш и календаря не затрагиваются. Вернуть прежнюю тему можно повторной публикацией.</p>
  </section>
</template>
