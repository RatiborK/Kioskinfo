// apps/api/src/schedule-file.ts — atomic localhost development storage for web schedule editor.
// Never use this single-process file store for LAN production: PostgreSQL is required there.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedCatalog, validateScheduleFields, type ScheduleCatalog, type ScheduleFields, type ScheduleRecord, type ScheduleRepository } from './schedule.js';

export const defaultScheduleJson = () => fileURLToPath(new URL('../../../content/schedule/records.json', import.meta.url));
const MAX_BYTES = 2 * 1024 * 1024;
export class FileScheduleRepository implements ScheduleRepository {
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  private lastGood: ScheduleRecord[] = [];
  private hasGood = false;
  constructor(file = defaultScheduleJson()) { this.file = resolve(file); }
  private async readStrict(): Promise<ScheduleRecord[]> {
    try {
      const size = (await stat(this.file)).size;
      if (size > MAX_BYTES) throw new Error('Файл расписания превышает допустимый размер');
      const raw = await readFile(this.file, 'utf8');
      const json: unknown = JSON.parse(raw);
      if (!Array.isArray(json) || json.length > 300) throw new Error('Файл расписания повреждён');
      const records = json as ScheduleRecord[];
      for (const row of records) {
        if (typeof row !== 'object' || row === null || typeof row.id !== 'string' ||
          !Number.isSafeInteger(row.revision) || row.revision < 1 || !row.created_at ||
          !row.updated_at || (row.published !== null && typeof row.published !== 'object')) {
          throw new Error('Файл расписания содержит ошибочную запись');
        }
        // In-memory migration: older records are readable without modifying disk on a GET.
        Object.assign(row,validateScheduleFields(row));
        if (row.published) row.published=validateScheduleFields(row.published);
      }
      this.lastGood = structuredClone(records); this.hasGood = true;
      return records;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !this.hasGood) return [];
      throw error;
    }
  }
  private async atomicWrite(records: ScheduleRecord[]) {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(records, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temp, this.file);
      this.lastGood = structuredClone(records); this.hasGood = true;
    } finally { await rm(temp, {force:true}).catch(()=>{}); }
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.then(()=>{},()=>{});
    return result;
  }
  async list(): Promise<ScheduleCatalog> {
    await this.queue;
    try { return publishedCatalog(await this.readStrict()); }
    catch { return publishedCatalog(this.lastGood, true, 'Файл расписания недоступен. Показана последняя корректная версия.'); }
  }
  async listDrafts(): Promise<ScheduleRecord[]> { await this.queue; return structuredClone(await this.readStrict()); }
  async create(fields: ScheduleFields): Promise<ScheduleRecord> {
    return this.exclusive(async () => {
      const rows = await this.readStrict();
      if (rows.length >= 300) throw new Error('Достигнут предел 300 карточек');
      const now = new Date().toISOString();
      const row:ScheduleRecord = {...validateScheduleFields(fields), id:randomUUID(), revision:1,
        published:null, published_revision:null, created_at:now, updated_at:now, published_at:null};
      rows.push(row);await this.atomicWrite(rows);return structuredClone(row);
    });
  }
  async save(id:string, expectedRevision:number, fields:ScheduleFields):Promise<ScheduleRecord|null> {
    return this.exclusive(async () => {
      const rows = await this.readStrict();
      const i = rows.findIndex(x=>x.id===id);
      if (i<0 || rows[i].revision!==expectedRevision) return null;
      rows[i]={...rows[i],...validateScheduleFields(fields),revision:expectedRevision+1,updated_at:new Date().toISOString()};
      await this.atomicWrite(rows);return structuredClone(rows[i]);
    });
  }
  async publish(id:string, expectedRevision:number):Promise<ScheduleRecord|null> {
    return this.exclusive(async () => {
      const rows=await this.readStrict();const i=rows.findIndex(x=>x.id===id);
      if(i<0||rows[i].revision!==expectedRevision)return null;
      const fields=validateScheduleFields(rows[i]);const now=new Date().toISOString();
      rows[i]={...rows[i],published:fields,published_revision:rows[i].revision,published_at:now};
      await this.atomicWrite(rows);return structuredClone(rows[i]);
    });
  }
  async archive(id:string,expectedRevision:number):Promise<boolean> {
    return this.exclusive(async()=>{
      const rows=await this.readStrict();const i=rows.findIndex(x=>x.id===id);
      if(i<0||rows[i].revision!==expectedRevision)return false;
      rows.splice(i,1);await this.atomicWrite(rows);return true;
    });
  }
}
