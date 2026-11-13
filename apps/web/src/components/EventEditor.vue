<!-- apps/web/src/components/EventEditor.vue — typed cultural event editor and publication. -->
<script setup lang="ts">
import {onMounted,ref,reactive} from 'vue';
type Role='admin'|'editor'|'viewer';
type Type='concert'|'play'|'festival'|'other';
type Venue='hall'|'foyer'|'orfey';
type Fields={title:string;date:string;time:string;type:Type;venue:Venue;description:string;ticketUrl:string};
type Item=Fields&{id:string;revision:number;published:Fields|null;updatedAt:string};
const props=defineProps<{role:Role}>();
const items=ref<Item[]>([]),selected=ref(''),revision=ref(0),status=ref('Загрузка…'),error=ref(''),busy=ref(false),dirty=ref(false);
const form=reactive<Fields>({title:'',date:new Date().toLocaleDateString('sv-SE'),time:'',type:'concert',venue:'hall',description:'',ticketUrl:''});
const headers={'content-type':'application/json','x-navikultura-action':'1'};
async function api<T>(path:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(path,{...init,cache:'no-store',credentials:'same-origin'});
  const data:unknown=await r.json();
  if(!r.ok)throw Error((data as {error?:string}).error||'Ошибка '+r.status);
  return data as T;
}
function errorText(e:unknown){return e instanceof Error?e.message:String(e);}
function use(item:Item){selected.value=item.id;revision.value=item.revision;
  Object.assign(form,{title:item.title,date:item.date,time:item.time,type:item.type,venue:item.venue,description:item.description,ticketUrl:item.ticketUrl??''});
  dirty.value=false;status.value=item.published?'Опубликовано / при редактировании требуется повторная публикация':'Черновик';error.value='';
}
async function load(){
  busy.value=true;error.value='';
  try{const data=await api<{items:Item[]}>('/api/editor/events');
    items.value=data.items.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'ru'));
    const row=items.value.find(x=>x.id===selected.value)??items.value[0];
    if(row)use(row);else{selected.value='';status.value='Создайте первое мероприятие';}
  }catch(e){error.value=errorText(e);}finally{busy.value=false;}
}
function changed(){dirty.value=true;status.value='Есть изменения — сохраните при выходе из поля или по кнопке';error.value='';}
async function save():Promise<boolean>{
  if(!dirty.value)return true;
  if(busy.value||!selected.value)return false;
  busy.value=true;error.value='';const id=selected.value,base=revision.value,fields={...form};
  try{
    const r=await api<{item:Item}>('/api/editor/events/'+id,{method:'PATCH',headers,
      body:JSON.stringify({fields,expectedRevision:base})});
    const idx=items.value.findIndex(x=>x.id===id);if(idx>=0)items.value[idx]=r.item;
    if(selected.value===id){revision.value=r.item.revision;dirty.value=Object.keys(fields).some(k=>
      form[k as keyof Fields]!==fields[k as keyof Fields]);status.value=dirty.value?'Есть новые изменения':'Черновик сохранён';}
    return !dirty.value;
  }catch(e){error.value=errorText(e);status.value='Изменения остались в форме';return false;
  }finally{busy.value=false;}
}
async function select(item:Item){if(item.id!==selected.value&&await save())use(item);}
async function create(){
  if(props.role==='viewer'||busy.value||!await save())return;
  busy.value=true;error.value='';
  try{
    const fields:Fields={title:'Новое мероприятие',date:new Date().toLocaleDateString('sv-SE'),
      time:'',type:'concert',venue:'hall',description:'',ticketUrl:''};
    const r=await api<{item:Item}>('/api/editor/events',{method:'POST',headers,body:JSON.stringify({fields})});
    items.value.push(r.item);use(r.item);status.value='Черновик создан — заполните поля и опубликуйте';
  }catch(e){error.value=errorText(e);}finally{busy.value=false;}
}
async function publish(){
  if(props.role==='viewer'||busy.value||!await save())return;
  busy.value=true;error.value='';
  try{
    const r=await api<{item:Item}>('/api/editor/events/'+selected.value+'/publish',{method:'POST',headers,
      body:JSON.stringify({expectedRevision:revision.value})});
    const idx=items.value.findIndex(x=>x.id===selected.value);if(idx>=0)items.value[idx]=r.item;
    status.value='Опубликовано — календарь посетителя обновится автоматически';
  }catch(e){error.value=errorText(e);}finally{busy.value=false;}
}
async function remove(){
  if(props.role!=='admin'||busy.value||!selected.value||!await save())return;
  if(!window.confirm('Удалить мероприятие из календаря?'))return;
  busy.value=true;error.value='';
  try{
    await api('/api/editor/events/'+selected.value,{method:'DELETE',headers,
      body:JSON.stringify({expectedRevision:revision.value})});
    const removed=selected.value;items.value=items.value.filter(x=>x.id!==removed);selected.value='';
    if(items.value.length)use(items.value[0]);else status.value='Мероприятие удалено';
  }catch(e){error.value=errorText(e);}finally{busy.value=false;}
}
defineExpose({flush:save});
onMounted(()=>{void load();});
</script>
<template>
  <section class="editor-panel event-editor">
    <div class="poster-editor-top"><div><span class="eyebrow">КАЛЕНДАРЬ СОБЫТИЙ</span><h2>Мероприятия ДК</h2></div>
      <div class="editor-actions"><button type="button" class="secondary-button" :disabled="busy" @click="load">Обновить</button>
      <button v-if="role!=='viewer'" type="button" class="primary-button" :disabled="busy" @click="create">+ Мероприятие</button></div>
    </div>
    <p class="editor-hint">Тип определяет цвет: жёлтый — концерт, синий — спектакль, зелёный — фестиваль, сиреневый — другое. Место показывает символ.</p>
    <div class="event-editor-layout">
      <aside class="schedule-manager-list"><h3>Мероприятия ({{items.length}})</h3>
        <button v-for="item in items" :key="item.id" type="button" :class="{current:selected===item.id}"
          @click="select(item)"><b>{{item.title}}</b><small>{{item.date}} {{item.time}} · {{item.published?'Опубликовано':'Черновик'}}</small></button>
        <p v-if="!items.length" class="editor-hint">Нет мероприятий. Создайте первую запись.</p>
      </aside>
      <div v-if="selected" class="event-edit-fields">
        <label>Название мероприятия<input v-model="form.title" maxlength="120" required :disabled="role==='viewer'" @input="changed" @blur="save"/></label>
        <label>Дата<input v-model="form.date" type="date" required :disabled="role==='viewer'" @change="changed" @blur="save"/></label>
        <label>Время начала<input v-model="form.time" type="time" :disabled="role==='viewer'" @change="changed" @blur="save"/></label>
        <label>Тип мероприятия<select v-model="form.type" :disabled="role==='viewer'" @change="changed" @blur="save">
          <option value="concert">Жёлтый · Концерт</option><option value="play">Синий · Спектакль</option>
          <option value="festival">Зелёный · Фестиваль</option><option value="other">Сиреневый · Другое</option>
        </select></label>
        <label>Где проводится<select v-model="form.venue" :disabled="role==='viewer'" @change="changed" @blur="save">
          <option value="hall">★ Концертный зал</option><option value="foyer">● Танц-фойе</option>
          <option value="orfey">■ Театр «Орфей», 3-й этаж</option></select></label>
        <label class="event-description">Ссылка на билет Muzaticket (необязательно)
          <input v-model="form.ticketUrl" type="url" maxlength="600" placeholder="https://muzaticket.ru/iframe/..." 
          :disabled="role==='viewer'" @input="changed" @blur="save"/>
          <small>На карточке мероприятия появится кнопка «Купить билет». Окно покупки откроется внутри НавиКультуры.</small>
        </label>
        <label class="event-description">Описание<textarea v-model="form.description" rows="5" maxlength="2000"
          :disabled="role==='viewer'" @input="changed" @blur="save"></textarea></label>
        <div class="editor-actions event-description">
          <button v-if="role!=='viewer'" type="button" class="secondary-button" :disabled="busy||!dirty" @click="save">Сохранить</button>
          <button v-if="role!=='viewer'" type="button" class="primary-button" :disabled="busy" @click="publish">Опубликовать</button>
          <button v-if="role==='admin'" type="button" class="secondary-button" :disabled="busy" @click="remove">Удалить</button>
        </div>
      </div>
    </div>
    <p role="status" class="status-line">{{status}}</p><p v-if="error" role="alert" class="editor-error">{{error}}</p>
  </section>
</template>