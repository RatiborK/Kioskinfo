// apps/api/src/themes.ts — global visitor theme, independent from schedule card contents.
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type pg from 'pg';

export const VISITOR_THEME_IDS=['dk','holiday','modern','aurora','poster','gallery','neon','kids'] as const;
export type VisitorThemeId=typeof VISITOR_THEME_IDS[number];
export const THEME_NAMES:Record<VisitorThemeId,string>={
  dk:'Стиль сайта ДК',holiday:'Праздничная',modern:'Стильная',
  aurora:'Северное сияние',poster:'Афишная',gallery:'Галерея',
  neon:'Неон-сцена',kids:'Детская мастерская',
};
export function isThemeId(value:unknown):value is VisitorThemeId{
  return typeof value==='string' && (VISITOR_THEME_IDS as readonly string[]).includes(value);
}
export interface ThemeSettings{
  draft:VisitorThemeId;published:VisitorThemeId;revision:number;
  published_revision:number;updatedAt:string;
}
export const defaultThemeSettings=():ThemeSettings=>({
  draft:'dk',published:'dk',revision:1,published_revision:1,updatedAt:new Date(0).toISOString(),
});
export interface ThemeRepository{
  get():Promise<ThemeSettings>;
  choose(id:VisitorThemeId,expectedRevision:number):Promise<ThemeSettings|null>;
  publish(expectedRevision:number):Promise<ThemeSettings|null>;
}
function checked(input:unknown):ThemeSettings{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Повреждены настройки темы');
  const v=input as Record<string,unknown>;
  if(!isThemeId(v.draft)||!isThemeId(v.published)||!Number.isSafeInteger(v.revision)||
     Number(v.revision)<1||!Number.isSafeInteger(v.published_revision)||
     Number(v.published_revision)<1||Number(v.published_revision)>Number(v.revision)||
     typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt)))
       throw Error('Повреждены настройки темы');
  return v as unknown as ThemeSettings;
}
export const defaultThemeFile=()=>fileURLToPath(new URL('../../../content/settings/visitor-theme.json',import.meta.url));
export class FileThemeRepository implements ThemeRepository{
  private queue:Promise<void>=Promise.resolve();
  private good:ThemeSettings=defaultThemeSettings();
  constructor(private readonly file:string=defaultThemeFile()){}
  private async readStrict():Promise<ThemeSettings>{
    try{
      if((await stat(this.file)).size>8192)throw Error('Файл темы слишком большой');
      const value=checked(JSON.parse(await readFile(this.file,'utf8')));
      this.good=structuredClone(value);
      return value;
    }catch(error){
      if((error as NodeJS.ErrnoException).code==='ENOENT')return structuredClone(this.good);
      throw error;
    }
  }
  private async write(value:ThemeSettings):Promise<void>{
    const target=resolve(this.file),temp=target+'.'+randomUUID()+'.tmp';
    await mkdir(dirname(target),{recursive:true});
    try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
      await rename(temp,target);this.good=structuredClone(value);
    }finally{await rm(temp,{force:true}).catch(()=>{});}
  }
  private async locked<T>(work:()=>Promise<T>):Promise<T>{
    const result=this.queue.then(work);
    this.queue=result.then(()=>{},()=>{});
    return result;
  }
  async get(){await this.queue;try{return await this.readStrict();}catch{return structuredClone(this.good);}}
  async choose(id:VisitorThemeId,expectedRevision:number){
    if(!isThemeId(id))throw Error('Неизвестная тема');
    return this.locked(async()=>{
      const old=await this.readStrict();
      if(old.revision!==expectedRevision)return null;
      const next={...old,draft:id,revision:old.revision+1,updatedAt:new Date().toISOString()};
      await this.write(next);return next;
    });
  }
  async publish(expectedRevision:number){
    return this.locked(async()=>{
      const old=await this.readStrict();
      if(old.revision!==expectedRevision)return null;
      const next={...old,published:old.draft,published_revision:old.revision,updatedAt:new Date().toISOString()};
      await this.write(next);return next;
    });
  }
}
// Production storage: one row, optimistic revision control, parameterised SQL.
export class PgThemeRepository implements ThemeRepository{
  constructor(private readonly pool:pg.Pool){}
  private map(row:Record<string,unknown>):ThemeSettings{
    return checked({draft:row.draft,published:row.published,revision:Number(row.revision),
      published_revision:Number(row.published_revision),
      updatedAt:new Date(row.updated_at as string|Date).toISOString()});
  }
  async get(){
    const r=await this.pool.query('SELECT draft,published,revision,published_revision,updated_at FROM visitor_theme_settings WHERE id=1');
    if(!r.rows[0])throw Error('Примените миграции базы данных для тем посетителя');
    return this.map(r.rows[0]);
  }
  async choose(id:VisitorThemeId,expectedRevision:number){
    if(!isThemeId(id))throw Error('Неизвестная тема');
    const r=await this.pool.query(`UPDATE visitor_theme_settings SET draft=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING draft,published,revision,published_revision,updated_at`,[id,expectedRevision]);
    return r.rows[0]?this.map(r.rows[0]):null;
  }
  async publish(expectedRevision:number){
    const r=await this.pool.query(`UPDATE visitor_theme_settings SET published=draft,published_revision=revision,updated_at=now() WHERE id=1 AND revision=$1 RETURNING draft,published,revision,published_revision,updated_at`,[expectedRevision]);
    return r.rows[0]?this.map(r.rows[0]):null;
  }
}
