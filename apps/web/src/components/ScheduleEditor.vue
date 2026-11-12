<!-- apps/web/src/components/ScheduleEditor.vue — schedule cards edited in a browser. -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
type Theme='orange'|'blue'|'neutral';
type Role='admin'|'editor'|'viewer';
type Fields={label:string;group:string;leader:string;time:string;room:string;description:string;age:string;theme:Theme;inheritTheme:boolean;position:number};
type Card=Fields&{id:string;revision:number;published_revision:number|null;published:Fields|null;updated_at:string};
const props=defineProps<{role:Role}>();
const list=ref<Card[]>([]),id=ref(''),revision=ref(0),busy=ref(false),dirty=ref(false),status=ref('Загрузка…'),error=ref('');
const newLabel=ref(''),newGroup=ref('');
function empty():Fields{return{label:'',group:'',leader:'',time:'',room:'',description:'',age:'',theme:'orange',inheritTheme:false,position:0};}
const form=reactive<Fields>(empty());
const current=computed(()=>list.value.find(x=>x.id===id.value)??null);
const headers={'Content-Type':'application/json','X-Navikultura-Action':'1'};
let timer:ReturnType<typeof setTimeout>|undefined;
let editSeq=0;
async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const result=await fetch(path,{...options,credentials:'same-origin',cache:'no-store'});
  const body:unknown=await result.json();
  if(!result.ok)throw Error((body as {error?:string}).error??`Ошибка HTTP ${result.status}`);
  return body as T;
}
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
function arrange(){list.value.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));}
function upsert(row:Card){const index=list.value.findIndex(x=>x.id===row.id);if(index===-1)list.value.push(row);else list.value[index]=row;arrange();}
function apply(row:Card){if(timer)clearTimeout(timer);id.value=row.id;revision.value=row.revision;
  Object.assign(form,{label:row.label,group:row.group,leader:row.leader,time:row.time,room:row.room,
    description:row.description,age:row.age,theme:row.theme,inheritTheme:row.inheritTheme,position:row.position});
  dirty.value=false;error.value='';status.value=row.published_revision===row.revision?'Опубликовано':'Черновик сохранён';}
async function load(){busy.value=true;error.value='';try{
  const data=await api<{items:Card[]}>('/api/editor/schedule');list.value=data.items;arrange();
  const target=list.value.find(x=>x.id===id.value)??list.value[0];
  if(target)apply(target);else{id.value='';status.value='Создайте первую карточку';}
}catch(e){error.value=err(e);}finally{busy.value=false;}}
function change(){if(props.role==='viewer'||!id.value)return;editSeq++;dirty.value=true;error.value='';status.value='Ожидание автосохранения…';if(timer)clearTimeout(timer);timer=setTimeout(()=>void save(),800);}
async function save():Promise<boolean>{
  if(!dirty.value)return true;
  if(busy.value||!id.value)return false;
  const target=id.value,seq=editSeq,fields={...form},base=revision.value;
  busy.value=true;error.value='';status.value='Сохранение…';let result=false;
  try{const answer=await api<{item:Card}>(`/api/editor/schedule/${target}`,
    {method:'PATCH',headers,body:JSON.stringify({fields,expectedRevision:base})});upsert(answer.item);
    if(id.value===target){revision.value=answer.item.revision;dirty.value=seq!==editSeq;
      status.value=dirty.value?'Есть более свежие изменения':'Черновик сохранён';result=!dirty.value;
    }else result=true;
  }catch(e){error.value=err(e);status.value='Не сохранено — изменения остаются в форме';}
  finally{busy.value=false;if(dirty.value&&!error.value){if(timer)clearTimeout(timer);timer=setTimeout(()=>void save(),400);}}
  return result;
}
async function flush():Promise<boolean>{if(timer)clearTimeout(timer);if(busy.value)return false;return dirty.value?save():true;}
defineExpose({flush});
async function select(row:Card){if(row.id!==id.value&&await flush())apply(row);}
async function create(){if(props.role==='viewer'||busy.value||!await flush())return;
  if(!newLabel.value.trim()||!newGroup.value.trim()){error.value='Введите название кнопки и коллектива';return;}
  busy.value=true;error.value='';
  try{const position=Math.min(1000000,(list.value.length?Math.max(...list.value.map(x=>x.position)):0)+10);
    const fields:Fields={...empty(),label:newLabel.value.trim(),group:newGroup.value.trim(),
      inheritTheme:false,theme:'orange',position};
    const answer=await api<{item:Card}>('/api/editor/schedule',{method:'POST',headers,body:JSON.stringify({fields})});
    upsert(answer.item);apply(answer.item);newLabel.value='';newGroup.value='';status.value='Новая карточка создана. Добавьте данные и опубликуйте.';
  }catch(e){error.value=err(e);}finally{busy.value=false;}}
