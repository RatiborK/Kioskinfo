<!-- apps/web/src/components/DocumentEditor.vue — authenticated upload for official DK documents. -->
<script setup lang="ts">
import {onMounted,ref} from 'vue';
type Role='admin'|'editor'|'viewer';
type Category='prices'|'policies'|'benefits'|'other';
type Doc={id:string;title:string;category:Category;format:'pdf'|'docx';sizeBytes:number;createdAt:string};
defineProps<{role:Role}>();
const categories:Record<Category,string>={prices:'Прейскурант цен',policies:'Положения',benefits:'Льготы',other:'Другие документы'};
const docs=ref<Doc[]>([]),title=ref(''),category=ref<Category>('prices'),file=ref<File|null>(null);
const status=ref('Загрузка…'),error=ref(''),busy=ref(false);
const headers={'content-type':'application/json','x-navikultura-action':'1'};
async function api<T>(url:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(url,{...init,credentials:'same-origin',cache:'no-store'});
  const result:unknown=await r.json();if(!r.ok)throw Error((result as {error?:string}).error||'Ошибка '+r.status);
  return result as T;
}
function err(e:unknown){return e instanceof Error?e.message:String(e);}
function choose(event:Event){file.value=(event.target as HTMLInputElement).files?.[0]??null;}
function base64(input:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');
    reader.onerror=()=>reject(Error('Не удалось прочитать документ'));
    reader.readAsDataURL(input);
  });
}
async function load(){busy.value=true;error.value='';
  try{docs.value=(await api<{documents:Doc[]}>('/api/public/documents')).documents;
    status.value='Документов опубликовано: '+docs.value.length;
  }catch(e){error.value=err(e);}finally{busy.value=false;}}
async function upload(){
  if(busy.value||!file.value)return;
  if(!title.value.trim()){error.value='Введите название документа';return;}
  if(file.value.size>6*1024*1024){error.value='Размер файла не должен превышать 6 МБ';return;}
  busy.value=true;error.value='';status.value='Обработка документа…';
  try{const result=await api<{document:Doc}>('/api/editor/documents',{
    method:'POST',headers,body:JSON.stringify({title:title.value,category:category.value,
      name:file.value.name,base64:await base64(file.value)})});
    docs.value.push(result.document);title.value='';file.value=null;
    status.value='Документ добавлен и доступен посетителям';
  }catch(e){error.value=err(e);status.value='Загрузка не завершена';}
  finally{busy.value=false;}
}
async function remove(doc:Doc){
  if(busy.value||!window.confirm('Удалить «'+doc.title+'» из каталога документов?'))return;
  busy.value=true;error.value='';
  try{await api('/api/editor/documents/'+doc.id,{method:'DELETE',headers,body:'{}'});
    docs.value=docs.value.filter(item=>item.id!==doc.id);status.value='Документ удалён';
  }catch(e){error.value=err(e);}finally{busy.value=false;}
}
onMounted(()=>{void load();});
</script>
<template>
  <section class="editor-panel document-editor">
    <div class="poster-editor-top"><div><span class="eyebrow">ОФИЦИАЛЬНЫЕ МАТЕРИАЛЫ</span><h2>Документы ДК</h2></div>
      <button type="button" class="secondary-button" :disabled="busy" @click="load">Обновить</button>
    </div>
    <p class="editor-hint">Загружайте только проверенные актуальные документы учреждения. DOCX показывается на экране как оформленная веб-страница с заголовками и таблицами; PDF открывается встроенным просмотрщиком. Старый .doc нужно предварительно сохранить в формате .docx.</p>
    <form v-if="role!=='viewer'" class="documents-upload" @submit.prevent="upload">
      <label>Название для посетителей<input v-model="title" type="text" maxlength="150" required
        placeholder="Например, Прейскурант платных услуг"/></label>
      <label>Категория<select v-model="category">
        <option v-for="(label,key) in categories" :key="key" :value="key">{{label}}</option></select></label>
      <label>Файл DOCX или PDF до 6 МБ<input type="file" accept=".docx,.pdf" required @change="choose"/></label>
      <button class="primary-button" type="submit" :disabled="busy||!file">Добавить документ</button>
    </form>
    <h3>Опубликованные документы ({{docs.length}})</h3>
    <div class="document-editor-grid">
      <article v-for="doc in docs" :key="doc.id" class="document-editor-card">
        <span class="document-editor-format">{{doc.format.toUpperCase()}}</span>
        <div><strong>{{doc.title}}</strong><p>{{categories[doc.category]}} · {{(doc.sizeBytes/1024/1024).toFixed(2)}} МБ</p></div>
        <a :href="'/screen?section=documents&document='+encodeURIComponent(doc.id)" target="_blank" rel="noopener">Посмотреть</a>
        <button v-if="role==='admin'" class="secondary-button" type="button" :disabled="busy" @click="remove(doc)">Удалить</button>
      </article>
    </div>
    <p class="status-line" role="status">{{status}}</p><p v-if="error" class="editor-error" role="alert">{{error}}</p>
  </section>
</template>