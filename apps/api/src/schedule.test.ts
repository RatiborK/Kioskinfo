// apps/api/src/schedule.test.ts — browser-based schedule persistence, publication and fail-safe tests.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileScheduleRepository} from './schedule-file.js';
import {defaultScheduleFields, publishedCatalog, validateScheduleFields} from './schedule.js';

test('create, autosave revision conflict, publish and restart persist correctly',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-web-schedule-'));const path=join(dir,'records.json');
  try{
    const repo=new FileScheduleRepository(path);
    assert.equal((await repo.list()).entries.length,0);
    const first=await repo.create({...defaultScheduleFields('Танцы','Вдохновение'),position:10,theme:'blue'});
    assert.equal(first.revision,1);
    assert.equal((await repo.list()).entries.length,0); // never leak drafts
    const saved=await repo.save(first.id,1,{...first,time:'Пн, Ср 16:00'});
    assert.equal(saved?.revision,2);
    assert.equal(await repo.save(first.id,1,{...first,time:'Invalid stale write'}),null);
    const published=await repo.publish(first.id,2);
    assert.equal(published?.published_revision,2);
    assert.equal((await repo.list()).entries[0].time,'Пн, Ср 16:00');
    const second=await repo.create({...defaultScheduleFields('Вокал','Гармония'),theme:'neutral',position:20,inheritTheme:true});
    await repo.publish(second.id,1);
    let visible=await repo.list();
    assert.deepEqual(visible.entries.map(x=>x.theme),['blue','blue']);
    // A draft change does not alter public content before publish.
    const changed=await repo.save(first.id,2,{...saved!,theme:'orange'});
    visible=await repo.list();assert.equal(visible.entries[0].theme,'blue');
    await repo.publish(first.id,changed!.revision);
    visible=await repo.list();assert.deepEqual(visible.entries.map(x=>x.theme),['orange','orange']);
    const restarted=new FileScheduleRepository(path);
    assert.equal((await restarted.list()).entries.length,2);
    assert.equal(await restarted.archive(second.id,1),true);
    assert.equal((await restarted.list()).entries.length,1);
    assert.equal((await restarted.listDrafts()).length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('invalid/corrupted local file never overwrites accepted public data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-web-schedule-'));const path=join(dir,'records.json');
  try{const repo=new FileScheduleRepository(path);
    const record=await repo.create(defaultScheduleFields('Театр','Премьера'));
    await repo.publish(record.id,1);const before=await repo.list();
    await writeFile(path,'{bad JSON');
    const after=await repo.list();assert.equal(after.stale,true);assert.equal(after.entries.length,1);
    await assert.rejects(()=>repo.create(defaultScheduleFields('X','Y')));
    assert.equal(await readFile(path,'utf8'),'{bad JSON');
    assert.equal(after.version,before.version);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('validation rejects invalid themes, empty names, oversized data and order',()=>{
  assert.throws(()=>validateScheduleFields({...defaultScheduleFields('','Коллектив')}),/Заполните/);
  assert.throws(()=>validateScheduleFields({...defaultScheduleFields('Кнопка','Коллектив'),theme:'purple'}),/оформление/);
  assert.throws(()=>validateScheduleFields({...defaultScheduleFields('Кнопка','Коллектив'),position:-1}),/Порядок/);
  assert.throws(()=>validateScheduleFields({...defaultScheduleFields('Кнопка','Коллектив'),description:'A'.repeat(2600)}),/Описание/);
});
test('publishedCatalog publishes only snapshots and resolves first button theme',()=>{
  const fields=defaultScheduleFields('Вокал','Гармония');
  const row={...fields,id:'x1',revision:2,published:{...fields,theme:'blue' as const},published_revision:1,
    created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',published_at:'2026-01-01T00:00:00Z'};
  const catalog=publishedCatalog([row]);
  assert.equal(catalog.entries[0].theme,'blue');
  assert.equal(catalog.entries[0].label,'Вокал');
});
