// apps/api/src/events.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileEventsRepository,validateEvent,publicEvents,type EventFields} from './events.js';
const concert:EventFields={title:'Осенний концерт',date:'2026-11-20',time:'18:00',
  type:'concert',venue:'hall',description:'Вход по билетам'};
const play:EventFields={title:'Сказка',date:'2026-11-20',time:'16:00',
  type:'play',venue:'orfey',description:''};
test('events have strictly typed category/venue combinations and real dates',()=>{
  assert.deepEqual(validateEvent(concert),concert);
  assert.throws(()=>validateEvent({...concert,date:'2026-02-30'}),/дата/);
  assert.throws(()=>validateEvent({...concert,date:'2026-13-01'}),/дата/);
  assert.throws(()=>validateEvent({...concert,time:'25:99'}),/время/);
  assert.throws(()=>validateEvent({...concert,type:'music'}),/тип/);
  assert.throws(()=>validateEvent({...concert,venue:'somewhere'}),/место/);
  assert.throws(()=>validateEvent({...concert,title:''}),/Название/);
});
test('events save, publish, update and restart without leaking drafts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-events-')),path=join(dir,'events.json');
  try{
    const store=new FileEventsRepository(path);
    const a=await store.create(concert);
    const b=await store.create(play);
    assert.equal((await store.list()).length,0);
    assert.equal((await store.publish(a.id,1))?.published?.title,concert.title);
    assert.equal((await store.publish(b.id,1))?.published?.title,play.title);
    assert.deepEqual((await store.list()).map(x=>x.title),['Сказка','Осенний концерт']);
    const saved=await store.save(a.id,1,{...concert,title:'Обновлённый концерт'});
    assert.equal(saved?.revision,2);
    assert.equal((await store.list()).find(x=>x.id===a.id)?.title,concert.title);
    assert.equal(await store.save(a.id,1,concert),null);
    assert.equal(await store.publish(a.id,1),null);
    const restarted=new FileEventsRepository(path);
    assert.equal((await restarted.list()).find(x=>x.id===a.id)?.title,concert.title);
    await restarted.publish(a.id,2);
    assert.equal((await restarted.list()).find(x=>x.id===a.id)?.title,'Обновлённый концерт');
    assert.equal(await restarted.remove(b.id,1),true);
    assert.equal((await restarted.list()).length,1);
    assert.equal(publicEvents(await restarted.drafts()).length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('corrupt file does not overwrite last valid events',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-corrupt-events-')),path=join(dir,'events.json');
  try{const repo=new FileEventsRepository(path);const a=await repo.create(concert);await repo.publish(a.id,1);
    await writeFile(path,'{broken json');
    assert.equal((await repo.list()).length,1);
    await assert.rejects(()=>repo.create(play));
    assert.equal(await readFile(path,'utf8'),'{broken json');
  }finally{await rm(dir,{recursive:true,force:true});}
});