async function publish(){if(props.role==='viewer'||!current.value||!await flush())return;
  busy.value=true;error.value='';try{const answer=await api<{item:Card}>(`/api/editor/schedule/${id.value}/publish`,
    {method:'POST',headers,body:JSON.stringify({expectedRevision:revision.value})});upsert(answer.item);status.value='Опубликовано — терминал обновится автоматически.';
  }catch(e){error.value=err(e);}finally{busy.value=false;}}
async function remove(){if(props.role!=='admin'||!current.value||!await flush())return;
  if(!window.confirm(`Удалить карточку «${current.value.label}»?`))return;
  busy.value=true;error.value='';try{await api(`/api/editor/schedule/${id.value}`,{method:'DELETE',headers,body:JSON.stringify({expectedRevision:revision.value})});
    list.value=list.value.filter(x=>x.id!==id.value);if(list.value.length)apply(list.value[0]);else{id.value='';status.value='Карточка удалена';}
  }catch(e){error.value=err(e);}finally{busy.value=false;}}
async function refresh(){if(await flush())await load();}
function beforeLeave(e:BeforeUnloadEvent){if(dirty.value||busy.value){e.preventDefault();e.returnValue='';}}
onMounted(()=>{window.addEventListener('beforeunload',beforeLeave);void load();});
onBeforeUnmount(()=>{if(timer)clearTimeout(timer);window.removeEventListener('beforeunload',beforeLeave);});
</script>
<template>
  <section class="editor-panel schedule-manager">
    <div class="poster-editor-top"><div><span class="eyebrow">РАСПИСАНИЕ / БЕЗ EXCEL</span><h2>Коллективы и расписание</h2></div>
      <button type="button" class="secondary-button" :disabled="busy" @click="refresh">Обновить</button></div>
    <p class="editor-hint">Одна карточка создаёт кнопку на экране. Автосохранение через 0,8 секунды; показ посетителям — после публикации. Внешний вид всего экрана настраивается во вкладке «Темы оформления».</p>
    <form v-if="role!=='viewer'" class="schedule-create" @submit.prevent="create">
      <label>Название кнопки<input v-model="newLabel" maxlength="70" placeholder="Например, Танцы" required /></label>
      <label>Коллектив<input v-model="newGroup" maxlength="140" placeholder="Например, Вдохновение" required /></label>

      <button class="primary-button" :disabled="busy" type="submit">+ Создать карточку</button>
    </form>
    <div class="schedule-manager-grid">
      <aside class="schedule-manager-list"><h3>Карточки ({{list.length}})</h3>
        <button v-for="row in list" :key="row.id" type="button" :class="{current:row.id===id}" @click="select(row)">
          <b>{{row.label}}</b><small>{{row.group}} · {{row.published_revision===row.revision?'Опубликовано':row.published_revision?'Черновик с правками':'Черновик'}}</small>
        </button>
        <p v-if="!list.length" class="editor-hint">Пока нет карточек</p></aside>
      <div v-if="current" class="schedule-manager-details">
        <div class="schedule-preview"><span class="eyebrow">ПРЕДПРОСМОТР</span>
          <b>{{form.label||'Название кнопки'}}</b><small>{{form.time||form.group}}</small><small>Общая тема задаётся во вкладке «Темы оформления».</small></div>
        <div class="schedule-edit-fields">
          <label>Название кнопки<input v-model="form.label" maxlength="70" :disabled="role==='viewer'||busy" @input="change" /></label>
          <label>Название коллектива<input v-model="form.group" maxlength="140" :disabled="role==='viewer'||busy" @input="change" /></label>
          <label>Руководитель<input v-model="form.leader" maxlength="140" :disabled="role==='viewer'||busy" @input="change" /></label>
          <label>Расписание<input v-model="form.time" maxlength="200" placeholder="Пн, Ср · 16:00" :disabled="role==='viewer'||busy" @input="change" /></label>
          <label>Кабинет<input v-model="form.room" maxlength="80" :disabled="role==='viewer'||busy" @input="change" /></label>
          <label>Возраст<input v-model="form.age" maxlength="100" :disabled="role==='viewer'||busy" @input="change" /></label>
          <label>Порядок<input v-model.number="form.position" type="number" min="0" max="1000000" :disabled="role==='viewer'||busy" @input="change" /></label>

          <label class="schedule-description">Описание<textarea v-model="form.description" rows="4" maxlength="2500" :disabled="role==='viewer'||busy" @input="change"></textarea></label>
        </div>
        <div class="editor-actions">
          <button v-if="role!=='viewer'" class="secondary-button" type="button" :disabled="busy||!dirty" @click="save">Сохранить сейчас</button>
          <button v-if="role!=='viewer'" class="primary-button" type="button" :disabled="busy" @click="publish">Опубликовать</button>
          <button v-if="role==='admin'" class="secondary-button" type="button" :disabled="busy" @click="remove">Удалить</button>
        </div>
      </div>
      <div v-else class="schedule-manager-details"><p class="editor-hint">Создайте карточку через форму выше</p></div>
    </div>
    <p class="status-line" role="status">{{status}}</p><p v-if="error" class="editor-error" role="alert">{{error}}</p>
  </section>
</template>
