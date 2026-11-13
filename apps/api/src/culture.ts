// apps/api/src/culture.ts — versioned site-wide cultural content and curated image library.
import {randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile,mkdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type pg from 'pg';
import {starterContent} from './culture-seed.js';

export type CultureCategory={id:string;title:string;symbol:string;description:string};
export type CultureLeader={id:string;name:string;photo:string;bio:string;source:string};
export type CultureCollective={
  id:string;name:string;category:string;leaderIds:string[];room:string;schedule:string;age:string;
  programs:string[];description:string;history:string;photo:string;videoUrl:string;source:string;sourcePage:number;
};
export type SafetySection={id:string;title:string;subtitle:string;icon:string;paragraphs:string[]};
export type FloorPoint={id:string;title:string;kind:'hall'|'studio'|'service'|'stairs'|'exit'|'other';x:number;y:number;description:string};
export type CultureFloor={id:string;title:string;note:string;points:FloorPoint[]};
export type CultureNavigation={title:string;intro:string;notice:string;floors:CultureFloor[]};
export type CultureContent={
  about:{title:string;intro:string;facts:string[];history:string[];videoUrl:string;photo:string;photoCredit:string;sourceUrl:string};
  safety:{title:string;intro:string;sections:SafetySection[];notice:string};
  tickets:{title:string;intro:string;url:string;note:string};
  contact:{address:string;phone:string;clubsPhone:string;eventsPhone:string;email:string;hours:string;website:string};
  categories:CultureCategory[];leaders:CultureLeader[];collectives:CultureCollective[];
  navigation:CultureNavigation;
};
export type CultureState={revision:number;publishedRevision:number;draft:CultureContent;published:CultureContent;updatedAt:string};
export interface CultureRepository{
  get():Promise<CultureState>;
  update(value:CultureContent,revision:number):Promise<CultureState|null>;
  publish(revision:number):Promise<CultureState|null>;
}
const MAX_BYTES=900000;
const MAX_PHOTO_BYTES=3*1024*1024;
const imageName=/^[0-9a-f-]{36}\.(png|jpg|webp)$/;
export const cultureFile=()=>fileURLToPath(new URL('../../../content/culture/catalog.json',import.meta.url));
export const cultureImagesDir=()=>fileURLToPath(new URL('../../../content/culture/images',import.meta.url));
const asObject=(v:unknown):Record<string,unknown>=>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Ожидался объект каталога');
  return v as Record<string,unknown>;
};
const string=(v:unknown,max=2500):string=>{
  if(typeof v!=='string'||v.length>max)throw Error('Слишком длинное или некорректное текстовое поле');
  return v.trim();
};
const strings=(v:unknown,max=40,length=1000):string[]=>{
  if(!Array.isArray(v)||v.length>max)throw Error('Некорректный список');
  return v.map(x=>string(x,length));
};
const id=(v:unknown):string=>{
  const value=string(v,90);
  if(!/^[a-z0-9][a-z0-9-]{1,89}$/.test(value))throw Error('Недопустимый идентификатор');
  return value;
};
const httpsUrl=(v:unknown):string=>{
  const value=string(v,600);
  if(!value)return '';
  let parsed:URL;
  try{parsed=new URL(value);}catch{throw Error('Неверный адрес внешней страницы');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Разрешены только HTTPS-ссылки');
  return value;
};
const photoUrl=(v:unknown):string=>{
  const value=string(v,650);
  if(!value)return '';
  if(/^\/api\/public\/culture\/media\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(value))return value;
  const parsed=httpsUrl(value);
  if(parsed&&new URL(parsed).hostname!=='cdn.culture.ru')throw Error('Внешнее фото разрешено только из Культура.РФ');
  return parsed;
};
const videoUrl=(v:unknown):string=>{
  const value=httpsUrl(v);
  if(!value)return '';
  const host=new URL(value).hostname.toLowerCase();
  if(!['vk.com','vkvideo.ru','rutube.ru','www.rutube.ru','youtube.com','www.youtube.com','youtu.be'].includes(host))
    throw Error('Видео должно ссылаться на VK, Rutube или YouTube');
  return value;
};
function unique(items:{id:string}[],what:string){
  if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('Повторяются идентификаторы: '+what);
}
export function validateCulture(value:unknown):CultureContent {
  const root=asObject(value);
  const a=asObject(root.about),s=asObject(root.safety),t=asObject(root.tickets),contact=asObject(root.contact);
  if(!Array.isArray(s.sections)||s.sections.length>25)throw Error('Слишком много разделов безопасности');
  const sections:SafetySection[]=s.sections.map(item=>{
    const v=asObject(item);
    return {id:id(v.id),title:string(v.title,120),subtitle:string(v.subtitle,180),
      icon:id(v.icon),paragraphs:strings(v.paragraphs,15,600)};
  });
  unique(sections,'разделы безопасности');
  if(!Array.isArray(root.categories)||root.categories.length>20)throw Error('Некорректные категории');
  const categories:CultureCategory[]=root.categories.map(x=>{
    const v=asObject(x);
    return {id:id(v.id),title:string(v.title,100),symbol:string(v.symbol,8),description:string(v.description,180)};
  });
  unique(categories,'категории');
  if(!Array.isArray(root.leaders)||root.leaders.length>120)throw Error('Некорректный список руководителей');
  const leaders:CultureLeader[]=root.leaders.map(x=>{
    const v=asObject(x);
    return {id:id(v.id),name:string(v.name,130),photo:photoUrl(v.photo),
      bio:string(v.bio,3000),source:string(v.source,230)};
  });
  unique(leaders,'руководители');
  if(!Array.isArray(root.collectives)||root.collectives.length>250)throw Error('Некорректный список коллективов');
  const categoryIds=new Set(categories.map(x=>x.id)),leaderIds=new Set(leaders.map(x=>x.id));
  const collectives:CultureCollective[]=root.collectives.map(x=>{
    const v=asObject(x);const category=id(v.category),linked=strings(v.leaderIds,8,90);
    if(!categoryIds.has(category)||linked.some(k=>!leaderIds.has(k)))throw Error('Неизвестная категория или руководитель');
    const page=Number(v.sourcePage);
    if(!Number.isSafeInteger(page)||page<0||page>999)throw Error('Некорректная страница источника');
    return {id:id(v.id),name:string(v.name,170),category,leaderIds:linked,room:string(v.room,150),
      schedule:string(v.schedule,400),age:string(v.age,120),programs:strings(v.programs,30,150),
      description:string(v.description,3000),history:string(v.history,6000),photo:photoUrl(v.photo),
      videoUrl:videoUrl(v.videoUrl),source:string(v.source,250),sourcePage:page};
  });
  unique(collectives,'коллективы');
  const n=asObject(root.navigation??starterContent.navigation);
  if(!Array.isArray(n.floors)||n.floors.length!==3)throw Error('Ожидались три схемы ДК');
  const floorIds=['floor-1','floor-2','floor-3'];
  const floors:CultureFloor[]=n.floors.map((item,index)=>{
    const f=asObject(item),floorId=id(f.id);
    if(floorId!==floorIds[index])throw Error('Неизвестная схема или порядок этажей');
    if(!Array.isArray(f.points)||f.points.length>80)throw Error('Слишком много отметок на плане');
    const points:FloorPoint[]=f.points.map(raw=>{
      const p=asObject(raw),kind=string(p.kind,20);
      if(!['hall','studio','service','stairs','exit','other'].includes(kind))throw Error('Неизвестный тип помещения');
      const x=Number(p.x),y=Number(p.y);
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)
        throw Error('Координаты должны быть от 0 до 100');
      return {id:id(p.id),title:string(p.title,110),kind:kind as FloorPoint['kind'],x,y,
        description:string(p.description,1000)};
    });
    unique(points,'отметки на этаже');
    return {id:floorId,title:string(f.title,100),note:string(f.note,260),points};
  });
  const data:CultureContent={
    about:{title:string(a.title,140),intro:string(a.intro,2500),facts:strings(a.facts,15,400),
      history:strings(a.history,20,2000),videoUrl:videoUrl(a.videoUrl),photo:photoUrl(a.photo),
      photoCredit:string(a.photoCredit,150),sourceUrl:httpsUrl(a.sourceUrl)},
    safety:{title:string(s.title,160),intro:string(s.intro,2000),sections,notice:string(s.notice,1500)},
    tickets:{title:string(t.title,140),intro:string(t.intro,1500),
      url:httpsUrl(t.url),note:string(t.note,1000)},
    contact:{address:string(contact.address,180),phone:string(contact.phone,60),
      clubsPhone:string(contact.clubsPhone,60),eventsPhone:string(contact.eventsPhone,60),
      email:string(contact.email,100),hours:string(contact.hours,120),website:httpsUrl(contact.website)},
    categories,leaders,collectives,
    navigation:{title:string(n.title,150),intro:string(n.intro,1300),
      notice:string(n.notice,900),floors},
  };
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>MAX_BYTES)throw Error('Превышен размер каталога');
  return data;
}
// Upgrade only the legacy Stage 05.4 template in memory. Keep original JSON intact
// until an editor explicitly saves/publishes; all custom authored fields survive.
export function enrichLegacySafety(content:CultureContent):CultureContent{
  const copy=structuredClone(content);
  // Preserve every authored paragraph, title, custom section and its original order.
  // New educational topics are appended; never silently replace the editor's records.
  const known=new Set(copy.safety.sections.map(x=>x.id));
  for(const suggested of starterContent.safety.sections){
    if(!known.has(suggested.id)&&copy.safety.sections.length<25){
      copy.safety.sections.push(structuredClone(suggested));
      known.add(suggested.id);
    }
  }
  const legacy=known.has('objects')||known.has('health');
  if(legacy){
    if(copy.safety.title==='Безопасность начинается с внимания')
      copy.safety.title=starterContent.safety.title;
    if(copy.safety.intro==='Собрали памятки, которые помогут чувствовать себя уверенно в ДК. Информация ознакомительная; приоритет всегда у объявлений и указаний сотрудников учреждения.')
      copy.safety.intro=starterContent.safety.intro;
    if(copy.safety.notice==='Это общие рекомендации для посетителей, а не утверждённая инструкция по эвакуации. Схемы выходов и локальные инструкции учреждения требуют отдельного согласования.')
      copy.safety.notice=starterContent.safety.notice;
  }
  // The partner has changed but all staff-authored fields outside the legacy
  // default URL remain untouched.
  if(copy.tickets.url==='https://gorodsobitiy.ru/venues/dk-kirovsky'){
    copy.tickets=structuredClone(starterContent.tickets);
  }
  return copy;
}
function upgraded(state:CultureState):CultureState{
  return {...state,draft:enrichLegacySafety(state.draft),published:enrichLegacySafety(state.published)};
}
export const defaultCultureState=():CultureState=>({
  revision:1,publishedRevision:1,draft:structuredClone(starterContent),
  published:structuredClone(starterContent),updatedAt:new Date(0).toISOString(),
});
/** Restores only missing source-backed DK catalog items. Existing employee records,
 * metadata, photos, paragraphs, IDs and published content are never overwritten. */
