// apps/api/src/events.ts — published cultural events, with independent editor drafts.
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,rm,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type pg from 'pg';

export const EVENT_TYPES=['concert','play','festival','other'] as const;
export const EVENT_VENUES=['hall','foyer','orfey'] as const;
export type EventType=typeof EVENT_TYPES[number];
export type EventVenue=typeof EVENT_VENUES[number];
export interface EventFields{
  title:string;date:string;time:string;type:EventType;venue:EventVenue;description:string;ticketUrl:string;
}
export interface EventRecord extends EventFields {
  id:string;revision:number;published:EventFields|null;updatedAt:string;
}
export interface EventPublic extends EventFields{id:string}
export interface EventsRepository{
  list():Promise<EventPublic[]>;
  drafts():Promise<EventRecord[]>;
  create(fields:EventFields):Promise<EventRecord>;
  save(id:string,revision:number,fields:EventFields):Promise<EventRecord|null>;
  publish(id:string,revision:number):Promise<EventRecord|null>;
  remove(id:string,revision:number):Promise<boolean>;
}
export function validateTicketUrl(input:unknown):string{
  if(input===undefined||input===null||input==='')return '';
  if(typeof input!=='string'||input.length>600)throw Error('Ссылка на билет должна быть адресом Muzaticket');
  let url:URL;
  try{url=new URL(input);}catch{throw Error('Неверная ссылка на билет Muzaticket');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    !['muzaticket.ru','widget.muzaticket.ru'].includes(host))
    throw Error('Для билетов разрешены только защищённые ссылки Muzaticket');
  return url.href;
}
export function validateEvent(input:unknown):EventFields{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Заполните сведения о мероприятии');
  const r=input as Record<string,unknown>;
  if(typeof r.title!=='string'||!r.title.trim()||r.title.length>120)
    throw Error('Название мероприятия обязательно, до 120 символов');
  if(typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('Неверная дата мероприятия');
  const date=new Date(r.date+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==r.date)throw Error('Несуществующая дата мероприятия');
  if(typeof r.time!=='string'||r.time.length>5||(r.time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)))
    throw Error('Укажите время HH:MM или оставьте поле пустым');
  if(!EVENT_TYPES.includes(r.type as EventType))throw Error('Выберите тип мероприятия');
  if(!EVENT_VENUES.includes(r.venue as EventVenue))throw Error('Выберите место проведения');
  if(typeof r.description!=='string'||r.description.length>2000)throw Error('Описание не должно превышать 2000 символов');
  return {title:r.title.trim(),date:r.date,time:r.time,type:r.type as EventType,
    venue:r.venue as EventVenue,description:r.description.trim(),ticketUrl:validateTicketUrl(r.ticketUrl)};
}
const byDate=(a:EventPublic,b:EventPublic)=>a.date.localeCompare(b.date)||
  a.time.localeCompare(b.time)||a.title.localeCompare(b.title,'ru');
export const publicEvents=(records:readonly EventRecord[]):EventPublic[]=>records.filter(x=>x.published)
  .map(x=>({...x.published!,id:x.id})).sort(byDate);
