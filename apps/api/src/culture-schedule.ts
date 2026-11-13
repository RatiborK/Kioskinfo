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
    // The previous editor stored schedules separately. Publish a richer narrative
    // using only verified fields, not guesses. Keep custom collective copy untouched.
    const custom=item.description.trim();
    if(generated(group.description)&&!group.description.includes('\nЗанятия:')){
      const introduction=(custom&&!generated(custom)?custom:group.description).trim();
      const notes=[
        group.programs.length?'Группы: '+group.programs.join(', '):'',
        group.age?'Возраст: '+group.age:'',
        group.schedule?'Занятия: '+group.schedule:'',
        group.room?'Помещение: '+group.room:'',
      ].filter(Boolean);
      group.description=[introduction,...notes].join('\n').slice(0,3000);
    }
  }
  return result;
}