export function restoreMissingStarterContent(current:CultureContent):{
 content:CultureContent;
 added:{categories:number;leaders:number;collectives:number;safety:number}
}{
 const next=structuredClone(current);
 const insert=<T extends {id:string}>(target:T[],source:readonly T[],limit:number)=>{
   const known=new Set(target.map(x=>x.id));let count=0;
   for(const item of source){
     if(!known.has(item.id)&&target.length<limit){
       target.push(structuredClone(item));known.add(item.id);count++;
     }
   }
   return count;
 };
 const categories=insert(next.categories,starterContent.categories,20);
 const leaders=insert(next.leaders,starterContent.leaders,120);
 const collectives=insert(next.collectives,starterContent.collectives,250);
 const safety=insert(next.safety.sections,starterContent.safety.sections,25);
 return {content:validateCulture(next),added:{categories,leaders,collectives,safety}};
}
function normalizeState(value:unknown):CultureState{
  const r=asObject(value),revision=Number(r.revision),pr=Number(r.publishedRevision);
  if(!Number.isSafeInteger(revision)||revision<1||!Number.isSafeInteger(pr)||pr<1||pr>revision)
    throw Error('Повреждены ревизии каталога');
  return {revision,publishedRevision:pr,draft:validateCulture(r.draft),
    published:validateCulture(r.published),updatedAt:string(r.updatedAt,100)};
}
export class FileCultureRepository implements CultureRepository{
  private chain:Promise<void>=Promise.resolve();
  private lastGood=defaultCultureState();
  private hasPersistedSnapshot=false;
  constructor(private readonly path=cultureFile()){}
  private async readStrict(){
    try{
      if((await stat(this.path)).size>MAX_BYTES*2+3000)throw Error('Каталог превышает допустимый размер');
      const state=upgraded(normalizeState(JSON.parse(await readFile(this.path,'utf8'))));
      this.lastGood=structuredClone(state);this.hasPersistedSnapshot=true;return state;
    }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return structuredClone(this.lastGood);throw e;}
  }
  private async write(value:CultureState){
    const dest=resolve(this.path),temp=dest+'.'+randomUUID()+'.tmp';await mkdir(dirname(dest),{recursive:true});
    try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
      // Keep the last committed on-disk state before any update or publication.
      try{await copyFile(dest,dest+'.previous');}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      await rename(temp,dest);this.lastGood=structuredClone(value);this.hasPersistedSnapshot=true;
    }finally{await rm(temp,{force:true}).catch(()=>{});}
  }
  private async locked<T>(work:()=>Promise<T>):Promise<T>{
    const result=this.chain.then(work);this.chain=result.then(()=>{},()=>{});return result;
  }
  async get(){
    await this.chain;
    try{return await this.readStrict();}
    catch(error){
      // A malformed persisted file on a fresh process must not look like a new,
      // empty installation. Surface the error instead of silently showing seed data.
      if(!this.hasPersistedSnapshot)throw error;
      return structuredClone(this.lastGood);
    }
  }
  async update(content:CultureContent,expectedRevision:number){
    return this.locked(async()=>{
      const old=await this.readStrict();
      if(expectedRevision!==old.revision)return null;
      const next={...old,draft:validateCulture(content),revision:old.revision+1,updatedAt:new Date().toISOString()};
      await this.write(next);return next;
    });
  }
  async publish(expectedRevision:number){
    return this.locked(async()=>{
      const old=await this.readStrict();if(expectedRevision!==old.revision)return null;
      const next={...old,published:structuredClone(old.draft),publishedRevision:old.revision,updatedAt:new Date().toISOString()};
      await this.write(next);return next;
    });
  }
}
export class PgCultureRepository implements CultureRepository{
  constructor(private readonly pool:pg.Pool){}
  private async ensure(){
    await this.pool.query(
      'INSERT INTO culture_content(id,draft,published) VALUES(1,$1::jsonb,$1::jsonb) ON CONFLICT(id) DO NOTHING',
      [JSON.stringify(starterContent)]
    );
  }
  private map(row:Record<string,unknown>):CultureState{
    return upgraded(normalizeState({revision:row.revision,publishedRevision:row.published_revision,
      draft:row.draft,published:row.published,updatedAt:new Date(row.updated_at as Date|string).toISOString()}));
  }
  async get(){
    await this.ensure();
    const row=(await this.pool.query('SELECT revision,published_revision,draft,published,updated_at FROM culture_content WHERE id=1')).rows[0];
    if(!row)throw Error('Нужна миграция 005_culture_content.sql');return this.map(row);
  }
  async update(content:CultureContent,revision:number){
    await this.ensure();
    const r=await this.pool.query('UPDATE culture_content SET draft=$1::jsonb,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision,published_revision,draft,published,updated_at',
      [JSON.stringify(validateCulture(content)),revision]);
    return r.rows[0]?this.map(r.rows[0]):null;
  }
  async publish(revision:number){
    await this.ensure();
    const r=await this.pool.query('UPDATE culture_content SET published=draft,published_revision=revision,updated_at=now() WHERE id=1 AND revision=$1 RETURNING revision,published_revision,draft,published,updated_at',[revision]);
    return r.rows[0]?this.map(r.rows[0]):null;
  }
}
// Uploaded photographs: opaque ids, no arbitrary paths and no SVG/HTML.
export class CultureMedia {
  constructor(private readonly dir=cultureImagesDir()){}
  async upload(fileName:string,base64:string):Promise<string>{
    if(typeof base64!=='string'||base64.length>Math.ceil(MAX_PHOTO_BYTES*4/3)+8||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('Фото должно быть JPG, PNG или WebP, до 3 МБ');
    const bytes=Buffer.from(base64,'base64');
    if(!bytes.length||bytes.length>MAX_PHOTO_BYTES||bytes.toString('base64')!==base64)throw Error('Повреждено изображение');
    const name=fileName.toLowerCase();
    const ext=name.endsWith('.png')?'png':name.endsWith('.jpg')||name.endsWith('.jpeg')?'jpg':
      name.endsWith('.webp')?'webp':'';
    if(!ext)throw Error('Допускаются JPEG, PNG и WebP');
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg=bytes.subarray(0,3).equals(Buffer.from([255,216,255]));
    const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if((ext==='png'&&!png)||(ext==='jpg'&&!jpg)||(ext==='webp'&&!webp))throw Error('Неверный формат изображения');
    const basename=randomUUID()+'.'+ext;await mkdir(this.dir,{recursive:true});
    await writeFile(join(this.dir,basename),bytes,{flag:'wx',mode:0o600});
    return '/api/public/culture/media/'+basename;
  }
  async file(name:string):Promise<{stream:ReturnType<typeof createReadStream>;mime:string;size:number}|null>{
    if(!imageName.test(name))return null;
    const path=join(this.dir,name);
    try{const size=(await stat(path)).size;
      if(size<1||size>MAX_PHOTO_BYTES)return null;
      const ext=name.split('.').pop();return {stream:createReadStream(path),
        mime:ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg',size};
    }catch{return null;}
  }
}