export const eventsPath=()=>fileURLToPath(new URL('../../../content/events/events.json',import.meta.url));
export class FileEventsRepository implements EventsRepository{
  private chain:Promise<void>=Promise.resolve();
  private good:EventRecord[]=[];
  constructor(private readonly file=eventsPath()){}
  private async read():Promise<EventRecord[]>{
    try{
      if((await stat(this.file)).size>1024*1024)throw Error('Размер базы мероприятий превышен');
      const rows:unknown=JSON.parse(await readFile(this.file,'utf8'));
      if(!Array.isArray(rows)||rows.length>300)throw Error('Повреждён календарь');
      for(const x of rows){
        if(!x||typeof x!=='object')throw Error('Повреждён календарь');
        const row=x as EventRecord;
        if(!/^[a-f0-9-]{36}$/.test(row.id)||!Number.isSafeInteger(row.revision)||row.revision<1||
          (row.published!==null&&(!row.published||typeof row.published!=='object')))
          throw Error('Некорректная запись календаря');
        validateEvent(row);
        if(row.published)validateEvent(row.published);
      }
      this.good=structuredClone(rows);return rows as EventRecord[];
    }catch(e){
      if((e as NodeJS.ErrnoException).code==='ENOENT')return structuredClone(this.good);
      throw e;
    }
  }
  private async write(rows:EventRecord[]){
    const target=resolve(this.file),temporary=target+'.'+randomUUID()+'.tmp';
    await mkdir(dirname(target),{recursive:true});
    try{await writeFile(temporary,JSON.stringify(rows,null,2)+'\n',{flag:'wx',mode:0o600});
      await rename(temporary,target);this.good=structuredClone(rows);
    }finally{await rm(temporary,{force:true}).catch(()=>{});}
  }
  private async locked<T>(fn:()=>Promise<T>):Promise<T>{
    const result=this.chain.then(fn);this.chain=result.then(()=>{},()=>{});return result;
  }
  async list(){await this.chain;try{return publicEvents(await this.read());}catch{return publicEvents(this.good);}}
  async drafts(){await this.chain;return structuredClone(await this.read());}
  async create(fields:EventFields){
    return this.locked(async()=>{
      const rows=await this.read();if(rows.length>=300)throw Error('Не более 300 мероприятий');
      const row:EventRecord={...validateEvent(fields),id:randomUUID(),revision:1,published:null,updatedAt:new Date().toISOString()};
      rows.push(row);await this.write(rows);return row;
    });
  }
  async save(id:string,revision:number,fields:EventFields){
    return this.locked(async()=>{
      const rows=await this.read(),i=rows.findIndex(x=>x.id===id&&x.revision===revision);
      if(i<0)return null;
      rows[i]={...rows[i],...validateEvent(fields),revision:revision+1,updatedAt:new Date().toISOString()};
      await this.write(rows);return structuredClone(rows[i]);
    });
  }
  async publish(id:string,revision:number){
    return this.locked(async()=>{
      const rows=await this.read(),i=rows.findIndex(x=>x.id===id&&x.revision===revision);
      if(i<0)return null;
      rows[i]={...rows[i],published:validateEvent(rows[i]),updatedAt:new Date().toISOString()};
      await this.write(rows);return structuredClone(rows[i]);
    });
  }
  async remove(id:string,revision:number){
    return this.locked(async()=>{
      const rows=await this.read(),i=rows.findIndex(x=>x.id===id&&x.revision===revision);
      if(i<0)return false;rows.splice(i,1);await this.write(rows);return true;
    });
  }
}
export class PgEventsRepository implements EventsRepository{
  constructor(private readonly pool:pg.Pool){}
  private map(row:Record<string,unknown>):EventRecord{
    const draft=validateEvent(row.draft);
    return {...draft,id:String(row.id),revision:Number(row.revision),
      published:row.published?validateEvent(row.published):null,
      updatedAt:new Date(row.updated_at as Date|string).toISOString()};
  }
  async drafts(){
    const r=await this.pool.query('SELECT id,revision,draft,published,updated_at FROM cultural_events WHERE archived_at IS NULL ORDER BY id');
    return r.rows.map(row=>this.map(row));
  }
  async list(){return publicEvents(await this.drafts());}
  async create(fields:EventFields){
    const r=await this.pool.query('INSERT INTO cultural_events(draft) VALUES($1::jsonb) RETURNING id,revision,draft,published,updated_at',[JSON.stringify(validateEvent(fields))]);
    return this.map(r.rows[0]);
  }
  async save(id:string,revision:number,fields:EventFields){
    const r=await this.pool.query('UPDATE cultural_events SET draft=$3::jsonb,revision=revision+1,updated_at=now() WHERE id::text=$1 AND revision=$2 AND archived_at IS NULL RETURNING id,revision,draft,published,updated_at',
      [id,revision,JSON.stringify(validateEvent(fields))]);
    return r.rows[0]?this.map(r.rows[0]):null;
  }
  async publish(id:string,revision:number){
    const r=await this.pool.query('UPDATE cultural_events SET published=draft,updated_at=now() WHERE id::text=$1 AND revision=$2 AND archived_at IS NULL RETURNING id,revision,draft,published,updated_at',[id,revision]);
    return r.rows[0]?this.map(r.rows[0]):null;
  }
  async remove(id:string,revision:number){
    const r=await this.pool.query('UPDATE cultural_events SET published=NULL,archived_at=now(),updated_at=now(),revision=revision+1 WHERE id::text=$1 AND revision=$2 AND archived_at IS NULL RETURNING id',[id,revision]);
    return r.rowCount===1;
  }
}
