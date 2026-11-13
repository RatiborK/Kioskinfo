// apps/api/src/culture.test.ts — source-backed content and preview publication gates.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CultureMedia,FileCultureRepository,defaultCultureState,validateCulture,enrichLegacySafety} from './culture.js';

test('initial DK catalog is substantial, categorized and source-backed',()=>{
  const original=defaultCultureState().published;
  assert.ok(original.collectives.length>=35);
  assert.ok(original.leaders.length>=28);
  assert.ok(original.categories.length>=8);
  assert.equal(new Set(original.collectives.map(c=>c.id)).size,original.collectives.length);
  assert.equal(new Set(original.leaders.map(l=>l.id)).size,original.leaders.length);
  assert.ok(original.collectives.every(c=>c.source.startsWith('Расписание занятий') && c.sourcePage>=1));
  assert.ok(original.leaders.every(l=>l.photo===''));
  assert.equal(original.tickets.url,'https://muzaticket.ru/iframe/organizations/organization-mau-gdk-kirovskii-448753');
  assert.ok(original.safety.sections.length>=6);
});
test('editing catalog does not change visitor content before publication',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-culture-')),path=join(dir,'catalog.json');
  try{
    const repo=new FileCultureRepository(path);
    const old=await repo.get();assert.equal(old.revision,1);
    const draft=structuredClone(old.draft);
    draft.collectives[0].history='Подтверждённая история после проверки';
    draft.leaders[0].bio='Подтверждённая биография';
    const saved=await repo.update(draft,1);
    assert.equal(saved?.revision,2);
    assert.equal((await repo.get()).published.collectives[0].history,old.published.collectives[0].history);
    assert.equal(await repo.update(draft,1),null);
    assert.equal(await repo.publish(1),null);
    const published=await repo.publish(2);
    assert.equal(published?.published.collectives[0].history,'Подтверждённая история после проверки');
    const restarted=new FileCultureRepository(path);
    assert.equal((await restarted.get()).published.leaders[0].bio,'Подтверждённая биография');
    assert.equal((await restarted.get()).publishedRevision,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('reject unknown category, arbitrary HTML image or unsafe video links',()=>{
  const original=defaultCultureState().draft;
  let value=structuredClone(original);
  value.collectives[0].category='nonexistent';
  assert.throws(()=>validateCulture(value),/категория/);
  value=structuredClone(original);
  value.collectives[0].photo='javascript:alert(1)';
  assert.throws(()=>validateCulture(value),/HTTPS|фото|адрес/);
  value=structuredClone(original);
  value.collectives[0].videoUrl='https://example.org/payload';
  assert.throws(()=>validateCulture(value),/Видео/);
  value=structuredClone(original);
  value.leaders[0].bio='<script>not executed</script>';
  const safe=validateCulture(value);
  assert.equal(typeof safe.leaders[0].bio,'string'); // Escaped by Vue interpolation, not v-html.
});
test('broken on-disk JSON does not reset last published materials',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-culture-corrupt-')),path=join(dir,'catalog.json');
  try{
    const repo=new FileCultureRepository(path);
    const source=await repo.get();
    await repo.update(source.draft,1);await repo.publish(2);
    await writeFile(path,'{corrupt');
    assert.equal((await repo.get()).published.collectives.length,source.published.collectives.length);
    await assert.rejects(()=>repo.update(source.draft,2));
    assert.equal(await readFile(path,'utf8'),'{corrupt');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('photo library accepts signature-checked PNG and rejects scripts or fake JPG',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-photos-'));
  try{
    const media=new CultureMedia(dir);
    const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('sample-image-bytes')]);
    const url=await media.upload('photo.png',bytes.toString('base64'));
    assert.match(url,/^\/api\/public\/culture\/media\/[0-9a-f-]{36}\.png$/);
    const served=await media.file(url.split('/').pop()!);
    assert.equal(served?.mime,'image/png');
    served?.stream.destroy();
    await assert.rejects(()=>media.upload('malware.svg',Buffer.from('<svg></svg>').toString('base64')));
    await assert.rejects(()=>media.upload('fake.jpg',Buffer.from('not a jpg').toString('base64')));
    assert.equal(await media.file('../../etc/passwd'),null);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('Stage 05.4 safety upgrade preserves employee text while adding prevention topics',()=>{
  const previous=structuredClone(defaultCultureState().published);
  previous.safety.sections=[
    {id:'fire',title:'Правила пожарной безопасности ДК',subtitle:'Изменено сотрудником',icon:'fire',paragraphs:['Авторизованный текст']},
    {id:'evac',title:'Эвакуация',subtitle:'',icon:'exit',paragraphs:['Эвакуация']},
    {id:'objects',title:'Подозрительные предметы',subtitle:'',icon:'shield',paragraphs:['Пожалуйста, предупредите персонал']},
    {id:'children',title:'Дети',subtitle:'',icon:'family',paragraphs:['Дети']},
    {id:'health',title:'Самочувствие',subtitle:'',icon:'heart',paragraphs:['Помогите ближнему']},
    {id:'digital',title:'Данные',subtitle:'',icon:'lock',paragraphs:['Не сообщайте коды']},
  ];
  previous.safety.intro='Согласовано с администрацией ДК';
  previous.safety.notice='Утверждено ответственным лицом';
  previous.tickets.url='https://gorodsobitiy.ru/venues/dk-kirovsky';
  const next=enrichLegacySafety(previous);
  assert.equal(next.safety.sections.length,15);
  assert.ok(next.safety.sections.some(section=>section.id==='bullying'));
  assert.ok(next.safety.sections.some(section=>section.id==='corruption'));
  assert.equal(next.safety.sections.find(x=>x.id==='fire')?.paragraphs[0],'Авторизованный текст');
  assert.equal(next.safety.intro,'Согласовано с администрацией ДК');
  assert.equal(next.safety.notice,'Утверждено ответственным лицом');
  assert.match(next.tickets.url,/muzaticket\.ru\/iframe/);
  assert.equal(previous.safety.sections.length,6);
  assert.doesNotThrow(()=>validateCulture(next));
});
