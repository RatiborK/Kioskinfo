// apps/api/src/culture-schedule.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defaultCultureState} from './culture.js';
import {enrichCollectivesWithSchedule} from './culture-schedule.js';
import {defaultScheduleFields} from './schedule.js';
test('merge published schedule into existing public group only when the group has generic description',()=>{
 const base=defaultCultureState().published;
 const first=base.collectives[0];
 const rows=[{...defaultScheduleFields(first.name,first.name),id:'test',
  description:'Репертуар студии включает современную хореографию и выступления',
  time:'Пн, ср 18:30',room:'Каб. 39',age:'4–18 лет'}];
 const merged=enrichCollectivesWithSchedule(base,rows);
 assert.match(merged.collectives[0].description,/Репертуар студии/);
 assert.equal(merged.collectives[0].schedule,'Пн, ср 18:30');
 assert.equal(base.collectives[0].description,first.description);
 const curated=structuredClone(base);curated.collectives[0].description='Текст, проверенный директором';
 curated.collectives[0].room='Кабинет 101';
 const safe=enrichCollectivesWithSchedule(curated,rows);
 assert.equal(safe.collectives[0].description,'Текст, проверенный директором');
 assert.equal(safe.collectives[0].room,'Кабинет 101');
});
