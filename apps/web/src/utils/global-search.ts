import {visibleFloorPlans} from './active-floor-plans.ts';
// apps/web/src/utils/global-search.ts
// Full-kiosk local search: only previously published data, never unapproved drafts.
import {normalizeSearch,queryVariants} from './kiosk-search.ts';
import type {CultureContent} from './culture-types.js';
import type {PublicEvent,PublicDocument} from './content-types.js';
export type SearchTarget='groups'|'calendar'|'documents'|'safety'|'about'|'contacts'|'posters'|'tickets'|'navigation';
export type KioskSearchResult={id:string;section:SearchTarget;kind:string;title:string;subtitle:string;date?:string;posterName?:string;floorId?:string;pointId?:string};
export type SearchPoster={name:string;title:string};
export type SearchData={culture:CultureContent|null;events:readonly PublicEvent[];documents:readonly PublicDocument[];posters:readonly SearchPoster[]};
const categoryLabel:Record<string,string>={prices:'Прейскуранты',policies:'Положения',benefits:'Льготы',other:'Документы'};
export function searchKiosk(data:SearchData,query:string,max=70):KioskSearchResult[]{
  const variants=queryVariants(query);if(!variants.length)return [];
  const rows:Array<{item:KioskSearchResult;haystack:string}>=[];
  const push=(item:KioskSearchResult,haystack:string)=>rows.push({item,haystack:normalizeSearch(haystack)});
  const c=data.culture;
  if(c){
    for(const floor of visibleFloorPlans(c.navigation)){
      push({id:floor.id,section:'navigation',kind:'Навигация',title:floor.title,
        subtitle:floor.note,floorId:floor.id},
        [floor.title,floor.note,c.navigation.title,'навигация этаж план карта'].join(' '));
      for(const point of floor.points){
        push({id:point.id,section:'navigation',kind:floor.title,title:point.title,
          subtitle:point.description,floorId:floor.id,pointId:point.id},
          [floor.title,point.title,point.description,'кабинет зал помещение этаж'].join(' '));
      }
    }
    for(const group of c.collectives){
      const leaders=group.leaderIds.map(id=>c.leaders.find(p=>p.id===id)?.name??'').join(' ');
      const cat=c.categories.find(x=>x.id===group.category)?.title??'Коллективы';
      push({id:group.id,section:'groups',kind:cat,title:group.name,subtitle:[leaders,group.room,group.schedule].filter(Boolean).join(' · ')},
        [group.name,cat,group.description,group.history,group.schedule,group.room,group.age,leaders,group.programs.join(' ')].join(' '));
    }
    for(const section of c.safety.sections){
      push({id:section.id,section:'safety',kind:'Безопасность',title:section.title,subtitle:section.subtitle},
        [section.title,section.subtitle,...section.paragraphs,'безопасность'].join(' '));
    }
    push({id:'about',section:'about',kind:'О ДК',title:c.about.title,subtitle:'История и видеопрогулка'},
      [c.about.title,c.about.intro,...c.about.history,...c.about.facts,'дворец культуры история видео'].join(' '));
    push({id:'contacts',section:'contacts',kind:'Контакты',title:'Контакты ДК',subtitle:c.contact.address},
      Object.values(c.contact).join(' ')+' контакты адрес телефон время работы');
    push({id:'tickets',section:'tickets',kind:'Билеты',title:'Купить билет',subtitle:'Встроенный сервис Muzaticket'},
      'билет билеты купить заказ концерт спектакль muzaticket муза');
  }
  for(const event of data.events){
    const types={concert:'концерт',play:'спектакль',festival:'фестиваль',other:'другое'};
    const where={hall:'концертный зал',foyer:'танц фойе',orfey:'театр орфей'};
    push({id:event.id,section:'calendar',kind:'Календарь мероприятий',title:event.title,
      subtitle:[event.date,event.time,where[event.venue]].filter(Boolean).join(' · '),date:event.date},
      [event.title,event.description,event.date,event.time,types[event.type],where[event.venue]].join(' '));
  }
  for(const doc of data.documents){
    push({id:doc.id,section:'documents',kind:categoryLabel[doc.category]??'Документы',
      title:doc.title,subtitle:'Документ ДК · '+doc.format.toUpperCase()},
      [doc.title,categoryLabel[doc.category],doc.format,'документы дк'].join(' '));
  }
  for(const poster of data.posters){
    push({id:poster.name,section:'posters',kind:'Афиша',title:poster.title,subtitle:'Афиша мероприятия',posterName:poster.name},
      poster.title+' афиша события мероприятие');
  }
  return rows.filter(({haystack})=>variants.some(v=>v.split(' ').filter(Boolean).every(term=>haystack.includes(term))))
    .slice(0,max).map(({item})=>item);
}
