// apps/api/src/seed-preview-schedule.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FileScheduleRepository} from './schedule-file.js';
import {defaultScheduleFields} from './schedule.js';
import {starterCollectives} from './culture-seed.js';
import {seedPreviewSchedule} from './seed-preview-schedule.js';
test('one-time preview import fills schedule, preserves custom cards and does not duplicate on restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-seed-'));
  const path=join(dir,'records.json'),marker=join(dir,'seed.done');
  try{
    const repo=new FileScheduleRepository(path);
    const manual=await repo.create({...defaultScheduleFields('Мой кружок','Свой коллектив'),
      leader:'Сотрудник ДК',room:'Каб. 15'});
    await repo.publish(manual.id,manual.revision);
    const imported=await seedPreviewSchedule(repo,marker);
    assert.equal(imported,starterCollectives.length);
    const rows=await repo.listDrafts();
    assert.equal(rows.length,starterCollectives.length+1);
    assert.equal(rows[0].id,manual.id);
    assert.equal(rows[0].leader,'Сотрудник ДК');
    assert.ok(rows.every(r=>r.published!==null));
    assert.match(await readFile(marker,'utf8'),/Добавлено новых карточек/);
    const restarted=new FileScheduleRepository(path);
    assert.equal(await seedPreviewSchedule(restarted,marker),0);
    assert.equal((await restarted.listDrafts()).length,rows.length);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('initial import skips known official groups without altering staff edits',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-seed-known-'));
  try{
    const repo=new FileScheduleRepository(join(dir,'records.json'));
    const first=starterCollectives[0];
    const custom=await repo.create({...defaultScheduleFields('Моё название',first.name),
      time:'Официально исправлено сотрудником'});
    await repo.publish(custom.id,1);
    const count=await seedPreviewSchedule(repo,join(dir,'done'));
    assert.equal(count,starterCollectives.length-1);
    const record=(await repo.listDrafts()).find(x=>x.id===custom.id);
    assert.equal(record?.time,'Официально исправлено сотрудником');
  }finally{await rm(dir,{recursive:true,force:true});}
});
