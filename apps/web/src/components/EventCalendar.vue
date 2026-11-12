<!-- apps/web/src/components/EventCalendar.vue — visitor-facing monthly events. -->
<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {EventType,EventVenue,PublicEvent} from '../utils/content-types.js';
const props=defineProps<{events:PublicEvent[]}>();
const today=new Date();
const month=ref(new Date(today.getFullYear(),today.getMonth(),1));
const chosen=ref(new Date(today.getFullYear(),today.getMonth(),today.getDate()).toLocaleDateString('sv-SE'));
const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const types:Record<EventType,string>={concert:'Концерт',play:'Спектакль',festival:'Фестиваль',other:'Другое'};
const venues:Record<EventVenue,string>={hall:'Концертный зал',foyer:'Танц-фойе',orfey:'Театр «Орфей», 3-й этаж'};
const shapes:Record<EventVenue,string>={hall:'★',foyer:'●',orfey:'■'};
const monthLabel=computed(()=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(month.value));
const grouped=computed(()=>{
  const map=new Map<string,PublicEvent[]>();
  for(const event of props.events){const group=map.get(event.date)??[];group.push(event);map.set(event.date,group);}
  for(const value of map.values())value.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title,'ru'));
  return map;
});
function key(date:Date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return y+'-'+m+'-'+d;}
const days=computed(()=>{
  const first=new Date(month.value.getFullYear(),month.value.getMonth(),1);
  const offset=(first.getDay()+6)%7;
  const total=new Date(month.value.getFullYear(),month.value.getMonth()+1,0).getDate();
  const count=Math.ceil((offset+total)/7)*7;
  return Array.from({length:count},(_,index)=>{
    const date=new Date(first.getFullYear(),first.getMonth(),index-offset+1);
    const id=key(date);
    return {id,number:date.getDate(),inside:date.getMonth()===first.getMonth(),today:id===key(today),events:grouped.value.get(id)??[]};
  });
});
const selectedEvents=computed(()=>grouped.value.get(chosen.value)??[]);
const selectedLabel=computed(()=>new Date(chosen.value+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}));
function move(delta:number){const next=new Date(month.value.getFullYear(),month.value.getMonth()+delta,1);month.value=next;chosen.value=key(next);}
function select(id:string){chosen.value=id;const date=new Date(id+'T12:00:00');if(date.getMonth()!==month.value.getMonth()||date.getFullYear()!==month.value.getFullYear())month.value=new Date(date.getFullYear(),date.getMonth(),1);}
function jumpToday(){month.value=new Date(today.getFullYear(),today.getMonth(),1);chosen.value=key(today);}
watch(()=>props.events,()=>{},{deep:false});
</script>
<template>
  <section class="cultural-calendar" aria-label="Календарь мероприятий">
    <div class="calendar-legend">
      <span><i class="event-dot type-concert"></i> Концерт</span>
      <span><i class="event-dot type-play"></i> Спектакль</span>
      <span><i class="event-dot type-festival"></i> Фестиваль</span>
      <span><i class="event-dot type-other"></i> Другое</span>
    </div>
    <div class="calendar-legend calendar-venue-legend">
      <span><b>★</b> Концертный зал</span><span><b>●</b> Танц-фойе</span>
      <span><b>■</b> «Орфей» (3-й этаж)</span>
    </div>
    <div class="calendar-toolbar">
      <h2>{{monthLabel}}</h2>
      <div><button type="button" aria-label="Предыдущий месяц" @click="move(-1)">‹</button>
        <button type="button" @click="jumpToday">Сегодня</button>
        <button type="button" aria-label="Следующий месяц" @click="move(1)">›</button></div>
    </div>
    <div class="calendar-grid" role="grid" aria-label="Мероприятия по дням">
      <div v-for="wd in weekdays" :key="wd" class="calendar-weekday" role="columnheader">{{wd}}</div>
      <button v-for="day in days" :key="day.id" class="calendar-day" type="button"
        :class="{outside:!day.inside,today:day.today,chosen:day.id===chosen}" :aria-pressed="day.id===chosen"
        :aria-label="day.id+' — '+(day.events.length?day.events.length+' мероприятий':'нет мероприятий')" @click="select(day.id)">
        <span class="calendar-number">{{day.number}}</span>
        <span v-for="event in day.events.slice(0,3)" :key="event.id" class="calendar-event"
          :class="'type-'+event.type">
          <b :aria-label="venues[event.venue]">{{shapes[event.venue]}}</b>
          <span>{{event.title}}</span>
        </span>
        <span v-if="day.events.length>3" class="calendar-more">Ещё {{day.events.length-3}}</span>
      </button>
    </div>
    <section class="calendar-day-details">
      <h3>Мероприятия — {{selectedLabel}}</h3>
      <div v-if="!selectedEvents.length" class="calendar-no-events">На выбранный день мероприятий пока нет.</div>
      <div v-else class="calendar-detail-list">
        <article v-for="event in selectedEvents" :key="event.id" class="calendar-detail" :class="'type-'+event.type">
          <div class="calendar-detail-type"><b>{{shapes[event.venue]}}</b> {{types[event.type]}} · {{venues[event.venue]}}</div>
          <h4>{{event.title}}</h4>
          <p v-if="event.time">Начало: <strong>{{event.time}}</strong></p>
          <p v-if="event.description">{{event.description}}</p>
        </article>
      </div>
    </section>
  </section>
</template>