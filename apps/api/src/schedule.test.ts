// apps/api/src/schedule.test.ts — browser-based schedule persistence, publication and fail-safe tests.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileScheduleRepository} from './schedule-file.js';
import {defaultAppearance, defaultScheduleFields, publishedCatalog, validateScheduleFields} from './schedule.js';

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

test('appearance presets are validated, copied on publish and inherited only from published snapshots',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-design-'));const path=join(dir,'records.json');
  try {
    const repo=new FileScheduleRepository(path);
    const own=await repo.create({...defaultScheduleFields('Музыка','Оркестр'),position:10,theme:'blue',
      appearance:{fill:'solid',radius:'soft',titleSize:'large',align:'center'}});
    const inherited=await repo.create({...defaultScheduleFields('Танцы','Ритм'),position:20,inheritTheme:true,theme:'neutral',
      appearance:{fill:'outline',radius:'square',titleSize:'normal',align:'left'}});
    await repo.publish(own.id,1);await repo.publish(inherited.id,1);
    let publicItems=(await repo.list()).entries;
    assert.deepEqual(publicItems.map(x=>x.appearance),[{
      fill:'solid',radius:'soft',titleSize:'large',align:'center'
    },{
      fill:'solid',radius:'soft',titleSize:'large',align:'center'
    }]);
    assert.deepEqual(publicItems.map(x=>x.theme),['blue','blue']);
    const saved=await repo.save(own.id,1,{...own,theme:'orange',
      appearance:{fill:'outline',radius:'pill',titleSize:'huge',align:'left'}});
    assert.ok(saved);
    publicItems=(await repo.list()).entries;
    assert.equal(publicItems[1].theme,'blue');
    assert.equal(publicItems[1].appearance.radius,'soft');
    await repo.publish(own.id,saved!.revision);
    publicItems=(await repo.list()).entries;
    assert.deepEqual(publicItems.map(x=>x.appearance.radius),['pill','pill']);
    assert.deepEqual(publicItems.map(x=>x.theme),['orange','orange']);
    const restarted=new FileScheduleRepository(path);
    assert.equal((await restarted.list()).entries[1].appearance.titleSize,'huge');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('invalid appearance and unknown appearance keys are refused',()=>{
  const example=defaultScheduleFields('Кино','Студия');
  assert.throws(()=>validateScheduleFields({...example,appearance:{...defaultAppearance(),fill:'<script>'}}),/оформление/);
  assert.throws(()=>validateScheduleFields({...example,appearance:{...defaultAppearance(),userCSS:'background:url(x)'}}),/оформление/);
  assert.throws(()=>validateScheduleFields({...example,appearance:null}),/внешнего вида/);
});
test('legacy JSON without button appearance continues to load with safe defaults',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-legacy-design-'));const path=join(dir,'records.json');
  try{
    const repo=new FileScheduleRepository(path);
    const row=await repo.create(defaultScheduleFields('Театр','Премьера'));
    await repo.publish(row.id,1);
    const raw=JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>[];
    delete raw[0].appearance;
    const published=raw[0].published as Record<string,unknown>;
    delete published.appearance;
    await writeFile(path,JSON.stringify(raw));
    const recovered=new FileScheduleRepository(path);
    assert.deepEqual((await recovered.list()).entries[0].appearance,defaultAppearance());
    assert.deepEqual((await recovered.listDrafts())[0].appearance,defaultAppearance());
  }finally{await rm(dir,{recursive:true,force:true});}
});
