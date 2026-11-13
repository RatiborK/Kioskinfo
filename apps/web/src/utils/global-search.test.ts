// apps/web/src/utils/global-search.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {searchKiosk} from './global-search.ts';
import type {CultureContent} from './culture-types.js';
const sample:CultureContent={
 navigation:{title:'План ДК',intro:'',notice:'',floors:[
  {id:'floor-1',title:'Первый этаж',note:'Основной уровень',points:[
  {id:'dance-studio',title:'Кабинет 39',kind:'studio',x:36,y:44,description:'Танцевальная студия'}
 ]},
  {id:'floor-2',title:'Верхний уровень',note:'',points:[]},
  {id:'floor-3',title:'Знаки',note:'',points:[]},
 ]},
 about:{title:'Дворец культуры Кировский',intro:'История учреждения',facts:[],history:[],videoUrl:'',photo:'',photoCredit:'',sourceUrl:''},
 safety:{title:'Безопасность',intro:'',notice:'',sections:[
  {id:'bullying',title:'Профилактика буллинга',subtitle:'Безопасная среда',icon:'family',paragraphs:['Просите помощи у взрослых']}
 ]},
 tickets:{title:'Билеты',intro:'',url:'',note:''},
 contact:{address:'ул. Кутузова, 91',phone:'+7 391 235 98 25',clubsPhone:'',eventsPhone:'',email:'',hours:'',website:''},
 categories:[{id:'dance',title:'Танец',symbol:'✦',description:''}],
 leaders:[{id:'leader',name:'Иванова Марина',bio:'',photo:'',source:''}],
 collectives:[{id:'rainbow',name:'Кружок «Радуга»',category:'dance',leaderIds:['leader'],schedule:'вторник',
   room:'кабинет 39',age:'6+',programs:['танец'],description:'Занятия для детей',history:'',photo:'',videoUrl:'',source:'',sourcePage:1}]
};
const data={culture:sample,events:[{id:'event1',title:'Концерт',date:'2026-12-03',time:'18:00',type:'concert' as const,
 venue:'hall' as const,description:'Новогодняя встреча',ticketUrl:''}],
 documents:[{id:'doc1',title:'Прейскурант',category:'prices' as const,format:'pdf' as const,sizeBytes:1024,createdAt:'2026-01-01'}],
 posters:[{name:'poster.jpg',title:'Новогодняя афиша'}]};
test('search indexes the entire kiosk without requiring a schedule page',()=>{
 assert.deepEqual(searchKiosk(data,'Марина').map(x=>x.id),['rainbow']);
 assert.deepEqual(searchKiosk(data,'кабинет 39').map(x=>x.id),['rainbow']);
 assert.deepEqual(searchKiosk(data,'буллинг').map(x=>x.id),['bullying']);
 assert.deepEqual(searchKiosk(data,'прейскурант').map(x=>x.id),['doc1']);
 assert.deepEqual(searchKiosk(data,'новогодняя').map(x=>x.id),['event1','poster.jpg']);
 assert.ok(searchKiosk(data,'билеты').some(x=>x.section==='tickets'));
 assert.equal(searchKiosk(data,'').length,0);
});
test('query matching is case and ё/е insensitive with multiple words',()=>{
 assert.deepEqual(searchKiosk(data,'ДВОРЕЦ КУЛЬТУРЫ').map(x=>x.section),['about']);
 assert.deepEqual(searchKiosk(data,'кружок РАДУГА').map(x=>x.id),['rainbow']);
 assert.deepEqual(searchKiosk(data,'неизвестно'),[]);
 assert.deepEqual(searchKiosk(data,'первый этаж').map(x=>x.id),['floor-1']);
 assert.ok(searchKiosk(data,'танцевальная студия').some(x=>x.id==='dance-studio'&&x.floorId==='floor-1'));

});
