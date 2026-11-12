// apps/api/src/seed-preview-schedule.ts
// One-time, non-destructive local preview: turn verified schedule summary into real kiosk cards.
// This is NOT used in PostgreSQL production and never rewrites existing cards.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {starterCollectives,starterLeaders} from './culture-seed.js';
import {defaultScheduleFields} from './schedule.js';
import type {ScheduleRepository} from './schedule.js';
const markerPath=()=>fileURLToPath(new URL('../../../content/culture/schedule_seed_05_4.done',import.meta.url));
export async function seedPreviewSchedule(schedule:ScheduleRepository,marker=markerPath()):Promise<number>{
  try{await readFile(marker,'utf8');return 0;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const existing=await schedule.listDrafts();
  const known=new Set(existing.map(x=>x.group.toLocaleLowerCase('ru-RU')));
  let added=0;
  for(const [position,entry] of starterCollectives.entries()){
    if(known.has(entry.name.toLocaleLowerCase('ru-RU')))continue;
    const people=entry.leaderIds.map(id=>starterLeaders.find(x=>x.id===id)?.name).filter(Boolean).join(', ');
    const fields={...defaultScheduleFields(entry.name,entry.name),leader:people,time:entry.schedule,
      room:entry.room,age:entry.age,description:entry.description,
      position:1000+position,inheritTheme:false};
    const created=await schedule.create(fields);
    const published=await schedule.publish(created.id,created.revision);
    if(!published)throw Error('Ошибка публикации исходной карточки '+entry.name);
    known.add(entry.name.toLocaleLowerCase('ru-RU'));
    added++;
  }
  await mkdir(dirname(marker),{recursive:true});
  await writeFile(marker,'Демонстрационное наполнение 05.4: '+new Date().toISOString()+
    '\nДобавлено новых карточек: '+added+'\n',{flag:'wx',mode:0o600});
  return added;
}
