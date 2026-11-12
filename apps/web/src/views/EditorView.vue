<!-- apps/web/src/views/EditorView.vue — authenticated editor, debounce save and optimistic revisions. -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
type Role = 'admin' | 'editor' | 'viewer';
type Account = {id:string; username:string; displayName:string; role:Role};
type Page = {id:string;slug:string;title:string;body:string;revision:number;published_revision:number|null};
const user = ref<Account|null>(null);
const username = ref(''); const password = ref('');
const pages = ref<Page[]>([]); const selectedId = ref('');
const title = ref(''); const body = ref(''); const revision = ref(0);
const status = ref('Подключение…'); const busy = ref(false); const error = ref('');
let timer:ReturnType<typeof setTimeout>|undefined;
let changed = false;
const headers = {'Content-Type':'application/json','X-Navikultura-Action':'1'};
async function api(path:string, init:RequestInit={}) {
  const res=await fetch(path,{...init,credentials:'same-origin',cache:'no-store'});
  const json=await res.json();
  if(!res.ok) throw new Error(json.error || `Ошибка ${res.status}`);
  return json;
}
function usePage(page:Page) {
  if(timer) clearTimeout(timer); changed=false;
  selectedId.value=page.id; title.value=page.title; body.value=page.body; revision.value=page.revision;
  status.value='Изменений нет'; error.value='';
}
async function loadPages() {
  const data:{pages:Page[]}=await api('/api/editor/pages'); pages.value=data.pages;
  const current=data.pages.find(p=>p.id===selectedId.value)||data.pages[0];
  if(current) usePage(current);
}
async function refreshSession(){
  try {const data:{user:Account}=await api('/api/auth/me'); user.value=data.user; await loadPages();}
  catch {user.value=null;status.value='Войдите для редактирования';}
}
async function selectPage(page:Page) {
  if(busy.value)return;
  if(changed){await save();if(changed)return;}
  usePage(pages.value.find(p=>p.id===page.id)||page);
}
async function reloadPages(){
  if(busy.value)return;
  if(changed){await save();if(changed)return;}
  await loadPages();
}
async function login(){
  error.value='';busy.value=true;
  try {const data:{user:Account}=await api('/api/auth/login',{method:'POST',headers,body:JSON.stringify({username:username.value,password:password.value})});
    user.value=data.user;password.value='';await loadPages();}
  catch(e){error.value=String(e instanceof Error?e.message:e)} finally {busy.value=false;}
}
async function logout(){
  if(busy.value)return;
  if(changed){await save();if(changed)return;}
  if(timer)clearTimeout(timer);
  try{await api('/api/auth/logout',{method:'POST',headers,body:'{}'});}finally{user.value=null;pages.value=[];selectedId.value='';}
}
function changedField(){
  if(!user.value||user.value.role==='viewer')return;
  changed=true;status.value='Ожидает сохранения…';
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>void save(),800);
}
async function save(){
  if(!changed||busy.value||!selectedId.value)return;
  const snapshot={title:title.value,body:body.value,expectedRevision:revision.value};
  const requestedRevision=revision.value;
  changed=false;busy.value=true;status.value='Сохранение…';error.value='';
  try {
    const data:{page:Page}=await api(`/api/editor/pages/${selectedId.value}`,{method:'PATCH',headers,body:JSON.stringify(snapshot)});
    revision.value=data.page.revision;
    const index=pages.value.findIndex(p=>p.id===selectedId.value);
    if(index>=0)pages.value[index]=data.page;
    if(changed){status.value='Есть новые изменения';timer=setTimeout(()=>void save(),500);}
    else status.value='Сохранено · версия '+revision.value;
  }catch(e){
    changed=true;
    error.value=String(e instanceof Error?e.message:e);
    status.value=requestedRevision===revision.value?'Ошибка сохранения — изменения остались в форме':'Ошибка синхронизации';
  }finally{busy.value=false;}
}
async function publish(){
  if(busy.value)return;
  if(changed){await save(); if(changed)return;}
  busy.value=true;error.value='';
  try {const data:{page:Page}=await api(`/api/editor/pages/${selectedId.value}/publish`,{method:'POST',headers,body:JSON.stringify({expectedRevision:revision.value})});
    const index=pages.value.findIndex(p=>p.id===selectedId.value);if(index>=0)pages.value[index]=data.page;
    status.value='Опубликовано · версия '+revision.value;
  }catch(e){error.value=String(e instanceof Error?e.message:e);} finally{busy.value=false;}
}
function warnOnLeave(event:BeforeUnloadEvent){if(changed||busy.value){event.preventDefault();event.returnValue='';}}
onMounted(()=>{window.addEventListener('beforeunload',warnOnLeave);void refreshSession();});
onBeforeUnmount(()=>{if(timer)clearTimeout(timer);window.removeEventListener('beforeunload',warnOnLeave);});
</script>
<template>
  <main class="editor-shell">
    <header class="editor-header">
      <div><span class="eyebrow">НАВИКУЛЬТУРА / УПРАВЛЕНИЕ</span><h1>Кабинет сотрудника<span class="dot">.</span></h1></div>
      <a class="editor-link" href="/screen">Экран посетителя →</a>
    </header>
    <section v-if="!user" class="editor-panel login-panel">
      <h2>Вход в систему</h2><p class="editor-hint">Редактирование доступно только сотрудникам с учётной записью.</p>
      <form @submit.prevent="login"><label>Логин<input v-model="username" autocomplete="username" required maxlength="80" /></label>
        <label>Пароль<input v-model="password" type="password" autocomplete="current-password" required /></label>
        <button class="primary-button" :disabled="busy" type="submit">Войти</button>
      </form>
      <p v-if="error" class="editor-error" role="alert">{{error}}</p>
    </section>
    <section v-else class="editor-workspace">
      <div class="editor-toolbar"><span>{{user.displayName}} · {{user.role}}</span><button class="secondary-button" type="button" @click="logout">Выйти</button></div>
      <aside class="editor-page-list"><h2>Страницы</h2><button v-for="page in pages" :key="page.id" class="editor-page-link" :class="{'current':page.id===selectedId}" @click="selectPage(page)">{{page.title}}</button></aside>
      <section class="editor-panel">
        <h2>Содержимое страницы</h2>
        <p class="editor-hint">Изменения сохраняются автоматически через 0,8 секунды после ввода. Публикация — отдельное действие.</p>
        <form v-if="selectedId" @submit.prevent="save">
          <label>Название<input v-model="title" :disabled="user.role==='viewer'" maxlength="140" @input="changedField" /></label>
          <label>Текст<textarea v-model="body" :disabled="user.role==='viewer'" rows="9" maxlength="100000" @input="changedField"></textarea></label>
          <div class="editor-actions">
            <button class="primary-button" type="button" :disabled="busy||user.role==='viewer'" @click="save">Сохранить сейчас</button>
            <button v-if="user.role==='admin'" class="secondary-button" type="button" :disabled="busy" @click="publish">Опубликовать</button>
            <button class="secondary-button" type="button" :disabled="busy" @click="reloadPages">Загрузить с сервера</button>
          </div>
        </form>
        <p class="status-line">{{status}}</p><p v-if="error" class="editor-error" role="alert">{{error}}</p>
      </section>
    </section>
  </main>
</template>
