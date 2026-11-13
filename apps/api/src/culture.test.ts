// apps/api/src/culture.test.ts — source-backed content and preview publication gates.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CultureMedia,CultureVideos,FileCultureRepository,defaultCultureState,validateCulture,enrichLegacySafety,restoreMissingStarterContent} from './culture.js';

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
  assert.equal(next.safety.sections.length,19);
  assert.equal(next.safety.sections.find(x=>x.id==='objects')?.paragraphs[0],'Пожалуйста, предупредите персонал');
  assert.equal(next.safety.sections.find(x=>x.id==='health')?.paragraphs[0],'Помогите ближнему');
  assert.ok(next.safety.sections.some(section=>section.id==='bullying'));
  assert.ok(next.safety.sections.some(section=>section.id==='corruption'));
  assert.equal(next.safety.sections.find(x=>x.id==='fire')?.paragraphs[0],'Авторизованный текст');
  assert.equal(next.safety.intro,'Согласовано с администрацией ДК');
  assert.equal(next.safety.notice,'Утверждено ответственным лицом');
  assert.match(next.tickets.url,/muzaticket\.ru\/iframe/);
  assert.equal(previous.safety.sections.length,6);
  assert.doesNotThrow(()=>validateCulture(next));
});

test('navigation keeps original supplied floor sources and rejects invented map ids or positions',()=>{
 const catalog=defaultCultureState().draft;
 assert.equal(catalog.navigation.floors.length,3);
 assert.equal(catalog.navigation.floors[0].title,'Первый этаж');
 assert.equal(catalog.navigation.floors[0].points.length,0);
 const edited=structuredClone(catalog);
 edited.navigation.floors[0].points.push({
   id:'test-hall',title:'Тестовый зал',kind:'hall',x:54.3,y:61.2,description:'Подтверждается сотрудником'
 });
 const checked=validateCulture(edited);
 assert.equal(checked.navigation.floors[0].points[0].x,54.3);
 assert.throws(()=>validateCulture({...edited,navigation:{...edited.navigation,
   floors:edited.navigation.floors.map((f,i)=>i===0?{...f,points:[{...f.points[0],x:-1}]}:f)}}),/Координаты/);
 assert.throws(()=>validateCulture({...edited,navigation:{...edited.navigation,
   floors:edited.navigation.floors.map((f,i)=>i===0?{...f,id:'unknown-plan'}:f)}}),/схема/);
 assert.throws(()=>validateCulture({...edited,navigation:{...edited.navigation,
   floors:edited.navigation.floors.map((f,i)=>i===0?{...f,points:[f.points[0],f.points[0]]}:f)}}),/Повторяются/);
});
test('pre-navigation revisions are upgraded without destroying employee content',()=>{
 const old=structuredClone(defaultCultureState().draft) as unknown as Record<string,unknown>;
 delete old.navigation;
 const result=validateCulture(old);
 assert.equal(result.navigation.floors.length,3);
 assert.equal(result.collectives.length,defaultCultureState().draft.collectives.length);
});

