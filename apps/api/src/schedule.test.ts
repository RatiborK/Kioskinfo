// apps/api/src/schedule.test.ts — Excel fixture, style inheritance, atomic failure behavior.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XlsxScheduleRepository, parseScheduleRows, type ExcelCell } from './schedule.js';

const columns = ['ID','Кнопка','Коллектив','Руководитель','Расписание','Кабинет','Описание','Возраст','Шаблон','Повторить стиль'];
const row1 = ['dance01','Танцы','Вдохновение','Иванова','Пн, 16:00','201','О танцах','7+','синий','Нет'];
test('each Excel row creates a unique button, optional fields and style inheritance work', () => {
  const rows: ExcelCell[][] = [columns,row1,['voice01','Вокал','Гармония','','Вт, 18:00','112','','','','Да']];
  const result = parseScheduleRows(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(x=>[x.id,x.theme]),[['dance01','blue'],['voice01','blue']]);
  assert.equal(result[1].leader,'');
  assert.equal(result[1].time,'Вт, 18:00');
});
test('reject duplicate IDs, wrong template and missing headers', () => {
  assert.throws(()=>parseScheduleRows([columns,row1,row1]),/повторяется ID/);
  assert.throws(()=>parseScheduleRows([columns,[...row1.slice(0,8),'purple','Нет']]),/неизвестный шаблон/);
  assert.throws(()=>parseScheduleRows([['ID','Кнопка'],['x1','Танцы']]),/Не найден столбец/);
});
test('real .xlsx is parsed and a damaged replacement does not destroy last accepted schedule', async () => {
  const dir=await mkdtemp(join(tmpdir(),'navikultura-schedule-'));
  try {
    const target=join(dir,'raspisanie.xlsx');
    const fixture=fileURLToPath(new URL('../../../templates/Расписание_пример.xlsx',import.meta.url));
    await copyFile(fixture,target);
    const repo=new XlsxScheduleRepository(target);
    const first=await repo.list();
    assert.equal(first.entries.length,3);
    assert.equal(first.entries[2].theme,'blue');
    assert.equal(first.stale,false);
    assert.ok(first.version.length>8);
    await writeFile(target,'this is not an xlsx');
    const stale=await repo.list();
    assert.equal(stale.stale,true);
    assert.equal(stale.entries.length,3);
    assert.equal(stale.version,first.version);
    await copyFile(fixture,target);
    const recovered=await repo.list();
    assert.equal(recovered.stale,false);
    assert.equal(recovered.entries.length,3);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('absent source is empty at first but never erases previously loaded schedule', async () => {
  const dir=await mkdtemp(join(tmpdir(),'navikultura-schedule-'));
  try {
    const target=join(dir,'raspisanie.xlsx');
    const repo=new XlsxScheduleRepository(target);
    assert.equal((await repo.list()).entries.length,0);
    const fixture=fileURLToPath(new URL('../../../templates/Расписание_пример.xlsx',import.meta.url));
    await copyFile(fixture,target);
    assert.equal((await repo.list()).entries.length,3);
    await rm(target);
    const missing=await repo.list();
    assert.equal(missing.entries.length,3);
    assert.equal(missing.stale,true);
  } finally {await rm(dir,{recursive:true,force:true});}
});
