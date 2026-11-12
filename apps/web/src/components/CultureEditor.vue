<!-- apps/web/src/components/CultureEditor.vue — versioned staff editing of all visitor content. -->
<script setup lang="ts">
import {computed,onMounted,ref} from 'vue';
import type {CultureContent,CultureCollective,CultureLeader,CultureState} from '../utils/culture-types.js';
type Role='admin'|'editor'|'viewer';
const props=defineProps<{role:Role}>();
const state=ref<CultureState|null>(null),draft=ref<CultureContent|null>(null);
const selectedPanel=ref<'clubs'|'leaders'|'about'|'safety'|'tickets'|'contacts'>('clubs');
const groupId=ref(''),leaderId=ref('');
const busy=ref(false),dirty=ref(false),message=ref('Загрузка материалов…'),error=ref('');
const panels=[
  {id:'clubs',name:'Коллективы'},{id:'leaders',name:'Руководители'},
  {id:'about',name:'О ДК'},{id:'safety',name:'Безопасность'},
  {id:'tickets',name:'Билеты'},{id:'contacts',name:'Контакты'},
] as const;
const canEdit=computed(()=>props.role==='admin'||props.role==='editor');
const group=computed(()=>draft.value?.collectives.find(x=>x.id===groupId.value)??null);
const leader=computed(()=>draft.value?.leaders.find(x=>x.id===leaderId.value)??null);
const selectedCategoryTitle=computed(()=>draft.value?.categories.find(c=>c.id===group.value?.category)?.title??'');
const headers={'Content-Type':'application/json','X-Navikultura-Action':'1'};
async function api<T>(url:string,init:RequestInit={}):Promise<T>{
  const res=await fetch(url,{...init,credentials:'same-origin',cache:'no-store'});
  const data:unknown=await res.json();
  if(!res.ok)throw Error((data as {error?:string}).error??'Ошибка '+res.status);
  return data as T;
}
function messageOf(e:unknown){return e instanceof Error?e.message:String(e);}
function touch(){dirty.value=true;error.value='';message.value='Есть изменения — сохраните черновик';}
function setState(next:CultureState){
  state.value=next;draft.value=structuredClone(next.draft);dirty.value=false;
  if(!groupId.value||!next.draft.collectives.find(x=>x.id===groupId.value))groupId.value=next.draft.collectives[0]?.id??'';
  if(!leaderId.value||!next.draft.leaders.find(x=>x.id===leaderId.value))leaderId.value=next.draft.leaders[0]?.id??'';
}
async function load(){
  if(dirty.value&&!window.confirm('Несохранённые правки будут потеряны. Загрузить снова?'))return;
  busy.value=true;error.value='';
  try{
    const r=await api<{state:CultureState}>('/api/editor/culture');setState(r.state);
    message.value='Подготовлено коллективов: '+r.state.draft.collectives.length+' · руководителей: '+r.state.draft.leaders.length;
  }catch(e){error.value=messageOf(e);}finally{busy.value=false;}
}
async function save():Promise<boolean>{
  if(!dirty.value)return true;
  if(!draft.value||!state.value||busy.value||!canEdit.value)return false;
  busy.value=true;error.value='';message.value='Сохраняем черновик…';
  const serialized=JSON.stringify(draft.value);
  try{
    const result=await api<{state:CultureState}>('/api/editor/culture',{
      method:'PATCH',headers,body:JSON.stringify({content:JSON.parse(serialized),expectedRevision:state.value.revision}),
    });
    state.value=result.state;
    if(JSON.stringify(draft.value)===serialized){dirty.value=false;message.value='Черновик сохранён. Для посетителей нужна публикация.';}
    else{message.value='Пока шло сохранение, появились новые правки. Сохраните ещё раз.';}
    return !dirty.value;
  }catch(e){error.value=messageOf(e);message.value='Правки остались на экране';return false;}
  finally{busy.value=false;}
}
async function publish(){
  if(props.role!=='admin'||!state.value||!await save())return;
  busy.value=true;error.value='';message.value='Публикация…';
  try{
    const result=await api<{state:CultureState}>('/api/editor/culture/publish',{
      method:'POST',headers,body:JSON.stringify({expectedRevision:state.value.revision}),
    });
    state.value=result.state;message.value='Опубликовано. Посетительские экраны обновятся автоматически.';
  }catch(e){error.value=messageOf(e);}finally{busy.value=false;}
}
async function selectPanel(panel:typeof selectedPanel.value){
  if(dirty.value&&!await save())return;
  selectedPanel.value=panel;
}
function chooseGroup(id:string){groupId.value=id;}
function chooseLeader(id:string){leaderId.value=id;}
function newId(prefix:string){return prefix+'-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*100000).toString(36);}
function newGroup(){
  if(!draft.value||!canEdit.value)return;
  const entry:CultureCollective={id:newId('collective'),name:'Новый коллектив',category:draft.value.categories[0]?.id??'dance',
    leaderIds:[],room:'',schedule:'',age:'',programs:[],description:'',history:'',photo:'',videoUrl:'',
    source:'Добавлено сотрудником ДК',sourcePage:0};
  draft.value.collectives.push(entry);groupId.value=entry.id;touch();
}
function newLeader(){
  if(!draft.value||!canEdit.value)return;
  const entry:CultureLeader={id:newId('leader'),name:'Новый руководитель',photo:'',bio:'',source:'Добавлено сотрудником ДК'};
  draft.value.leaders.push(entry);leaderId.value=entry.id;touch();
}
function removeGroup(){
  if(!draft.value||!group.value||!window.confirm('Удалить коллектив из каталога?'))return;
  draft.value.collectives=draft.value.collectives.filter(x=>x.id!==groupId.value);
  groupId.value=draft.value.collectives[0]?.id??'';touch();
}
function removeLeader(){
  if(!draft.value||!leader.value||draft.value.collectives.some(c=>c.leaderIds.includes(leaderId.value))){
    error.value='Сначала уберите руководителя из связанных коллективов';return;
  }
  if(!window.confirm('Удалить руководителя?'))return;
  draft.value.leaders=draft.value.leaders.filter(x=>x.id!==leaderId.value);
  leaderId.value=draft.value.leaders[0]?.id??'';touch();
}
function programsToLines(value:CultureCollective){return value.programs.join('\n');}
function updatePrograms(value:string){if(!group.value)return;group.value.programs=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,30);touch();}
function fileBase64(file:File):Promise<string>{return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');
  reader.onerror=()=>reject(Error('Ошибка чтения изображения'));reader.readAsDataURL(file);
});}
async function uploadPhoto(event:Event,target:'club'|'leader'|'about'){
  const input=event.target as HTMLInputElement,file=input.files?.[0];
  if(!file||!draft.value||busy.value)return;
  if(file.size>3*1024*1024){error.value='Фото больше 3 МБ';input.value='';return;}
  busy.value=true;error.value='';message.value='Загружаем фотографию…';
  try{
    const {url}=await api<{url:string}>('/api/editor/culture/photo',{method:'POST',headers,
      body:JSON.stringify({fileName:file.name,base64:await fileBase64(file)})});
    if(target==='club'&&group.value)group.value.photo=url;
    if(target==='leader'&&leader.value)leader.value.photo=url;
    if(target==='about')draft.value.about.photo=url;
    touch();message.value='Фото загружено. Нажмите «Сохранить» и «Опубликовать».';
  }catch(e){error.value=messageOf(e);}finally{busy.value=false;input.value='';}
}
async function flush():Promise<boolean>{return dirty.value?save():!busy.value;}
defineExpose({flush});
onMounted(()=>{void load();});
</script>
<template>
  <section class="culture-editor">
    <div class="culture-editor-head">
      <div><span class="eyebrow">НАПОЛНЕНИЕ ВСЕЙ НАВИКУЛЬТУРЫ</span>
        <h2>Материалы ДК</h2>
        <p>Редактируйте коллективы, руководителей, страницы и медиа. Впервые загружены проверяемые стартовые сведения из расписания.</p></div>
      <div class="culture-editor-actions">
        <button type="button" class="secondary-button" :disabled="busy" @click="load">Обновить</button>
        <button v-if="canEdit" type="button" class="secondary-button" :disabled="busy||!dirty" @click="save">Сохранить черновик</button>
        <button v-if="role==='admin'" type="button" class="primary-button" :disabled="busy" @click="publish">Опубликовать на экране</button>
      </div>
    </div>
    <p role="status" class="status-line">{{message}}</p><p v-if="error" class="editor-error" role="alert">{{error}}</p>
    <nav class="culture-editor-tabs" aria-label="Состав материалов">
      <button v-for="tab in panels" :key="tab.id" type="button" :class="{active:selectedPanel===tab.id}"
        @click="selectPanel(tab.id)">{{tab.name}}</button>
    </nav>
    <div v-if="draft" class="culture-edit-body">
      <section v-if="selectedPanel==='clubs'" class="culture-editor-columns">
        <aside class="culture-editor-list">
          <div class="culture-list-head"><strong>Коллективы ({{draft.collectives.length}})</strong>
            <button v-if="canEdit" type="button" @click="newGroup">+</button></div>
          <button v-for="item in draft.collectives" :key="item.id" type="button"
            :class="{active:groupId===item.id}" @click="chooseGroup(item.id)">{{item.name}}</button>
        </aside>
        <div v-if="group" class="culture-editor-fields">
          <div class="culture-edit-photo">
            <div v-if="group.photo"><img :src="group.photo" :alt="group.name"/></div>
            <div v-else class="culture-image-upload-placeholder">ФОТО КОЛЛЕКТИВА</div>
            <label v-if="canEdit">Загрузить фото JPEG/PNG/WebP<input type="file" accept=".jpg,.jpeg,.png,.webp"
              :disabled="busy" @change="uploadPhoto($event,'club')"/></label>
          </div>
          <label>Название<input v-model="group.name" maxlength="170" :disabled="!canEdit" @input="touch"/></label>
          <label>Категория<select v-model="group.category" :disabled="!canEdit" @change="touch">
            <option v-for="c in draft.categories" :key="c.id" :value="c.id">{{c.title}}</option>
          </select></label>
          <label>Описание<textarea v-model="group.description" rows="3" maxlength="3000" :disabled="!canEdit" @input="touch"/></label>
          <label>История коллектива<textarea v-model="group.history" rows="6" maxlength="6000" :disabled="!canEdit" @input="touch"
            placeholder="Добавьте проверенную историю и достижения"/></label>
          <label>Расписание<input v-model="group.schedule" maxlength="400" :disabled="!canEdit" @input="touch"/></label>
          <label>Кабинет / зал<input v-model="group.room" maxlength="150" :disabled="!canEdit" @input="touch"/></label>
          <label>Возраст<input v-model="group.age" maxlength="120" :disabled="!canEdit" @input="touch"/></label>
          <label>Ссылка на видео (VK / Rutube / YouTube)<input v-model="group.videoUrl" maxlength="600" :disabled="!canEdit" @input="touch"/></label>
          <label>Группы и направления, по одному на строку<textarea :value="programsToLines(group)" rows="5"
            :disabled="!canEdit" @input="updatePrograms(($event.target as HTMLTextAreaElement).value)"/></label>
          <fieldset class="culture-edit-leaders"><legend>Руководители</legend>
            <label v-for="person in draft.leaders" :key="person.id"><input type="checkbox" :value="person.id"
              v-model="group.leaderIds" :disabled="!canEdit" @change="touch"/>{{person.name}}</label>
          </fieldset>
          <p class="culture-edit-source">Источник: {{group.source}} · Страница {{group.sourcePage}}</p>
          <button v-if="canEdit" class="secondary-button" type="button" @click="removeGroup">Удалить коллектив</button>
        </div>
      </section>
      <section v-else-if="selectedPanel==='leaders'" class="culture-editor-columns">
        <aside class="culture-editor-list">
          <div class="culture-list-head"><strong>Руководители ({{draft.leaders.length}})</strong>
            <button v-if="canEdit" type="button" @click="newLeader">+</button></div>
          <button v-for="person in draft.leaders" :key="person.id" type="button"
            :class="{active:leaderId===person.id}" @click="chooseLeader(person.id)">{{person.name}}</button>
        </aside>
        <div v-if="leader" class="culture-editor-fields">
          <div class="culture-edit-photo">
            <div v-if="leader.photo"><img :src="leader.photo" :alt="leader.name"/></div>
            <div v-else class="culture-image-upload-placeholder">ПОРТРЕТ РУКОВОДИТЕЛЯ</div>
            <label v-if="canEdit">Загрузить портрет<input type="file" accept=".jpg,.jpeg,.png,.webp"
              :disabled="busy" @change="uploadPhoto($event,'leader')"/></label>
          </div>
          <label>ФИО<input v-model="leader.name" maxlength="130" :disabled="!canEdit" @input="touch"/></label>
          <label>Биография и достижения<textarea v-model="leader.bio" rows="8" maxlength="3000" :disabled="!canEdit"
            @input="touch" placeholder="Факты из подтверждённой биографии"/></label>
          <p>В карточке посетителя портрет этого руководителя появится во всех связанных коллективах.</p>
          <p class="culture-edit-source">Источник: {{leader.source}}</p>
          <button v-if="canEdit" type="button" class="secondary-button" @click="removeLeader">Удалить руководителя</button>
        </div>
      </section>
      <section v-else-if="selectedPanel==='about'" class="culture-editor-fields culture-editor-prose">
        <h3>О ДК</h3>
        <label>Заголовок<input v-model="draft.about.title" :disabled="!canEdit" @input="touch"/></label>
        <label>Вступление<textarea v-model="draft.about.intro" rows="4" :disabled="!canEdit" @input="touch"/></label>
        <div class="culture-edit-photo">
          <div v-if="draft.about.photo"><img :src="draft.about.photo" alt="Фото здания"/></div>
          <label v-if="canEdit">Изменить фото здания<input type="file" accept=".jpg,.jpeg,.png,.webp"
            :disabled="busy" @change="uploadPhoto($event,'about')"/></label>
        </div>
        <label>Ссылка на видео<input v-model="draft.about.videoUrl" :disabled="!canEdit" @input="touch"/></label>
        <label>Автор фото<input v-model="draft.about.photoCredit" :disabled="!canEdit" @input="touch"/></label>
        <h3>Факты</h3><label v-for="(_,index) in draft.about.facts" :key="index">
          Факт {{index+1}}<textarea v-model="draft.about.facts[index]" rows="2" :disabled="!canEdit" @input="touch"/></label>
        <h3>История</h3><label v-for="(_,index) in draft.about.history" :key="index">
          Абзац {{index+1}}<textarea v-model="draft.about.history[index]" rows="4" :disabled="!canEdit" @input="touch"/></label>
      </section>
      <section v-else-if="selectedPanel==='safety'" class="culture-editor-fields culture-editor-prose">
        <h3>Страница «Безопасность»</h3>
        <label>Главный заголовок<input v-model="draft.safety.title" :disabled="!canEdit" @input="touch"/></label>
        <label>Вступление<textarea v-model="draft.safety.intro" rows="4" :disabled="!canEdit" @input="touch"/></label>
        <article v-for="section in draft.safety.sections" :key="section.id" class="culture-safety-edit-card">
          <label>Название памятки<input v-model="section.title" :disabled="!canEdit" @input="touch"/></label>
          <label>Подзаголовок<input v-model="section.subtitle" :disabled="!canEdit" @input="touch"/></label>
          <label v-for="(_,index) in section.paragraphs" :key="index">Пункт {{index+1}}
            <textarea v-model="section.paragraphs[index]" rows="3" :disabled="!canEdit" @input="touch"/></label>
        </article>
        <label>Важное уведомление<textarea v-model="draft.safety.notice" rows="4" :disabled="!canEdit" @input="touch"/></label>
      </section>
      <section v-else-if="selectedPanel==='tickets'" class="culture-editor-fields culture-editor-prose">
        <h3>Билеты</h3>
        <label>Заголовок<input v-model="draft.tickets.title" :disabled="!canEdit" @input="touch"/></label>
        <label>Описание<textarea v-model="draft.tickets.intro" rows="5" :disabled="!canEdit" @input="touch"/></label>
        <label>Ссылка на продажу билетов<input v-model="draft.tickets.url" :disabled="!canEdit" @input="touch"/></label>
        <label>Уведомление для покупателя<textarea v-model="draft.tickets.note" rows="3" :disabled="!canEdit" @input="touch"/></label>
      </section>
      <section v-else class="culture-editor-fields culture-editor-prose">
        <h3>Контактная информация</h3>
        <label v-for="(label,key) in {address:'Адрес',phone:'Основной телефон',clubsPhone:'Кружки',
          eventsPhone:'Мероприятия',email:'Электронная почта',hours:'Режим работы',website:'Сайт'}" :key="key">
          {{label}}<input v-model="draft.contact[key as keyof CultureContent['contact']]" :disabled="!canEdit" @input="touch"/></label>
      </section>
    </div>
  </section>
</template>