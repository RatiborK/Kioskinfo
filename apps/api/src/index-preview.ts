// apps/api/src/index-preview.ts — local-only development editor with ephemeral password.
// Never expose port 3100 or Vite to the LAN in this mode. Schedule data persists to content/schedule/records.json.
import { randomBytes, randomUUID } from 'node:crypto';
import {fileURLToPath} from 'node:url';
import { createApp } from './app.js';
import { FolderPosterRepository } from './posters.js';
import { FileScheduleRepository } from './schedule-file.js';
import {seedPreviewSchedule} from './seed-preview-schedule.js';
import { FileThemeRepository } from './themes.js';
import { FileEventsRepository } from './events.js';
import { FolderDocumentsRepository } from './documents.js';
import {FileCultureRepository,CultureMedia} from './culture.js';
import { hashLocalPreviewPassword } from './crypto.js';
import type { Account, Page, PublicContent, Session, Store } from './model.js';

class LocalDevStore implements Store {
  readonly account: Account;
  readonly sessions = new Map<string,Session>();
  readonly pages: Page[] = [{id:randomUUID(),slug:'welcome',title:'ДК «Кировский»',body:'Информационная платформа НавиКультура',revision:1,
    published:{title:'ДК «Кировский»',body:'Информационная платформа НавиКультура'},published_revision:1,updated_at:new Date().toISOString()}];
  constructor(hash: string) {this.account={id:randomUUID(),username:'admin',display_name:'Локальный администратор',role:'admin',password_hash:hash,enabled:true};}
  async findAccountByUsername(name:string){return name==='admin'?this.account:null;}
  async findAccountById(id:string){return id===this.account.id?this.account:null;}
  async createSession(hash:string,accountId:string,expiresAt:Date){this.sessions.set(hash,{account_id:accountId,expires_at:expiresAt.toISOString()});}
  async getSession(hash:string){const s=this.sessions.get(hash);return s&&Date.parse(s.expires_at)>Date.now()?s:null;}
  async deleteSession(hash:string){this.sessions.delete(hash);}
  async listPages(){return structuredClone(this.pages);}
  async getPage(id:string){return structuredClone(this.pages.find(x=>x.id===id||x.slug===id)??null);}
  async getPublishedBySlug(slug:string){return structuredClone(this.pages.find(x=>x.slug===slug)?.published??null);}
  async updateDraft(id:string,rev:number,fields:PublicContent){const row=this.pages.find(x=>x.id===id||x.slug===id);if(!row||row.revision!==rev)return null;
    row.title=fields.title;row.body=fields.body;row.revision++;row.updated_at=new Date().toISOString();return structuredClone(row);}
  async publish(id:string,rev:number){const row=this.pages.find(x=>x.id===id||x.slug===id);if(!row||row.revision!==rev)return null;
    row.published={title:row.title,body:row.body};row.published_revision=row.revision;return structuredClone(row);}
  async audit(_accountId:string|null,_action:string,_details:Record<string,unknown>){}
}
// Local preview ONLY. Read the ignored .env.local file created by the operator;
// never commit the password, return it to the browser, or print the configured value.
try{process.loadEnvFile(fileURLToPath(new URL('../../../.env.local',import.meta.url)));}
catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const configuredPassword=process.env.NAVIKULTURA_DEV_PASSWORD;
const password=configuredPassword || randomBytes(18).toString('base64url');
if(password.length<8)throw new Error('NAVIKULTURA_DEV_PASSWORD: минимум 8 символов только для локального просмотра');
if(configuredPassword&&password.length<12)
  process.stderr.write('[NAVIKULTURA DEV] Короткий пароль разрешён только на 127.0.0.1. Для эксплуатации требуется другой, более сильный пароль.\n');
const store=new LocalDevStore(await hashLocalPreviewPassword(password));
const scheduleRepo=new FileScheduleRepository();
let importedCards=0;
try{importedCards=await seedPreviewSchedule(scheduleRepo);}
catch(error){
  // The retired schedule store must not prevent the editor, published culture
  // and existing photos/documents from starting.
  process.stderr.write('[NAVIKULTURA] Старое расписание недоступно; культурный каталог продолжит работу: '+
    (error instanceof Error?error.message:String(error))+'\n');
}
const app=createApp({store,posters:new FolderPosterRepository(),schedule:scheduleRepo,themes:new FileThemeRepository(),events:new FileEventsRepository(),documents:new FolderDocumentsRepository(),culture:new FileCultureRepository(),cultureMedia:new CultureMedia(),allowedOrigin:'http://127.0.0.1:5173'});
try {
  await app.listen({host:'127.0.0.1',port:3100});
  process.stdout.write('\n[LOCAL DEV ONLY] НавиКультура: http://127.0.0.1:5173/editor\n');
  process.stdout.write('Логин: admin\n'+(configuredPassword?'Пароль загружен из локальной .env.local, в журнал не выводится.\n':'Временный пароль для первого локального запуска: '+password+'\n'));
  process.stdout.write('Каталог расписания: content/schedule/records.json. Добавлено начальных карточек: '+importedCards+'. Этот режим НЕ для локальной сети ДК.\n\n');
} catch(error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write('[NAVIKULTURA DEV] Не удалось запустить API на 127.0.0.1:3100: ' + detail + '\n');
  process.stderr.write('Проверьте порт 3100: возможно, предыдущий экземпляр API ещё запущен.\n');
  process.exitCode=1;
  await app.close();
}
process.once('SIGINT',()=>void app.close());
process.once('SIGTERM',()=>void app.close());
