// apps/web/src/utils/active-floor-plans.ts
// Show only confirmed levels. The legacy floor-2 image is retained in storage
// to prevent any loss of previously authored markers or historical source files.
import type {CultureFloor,CultureNavigation} from './culture-types.js';

export const ACTIVE_FLOOR_PLAN_IDS=['floor-1','floor-3'] as const;
const ACTIVE=new Set<string>(ACTIVE_FLOOR_PLAN_IDS);

export function isVisibleFloorPlan(id:string):boolean{return ACTIVE.has(id);}

export function visibleFloorPlans(navigation:CultureNavigation):CultureFloor[]{
  const floors=navigation.floors.filter(floor=>isVisibleFloorPlan(floor.id));
  return floors.map(floor=>{
    if(floor.id==='floor-1')return {...floor,title:'Первый этаж'};
    if(floor.id==='floor-3')return {
      ...floor,
      title:'Второй этаж',
      // Replace only the obsolete default note. Never overwrite employee-written notes.
      note:floor.note==='Дополнительные условные обозначения; этаж уточняется'
        ?'Обозначения кабинетов и помещений добавим позже.'
        :floor.note,
    };
    return floor;
  });
}
