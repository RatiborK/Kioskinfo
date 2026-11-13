<!-- apps/web/src/views/EditorView.vue — authenticated editor, debounce save and optimistic revisions. -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import VisitorThemeEditor from '../components/VisitorThemeEditor.vue';
import EventEditor from '../components/EventEditor.vue';
import DocumentEditor from '../components/DocumentEditor.vue';
import CultureEditor from '../components/CultureEditor.vue';
import KioskKeyboard from '../components/KioskKeyboard.vue';
type Role = 'admin' | 'editor' | 'viewer';
type Account = {id:string; username:string; displayName:string; role:Role};
type Page = {id:string;slug:string;title:string;body:string;revision:number;published_revision:number|null};
type Poster = {name:string;title:string;kind:'image'|'video';url:string;sizeBytes:number;updatedAt:string};
const eventEditor=ref<{flush:()=>Promise<boolean>}|null>(null);
const cultureEditor=ref<{flush:()=>Promise<boolean>}|null>(null);
const route=useRoute(),router=useRouter();
const tabs=[
  {id:'culture',label:'Наполнение ДК',number:'01'},
  {id:'posters',label:'Афиши',number:'02'},
  {id:'calendar',label:'Календарь',number:'03'},
  {id:'documents',label:'Документы',number:'04'},
  {id:'pages',label:'Страницы',number:'05'},
  {id:'themes',label:'Темы оформления',number:'06'},
] as const;
type EditorTab=(typeof tabs)[number]['id'];
const activeTab=computed<EditorTab>(()=>{
  const tab=route.query.tab;
  return tabs.some(item=>item.id===tab)?tab as EditorTab:'culture';
});
const posters = ref<Poster[]>([]);
const uploading = ref(false);
const posterStatus = ref('');
const posterError = ref('');
async function loadPosters(){
  try {const response=await fetch('/api/public/posters',{cache:'no-store'});if(!response.ok)throw new Error('Каталог афиш недоступен');
    const data:{posters:Poster[];ignored:number}=await response.json();posters.value=data.posters;
    posterStatus.value=`Найдено афиш: ${data.posters.length}`+(data.ignored?`. Пропущено файлов: ${data.ignored}`:'');
  }catch(e){posterError.value=String(e instanceof Error?e.message:e);}
}
function readBase64(file:File):Promise<string>{return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
  reader.onerror=()=>reject(new Error('Не удалось прочитать файл'));
  reader.readAsDataURL(file);
});}
async function uploadPosters(event:Event){
  const input=event.target as HTMLInputElement;
  const files=Array.from(input.files||[]);if(!files.length)return;
  uploading.value=true;posterError.value='';
  try {for(const file of files){
    if(file.size>8*1024*1024)throw new Error(`${file.name}: файл больше 8 МБ`);
    const base64=await readBase64(file);
    await api('/api/editor/posters',{method:'POST',headers,body:JSON.stringify({name:file.name,base64})});
  } await loadPosters();posterStatus.value=`Загружено: ${files.length}. Терминалы обновятся автоматически.`;
  }catch(e){posterError.value=String(e instanceof Error?e.message:e);await loadPosters();}
  finally{uploading.value=false;input.value='';}
}
async function removePoster(item:Poster){
  if(!window.confirm(`Удалить афишу «${item.title}»?`))return;
  posterError.value='';
  try {await api(`/api/editor/posters/${encodeURIComponent(item.name)}`,{method:'DELETE',headers,body:'{}'});
    await loadPosters();posterStatus.value='Афиша удалена. Экран обновится автоматически.';
  }catch(e){posterError.value=String(e instanceof Error?e.message:e);}
}
const user = ref<Account|null>(null);
const username = ref(''); const password = ref('');
const loginKeyboard=ref(false),loginKeyboardTarget=ref<'username'|'password'>('username');
function editCredential(value:string){
  if(loginKeyboardTarget.value==='username')username.value=value;
  else password.value=value;
}
function toggleLoginKeyboard(target:'username'|'password'){
  if(loginKeyboard.value&&loginKeyboardTarget.value===target){loginKeyboard.value=false;return;}
  loginKeyboardTarget.value=target;loginKeyboard.value=true;
}
const pages = ref<Page[]>([]); const selectedId = ref('');
const title = ref(''); const body = ref(''); const revision = ref(0);
const status = ref('Подключение…'); const busy = ref(false); const error = ref('');
let changed = false;
let pendingPageSave:Promise<void>|null=null;
const headers = {'Content-Type':'application/json','X-Navikultura-Action':'1'};
async function api(path:string, init:RequestInit={}) {
  const res=await fetch(path,{...init,credentials:'same-origin',cache:'no-store'});
  const json=await res.json();
  if(!res.ok) throw new Error(json.error || `Ошибка ${res.status}`);
  return json;
}
function usePage(page:Page) {
  changed=false;
  selectedId.value=page.id; title.value=page.title; body.value=page.body; revision.value=page.revision;
  status.value='Изменений нет'; error.value='';
}
async function loadPages() {
  const data:{pages:Page[]}=await api('/api/editor/pages'); pages.value=data.pages;
  await loadPosters();
  const current=data.pages.find(p=>p.id===selectedId.value)||data.pages[0];
  if(current) usePage(current);
}
async function refreshSession(){
  try {
    const data:{user:Account}=await api('/api/auth/me');
    user.value=data.user;
  }catch {
    user.value=null;status.value='Войдите для редактирования';return;
  }
  // A failed ancillary pages request must not hide an authorized culture editor.
  try{await loadPages();}
  catch(e){error.value='Загрузка списка страниц не удалась: '+String(e instanceof Error?e.message:e)+'. Раздел «Наполнение ДК» остаётся доступным.';}
}
async function selectPage(page:Page) {
  if(!await flushPage())return;
  usePage(pages.value.find(p=>p.id===page.id)||page);
}
async function reloadPages(){
  if(!await flushPage())return;
  await loadPages();
}
async function login(){
  error.value='';busy.value=true;
  try {const data:{user:Account}=await api('/api/auth/login',{method:'POST',headers,body:JSON.stringify({username:username.value,password:password.value})});
    user.value=data.user;password.value='';await loadPages();}
  catch(e){error.value=String(e instanceof Error?e.message:e)} finally {busy.value=false;}
}
async function logout(){
  if(!await flushPage())return;
  try{await api('/api/auth/logout',{method:'POST',headers,body:'{}'});}finally{user.value=null;pages.value=[];selectedId.value='';}
}
function changedField(){
  if(!user.value||user.value.role==='viewer')return;
  changed=true;status.value='Ожидает сохранения…';

}
async function persistPage(){
  if(!changed||busy.value||!selectedId.value)return;
  const snapshot={title:title.value,body:body.value,expectedRevision:revision.value};
  const requestedRevision=revision.value;
  changed=false;busy.value=true;status.value='Сохранение…';error.value='';
  try {
    const data:{page:Page}=await api(`/api/editor/pages/${selectedId.value}`,{method:'PATCH',headers,body:JSON.stringify(snapshot)});
    revision.value=data.page.revision;
    const index=pages.value.findIndex(p=>p.id===selectedId.value);
    if(index>=0)pages.value[index]=data.page;
    if(changed){status.value='Есть новые изменения — сохраните после редактирования';}
    else status.value='Сохранено · версия '+revision.value;
  }catch(e){
    changed=true;
    error.value=String(e instanceof Error?e.message:e);
    status.value=requestedRevision===revision.value?'Ошибка сохранения — изменения остались в форме':'Ошибка синхронизации';
  }finally{busy.value=false;}
}
function save():Promise<void>{
  if(pendingPageSave)return pendingPageSave.then(()=>{
    if(changed&&!error.value)return save();
  });
  const task=persistPage();
  pendingPageSave=task.finally(()=>{pendingPageSave=null;});
  return pendingPageSave;
}
async function flushPage():Promise<boolean>{
  if(pendingPageSave)await pendingPageSave;
  if(changed&&!error.value)await save();
  return !changed&&!busy.value;
}
async function publish(){
  if(!await flushPage())return;
  busy.value=true;error.value='';
  try {const data:{page:Page}=await api(`/api/editor/pages/${selectedId.value}/publish`,{method:'POST',headers,body:JSON.stringify({expectedRevision:revision.value})});
    const index=pages.value.findIndex(p=>p.id===selectedId.value);if(index>=0)pages.value[index]=data.page;
    status.value='Опубликовано · версия '+revision.value;
  }catch(e){error.value=String(e instanceof Error?e.message:e);} finally{busy.value=false;}
}
/** Save outgoing drafts before navigation; inactive panels stay mounted via v-show. */
async function changeTab(next:EditorTab):Promise<boolean>{
  if(next===activeTab.value)return true;
  if(busy.value||uploading.value)return false;
  if(activeTab.value==='pages'&&!await flushPage())return false;
  if(activeTab.value==='calendar'&&eventEditor.value&&!await eventEditor.value.flush())return false;
  if(activeTab.value==='culture'&&cultureEditor.value&&!await cultureEditor.value.flush())return false;
  await router.replace({path:route.path,query:{...route.query,tab:next}});
  return true;
}
async function handleTabKeydown(event:KeyboardEvent){
  const key=event.key;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(key))return;
  event.preventDefault();
  const current=tabs.findIndex(tab=>tab.id===activeTab.value);
  const next=key==='Home'?0:key==='End'?tabs.length-1:(current+(key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  const target=tabs[next];
  if(target&&await changeTab(target.id))document.getElementById('editor-tab-'+target.id)?.focus();
}
// Only the unauthenticated login screen times out. An authenticated editor is never redirected.
let loginLastActivity=Date.now();
let loginIdleTimer:ReturnType<typeof setInterval>|undefined;
function loginActivity(){if(!user.value)loginLastActivity=Date.now();}
function loginIdleCheck(){if(!user.value && Date.now()-loginLastActivity>=180000)void router.replace('/screen');}
function warnOnLeave(event:BeforeUnloadEvent){if(changed||busy.value){event.preventDefault();event.returnValue='';}}
onMounted(()=>{
  window.addEventListener('beforeunload',warnOnLeave);
  window.addEventListener('pointerdown',loginActivity,{passive:true});
  window.addEventListener('keydown',loginActivity);
  loginIdleTimer=setInterval(loginIdleCheck,10000);
  void refreshSession();
});
onBeforeUnmount(()=>{
  window.removeEventListener('beforeunload',warnOnLeave);
  window.removeEventListener('pointerdown',loginActivity);
  window.removeEventListener('keydown',loginActivity);
  if(loginIdleTimer)clearInterval(loginIdleTimer);
});
</script>
<template>
  <main class="editor-shell">
    <header class="editor-header">
      <div><span class="eyebrow">НАВИКУЛЬТУРА / УПРАВЛЕНИЕ</span><h1>Кабинет сотрудника<span class="dot">.</span></h1></div>
      <a class="editor-link" href="/screen">Экран посетителя →</a>
    </header>
    <section v-if="!user" class="editor-panel login-panel">
      <h2>Вход в систему</h2><p class="editor-hint">Редактирование доступно только сотрудникам с учётной записью.</p>
      <form @submit.prevent="login"><label>Логин<input v-model="username" autocomplete="username" required maxlength="80"
          @focus="loginKeyboardTarget='username'"/></label>
        <label>Пароль<input v-model="password" type="password" autocomplete="current-password" required
          @focus="loginKeyboardTarget='password'"/></label>
        <div class="login-keyboard-bar">
          <button type="button" class="secondary-button" :aria-expanded="loginKeyboard"
            @click="toggleLoginKeyboard('username')">⌨ Логин</button>
          <button type="button" class="secondary-button" :aria-expanded="loginKeyboard"
            @click="toggleLoginKeyboard('password')">⌨ Пароль</button>
        </div>
        <div v-if="loginKeyboard" class="login-touch-keyboard">
          <p>Экранная клавиатура — {{loginKeyboardTarget==='username'?'логин':'пароль'}}</p>
          <KioskKeyboard :model-value="loginKeyboardTarget==='username'?username:password"
            @update:model-value="editCredential" @close="loginKeyboard=false"/>
        </div>
        <button class="primary-button" :disabled="busy" type="submit">Войти</button>
      </form>
      <p v-if="error" class="editor-error" role="alert">{{error}}</p>
      <p class="editor-hint">Если не выполнять действий в течение трёх минут, страница входа вернётся на экран посетителя.</p>
    </section>
    <section v-else class="editor-dashboard">
      <div class="editor-dashboard-bar">
        <div><span class="eyebrow">РАБОЧАЯ ОБЛАСТЬ</span><p class="editor-dashboard-help">Выберите раздел — здесь появятся только его инструменты.</p></div>
        <div class="editor-dashboard-user"><span>{{user.displayName}} · {{user.role}}</span><button class="secondary-button" type="button" @click="logout">Выйти</button></div>
      </div>
      <nav class="editor-tabs" role="tablist" aria-label="Разделы кабинета сотрудника" @keydown="handleTabKeydown">
        <button v-for="tab in tabs" :id="'editor-tab-'+tab.id" :key="tab.id" type="button" role="tab"
          :aria-selected="activeTab===tab.id" :aria-controls="'editor-panel-'+tab.id"
          :tabindex="activeTab===tab.id?0:-1" @click="changeTab(tab.id)">
          <span class="editor-tabs-number">{{tab.number}}</span>{{tab.label}}
        </button>
      </nav>
      <div id="editor-panel-posters" v-show="activeTab==='posters'" class="editor-tab-content" role="tabpanel" aria-labelledby="editor-tab-posters">
      <section class="editor-panel poster-editor">
        <div class="poster-editor-top"><div><span class="eyebrow">АВТОМАТИЧЕСКИЙ КАТАЛОГ</span><h2>Афиши и медиаматериалы</h2></div><button type="button" class="secondary-button" @click="loadPosters">Обновить список</button></div>
        <p class="editor-hint">Добавь изображение в браузере или скопируй его в папку <code>content/posters</code> проекта. При добавлении и удалении файлов экран обновится автоматически.</p>
        <label v-if="user.role!=='viewer'" class="poster-upload">Добавить афиши (JPG, PNG, WebP до 8 МБ)
          <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple :disabled="uploading" @change="uploadPosters" />
        </label>
        <p class="status-line" role="status">{{uploading?'Загрузка…':posterStatus}}</p>
        <p v-if="posterError" class="editor-error" role="alert">{{posterError}}</p>
        <div class="poster-editor-list" v-if="posters.length">
          <div v-for="poster in posters" :key="poster.name" class="poster-editor-row">
            <img v-if="poster.kind==='image'" :src="poster.url" :alt="poster.title" loading="lazy" />
            <span v-else class="poster-video-icon">▶</span>
            <span class="poster-editor-name">{{poster.title}}<small>{{(poster.sizeBytes/1024/1024).toFixed(2)}} МБ</small></span>
            <button v-if="user.role!=='viewer'" class="secondary-button" type="button" @click="removePoster(poster)">Удалить</button>
          </div>
        </div>
      </section>
      </div>
      <div id="editor-panel-pages" v-show="activeTab==='pages'" class="editor-tab-content editor-pages-layout" role="tabpanel" aria-labelledby="editor-tab-pages">
      <aside class="editor-page-list"><h2>Страницы</h2><button v-for="page in pages" :key="page.id" class="editor-page-link" :class="{'current':page.id===selectedId}" @click="selectPage(page)">{{page.title}}</button></aside>
      <section class="editor-panel">
        <h2>Содержимое страницы</h2>
        <p class="editor-hint">Изменения сохраняются после выхода из поля или по кнопке. Публикация — отдельное действие.</p>
        <form v-if="selectedId" @submit.prevent="save">
          <label>Название<input v-model="title" :disabled="user.role==='viewer'" maxlength="140" @input="changedField" @blur="save" /></label>
          <label>Текст<textarea v-model="body" :disabled="user.role==='viewer'" rows="9" maxlength="100000" @input="changedField" @blur="save"></textarea></label>
          <div class="editor-actions">
            <button class="primary-button" type="button" :disabled="busy||user.role==='viewer'" @click="save">Сохранить сейчас</button>
            <button v-if="user.role==='admin'" class="secondary-button" type="button" :disabled="busy" @click="publish">Опубликовать</button>
            <button class="secondary-button" type="button" :disabled="busy" @click="reloadPages">Загрузить с сервера</button>
          </div>
        </form>
        <p class="status-line">{{status}}</p><p v-if="error" class="editor-error" role="alert">{{error}}</p>
      </section>
      </div>
      <div id="editor-panel-themes" v-show="activeTab==='themes'" class="editor-tab-content" role="tabpanel" aria-labelledby="editor-tab-themes">
        <VisitorThemeEditor :role="user.role" />
      </div>
      <div id="editor-panel-calendar" v-show="activeTab==='calendar'" class="editor-tab-content" role="tabpanel" aria-labelledby="editor-tab-calendar">
        <EventEditor ref="eventEditor" :role="user.role"/>
      </div>
      <div id="editor-panel-documents" v-show="activeTab==='documents'" class="editor-tab-content" role="tabpanel" aria-labelledby="editor-tab-documents">
        <DocumentEditor :role="user.role"/>
      </div>
      <div id="editor-panel-culture" v-show="activeTab==='culture'" class="editor-tab-content" role="tabpanel" aria-labelledby="editor-tab-culture">
        <CultureEditor ref="cultureEditor" :role="user.role"/>
      </div>
    </section>
  </main>
</template>
