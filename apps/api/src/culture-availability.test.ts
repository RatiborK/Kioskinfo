// apps/api/src/culture-availability.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defaultCultureState} from './culture.js';
import {cultureWithOptionalSchedule} from './culture-availability.js';

test('old schedule failure cannot hide published collective content',async()=>{
  const original=defaultCultureState().published;
  original.collectives[0].history='Утверждённая история коллектива';
  let errors=0;
  const result=await cultureWithOptionalSchedule(original,{
    list:async()=>{throw new Error('Старый файл расписания недоступен');},
  },()=>{errors++;});
  assert.equal(errors,1);
  assert.equal(result.collectives.length,original.collectives.length);
  assert.equal(result.collectives[0].history,'Утверждённая история коллектива');
  assert.equal(result.leaders.length,original.leaders.length);
  assert.equal(result.safety.sections.length,original.safety.sections.length);
});
test('when no schedule is configured, the catalog remains available as-is',async()=>{
  const original=defaultCultureState().draft;
  const result=await cultureWithOptionalSchedule(original,undefined);
  assert.strictEqual(result,original);
  assert.ok(result.collectives.length>=35);
  assert.ok(result.leaders.length>=28);
});
