// apps/api/src/culture-availability.ts
// The legacy schedule is optional and must never prevent existing cultural content from loading.
// A failed schedule load cannot erase published groups, staff text or editor drafts.
import type {CultureContent} from './culture.js';
import type {ScheduleRepository} from './schedule.js';
import {enrichCollectivesWithSchedule} from './culture-schedule.js';

export async function cultureWithOptionalSchedule(
  content:CultureContent,
  schedule:Pick<ScheduleRepository,'list'>|undefined,
  report:(error:unknown)=>void=()=>{},
):Promise<CultureContent>{
  if(!schedule)return content;
  try{
    const rows=await schedule.list();
    return enrichCollectivesWithSchedule(content,rows.entries);
  }catch(error){
    report(error);
    return content;
  }
}