test('persisted catalog creates a recovery snapshot and never silently resets on restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-retain-')),path=join(dir,'catalog.json');
  try{
    const repo=new FileCultureRepository(path);
    const initial=await repo.get();
    const draft=structuredClone(initial.draft);
    draft.collectives[0].history='Локальная история, которую нельзя потерять';
    draft.leaders[0].bio='Биография сотрудника';
    await repo.update(draft,1);
    await repo.publish(2);
    const previous=JSON.parse(await readFile(path+'.previous','utf8')) as {draft:{collectives:{history:string}[]}};
    assert.equal(previous.draft.collectives[0].history,'Локальная история, которую нельзя потерять');
    const restarted=new FileCultureRepository(path);
    assert.equal((await restarted.get()).published.leaders[0].bio,'Биография сотрудника');
    await writeFile(path,'{invalid json');
    const fresh=new FileCultureRepository(path);
    await assert.rejects(()=>fresh.get()); // Do not pretend employee data was replaced with seed.
    assert.equal((await readFile(path+'.previous','utf8')).includes('Биография сотрудника'),true);
    assert.equal(await readFile(path,'utf8'),'{invalid json'); // no destructive auto-repair
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('custom safety sections remain intact across additive migration',()=>{
  const old=structuredClone(defaultCultureState().draft);
  old.safety.sections=[
   {id:'objects',title:'Исходная инструкция ДК',subtitle:'Текст сотрудника',icon:'shield',paragraphs:['Не менять пункт']},
   {id:'staff-training',title:'Охрана труда',subtitle:'Памятка',icon:'shield',paragraphs:['Авторский контент']}
  ];
  const repaired=enrichLegacySafety(old);
  assert.equal(repaired.safety.sections[0].title,'Исходная инструкция ДК');
  assert.equal(repaired.safety.sections[1].paragraphs[0],'Авторский контент');
  assert.ok(repaired.safety.sections.length>=17);
  assert.ok(repaired.safety.sections.some(x=>x.id==='extremism'));
  assert.doesNotThrow(()=>validateCulture(repaired));
});

test('restore missing starter content only, never replace employee-authored content or published snapshots',()=>{
  const original=defaultCultureState();
  const catalog=structuredClone(original.draft);
  catalog.collectives[1].description='Полностью согласованное описание коллектива';
  catalog.leaders[1].bio='Биография после редактирования';
  catalog.safety.sections[1].paragraphs[0]='Утверждённая памятка';
  catalog.collectives.shift();
  catalog.leaders.shift();
  catalog.categories.shift();
  catalog.safety.sections.shift();
  const {content,added}=restoreMissingStarterContent(catalog);
  assert.deepEqual(added,{categories:1,leaders:1,collectives:1,safety:1});
  assert.equal(content.collectives.length,original.draft.collectives.length);
  assert.equal(content.leaders.length,original.draft.leaders.length);
  assert.equal(content.categories.length,original.draft.categories.length);
  assert.equal(content.collectives.find(x=>x.id===original.draft.collectives[1].id)?.description,
    'Полностью согласованное описание коллектива');
  assert.equal(content.leaders.find(x=>x.id===original.draft.leaders[1].id)?.bio,
    'Биография после редактирования');
  assert.equal(content.safety.sections.find(x=>x.id===original.draft.safety.sections[1].id)?.paragraphs[0],
    'Утверждённая памятка');
  const again=restoreMissingStarterContent(content);
  assert.deepEqual(again.added,{categories:0,leaders:0,collectives:0,safety:0});
  assert.deepEqual(again.content,content);
  assert.equal(original.published.collectives[0].history,original.draft.collectives[0].history);
});

test('local video media are signature checked and published through UUID URL only',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-video-'));
  try{
    const media=new CultureVideos(dir);
    const bytes=Buffer.concat([Buffer.from([0,0,0,16]),Buffer.from('ftypisom'),Buffer.alloc(40)]);
    const url=await media.upload('tour.mp4',bytes);
    assert.match(url,/^\/api\/public\/culture\/video\/[a-f0-9-]{36}\.mp4$/);
    const name=url.split('/').pop()!;
    const info=await media.info(name);
    assert.equal(info?.mime,'video/mp4');
    assert.equal(info?.size,bytes.length);
    assert.equal(await media.info('../secret.mp4'),null);
    await assert.rejects(()=>media.upload('fake.webm',bytes),/видеоформату/);
    const catalog=structuredClone(defaultCultureState().draft);
    catalog.about.videoUrl=url;
    assert.equal(validateCulture(catalog).about.videoUrl,url);
    catalog.about.videoUrl='javascript:alert(1)';
    assert.throws(()=>validateCulture(catalog));
  }finally{await rm(dir,{recursive:true,force:true});}
});
