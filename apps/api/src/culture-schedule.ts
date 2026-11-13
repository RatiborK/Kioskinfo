// apps/api/src/culture-schedule.ts
// Read-only bridge: enrich collective profiles with existing, published schedule notes.
// Never expose draft schedules and never overwrite staff-authored descriptions.
import type {CultureContent} from './culture.js';
import type {ScheduleEntry} from './schedule.js';
import {starterContent} from './culture-seed.js';
const key=(v:string)=>v.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[«»"'.,]+/g,'').replace(/\s+/g,' ');
const generated=(text:string)=>text.startsWith('Занятия по направлению')||!text.trim();
export function enrichCollectivesWithSchedule(content:CultureContent,entries:readonly ScheduleEntry[]):CultureContent{
  const result=structuredClone(content);
  const known=new Map(entries.map(entry=>[key(entry.group),entry]));
  for(const group of result.collectives){
    const item=known.get(key(group.name));if(!item)continue;
    const starter=starterContent.collectives.find(g=>g.id===group.id);
    if(item.time&&(!group.schedule||group.schedule===starter?.schedule))group.schedule=item.time;
    if(item.room&&(!group.room||group.room===starter?.room))group.room=item.room;
    if(item.age&&(!group.age||group.age===starter?.age))group.age=item.age;
    const custom=item.description.trim();
    if(custom&&!generated(custom)&&generated(group.description)){
      const outline=custom.slice(0,2800);
      group.description=outline;
    }
  }
  return result;
}
