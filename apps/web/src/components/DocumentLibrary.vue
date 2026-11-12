<!-- apps/web/src/components/DocumentLibrary.vue — visitor reading room for DK official documents. -->
<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {DocumentCategory as Category,PublicDocument as Document} from '../utils/content-types.js';
const props=defineProps<{documents:Document[];initialId?:string}>();
const categories:{id:Category;title:string;caption:string;icon:string}[]=[
  {id:'prices',title:'Прейскурант',caption:'Стоимость услуг и занятий',icon:'₽'},
  {id:'policies',title:'Положения',caption:'Правила и официальные документы',icon:'§'},
  {id:'benefits',title:'Льготы',caption:'Доступные меры поддержки',icon:'◎'},
  {id:'other',title:'Другие документы',caption:'Дополнительная информация',icon:'▤'},
];
const category=ref<Category|null>(null),selectedId=ref(props.initialId??''),html=ref(''),busy=ref(false),error=ref('');
const selected=computed(()=>props.documents.find(d=>d.id===selectedId.value)??null);
const filtered=computed(()=>props.documents.filter(d=>!category.value||d.category===category.value));
const selectedCategory=computed(()=>categories.find(c=>c.id===category.value));
const grouped=computed(()=>categories.map(c=>({...c,count:props.documents.filter(d=>d.category===c.id).length})));
async function openDocument(id:string){
  selectedId.value=id;html.value='';error.value='';const doc=props.documents.find(d=>d.id===id);
  if(!doc||doc.format!=='docx')return;
  busy.value=true;
  try{const response=await fetch('/api/public/documents/'+encodeURIComponent(id)+'/content',{cache:'no-store'});
    if(!response.ok)throw Error('Не удалось открыть документ');
    const result:{html:string}=await response.json();html.value=result.html;
  }catch(e){error.value=e instanceof Error?e.message:String(e);}finally{busy.value=false;}
}
function back(){selectedId.value='';html.value='';error.value='';}
watch(()=>props.initialId,id=>{if(id&&props.documents.some(d=>d.id===id))void openDocument(id);},{immediate:true});
watch(()=>props.documents,docs=>{
  if(!selectedId.value)return;
  if(docs.some(d=>d.id===selectedId.value)){if(selected.value?.format==='docx'&&!html.value&&!busy.value)void openDocument(selectedId.value);}
  else if(docs.length)back();
});
</script>
<template>
  <section class="documents-visitor" aria-label="Документы Дворца культуры">
    <div v-if="selected" class="document-reading-room">
      <button type="button" class="schedule-back" @click="back">← Все документы</button>
      <div class="document-reading-header"><span class="eyebrow">ОФИЦИАЛЬНЫЙ ДОКУМЕНТ · {{selected.format.toUpperCase()}}</span>
        <h2>{{selected.title}}</h2><span class="document-reading-rule"></span></div>
      <div v-if="busy" class="document-loading" role="status">Открываем документ…</div>
      <p v-if="error" class="poster-warning" role="alert">{{error}}</p>
      <article v-if="selected.format==='docx'&&!busy&&!error" class="document-paper" v-html="html"></article>
      <div v-if="selected.format==='pdf'" class="document-pdf-frame">
        <object :data="'/api/public/documents/'+selected.id+'/file#toolbar=1'" type="application/pdf"
          :aria-label="'Документ: '+selected.title" width="100%" height="100%">
          <p>Просмотр PDF недоступен в этом браузере.</p>
        </object>
      </div>
      <a class="document-download" :href="'/api/public/documents/'+selected.id+'/file'" target="_blank" rel="noopener">
        Открыть оригинальный файл ({{selected.format.toUpperCase()}})
      </a>
    </div>
    <template v-else>
      <p class="documents-intro">Стоимость услуг, нормативные документы и информация о льготах — в одном месте.</p>
      <div class="documents-categories">
        <button v-for="cat in grouped" :key="cat.id" type="button" class="documents-category"
          :class="{active:category===cat.id}" @click="category=category===cat.id?null:cat.id">
          <span class="documents-category-icon">{{cat.icon}}</span>
          <strong>{{cat.title}}</strong><small>{{cat.caption}}</small>
          <span class="documents-category-count">{{cat.count}} {{cat.count===1?'документ':'док.'}}</span>
        </button>
      </div>
      <div class="documents-list-heading"><h2>{{selectedCategory?.title??'Все документы'}}</h2>
        <button v-if="category" type="button" class="schedule-back" @click="category=null">Показать все</button></div>
      <div v-if="filtered.length" class="documents-list">
        <button v-for="document in filtered" :key="document.id" class="document-list-item" type="button" @click="openDocument(document.id)">
          <span class="document-type-sign">{{document.format.toUpperCase()}}</span>
          <span class="document-list-caption"><strong>{{document.title}}</strong>
            <small>{{new Date(document.createdAt).toLocaleDateString('ru-RU')}} · {{(document.sizeBytes/1024/1024).toFixed(1)}} МБ</small></span>
          <span class="document-list-chevron" aria-hidden="true">↗</span>
        </button>
      </div>
      <div v-else class="document-empty">В выбранной категории документы пока не добавлены.</div>
    </template>
  </section>
</template>