// apps/api/src/app.ts — LAN editor with session authentication, role checks and revision-safe autosave.
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { createSessionToken, tokenHash, verifyPassword } from './crypto.js';
import type { Account, PublicContent, Store } from './model.js';
import { posterFileStream, type PosterRepository } from './posters.js';
import { validateScheduleFields, type ScheduleRepository } from './schedule.js';
import {validateEvent,type EventsRepository} from './events.js';
import {documentStream,type DocumentRepository} from './documents.js';
import { defaultThemeSettings,isThemeId,isHexColor,THEME_NAMES, VISITOR_THEME_IDS,type ThemeRepository } from './themes.js';
import {CultureMedia,CultureVideos,MAX_CULTURE_VIDEO_BYTES,defaultCultureState,validateCulture,restoreMissingStarterContent,type CultureRepository} from './culture.js';
import {cultureWithOptionalSchedule} from './culture-availability.js';

export interface AppOptions { store: Store; posters?: PosterRepository; schedule?: ScheduleRepository; themes?: ThemeRepository; events?: EventsRepository; documents?: DocumentRepository; culture?: CultureRepository; cultureMedia?: CultureMedia; videos?: CultureVideos; cookieSecure?: boolean; allowedOrigin?: string }
const MAX_AGE_S = 8 * 60 * 60;
const ID = /^[a-z0-9_-]{1,80}$/i;
const cookieName = (secure: boolean) => secure ? '__Host-navikultura_sid' : 'navikultura_dev_sid';
function readCookie(request: FastifyRequest, name: string): string | null {
  const pair = (request.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
}
function cookieHeader(token: string, secure: boolean, maxAge: number): string {
  return `${cookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function userPublic(account: Account) {
  return { id: account.id, username: account.username, displayName: account.display_name, role: account.role };
}
export function createApp(options: AppOptions) {
  const app = Fastify({ logger: false, bodyLimit: 11_000_000 });
  const { store, posters, schedule, themes, events, documents, culture, cultureMedia, videos, cookieSecure = false, allowedOrigin } = options;
  const failedLogins = new Map<string, { count: number; windowStart: number }>();
  const mutating = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
  // Binary video uploads are parsed only at the dedicated authenticated route.
  app.addContentTypeParser('application/octet-stream',{parseAs:'buffer'},(_request,body,done)=>done(null,body));
  app.addHook('onRequest', async (request, reply) => {
    if (!mutating.has(request.method)) return;
    // JSON + a custom header and SameSite=Strict protect against ordinary cross-site form submissions.
    if (request.headers['x-navikultura-action'] !== '1') return reply.code(403).send({ error: 'Необходим заголовок X-Navikultura-Action' });
    const isVideoUpload=request.url==='/api/editor/culture/video'&&request.method==='POST';
    if (!request.headers['content-type']?.startsWith(isVideoUpload?'application/octet-stream':'application/json'))
      return reply.code(415).send({error:'Неверный формат запроса'});
    const origin = request.headers.origin;
    if (origin && allowedOrigin && origin !== allowedOrigin) return reply.code(403).send({ error: 'Источник запроса не разрешён' });
    if (origin && !allowedOrigin) return reply.code(403).send({ error: 'Разрешённый адрес редактора не настроен' });
  });
  async function currentUser(request: FastifyRequest): Promise<Account | null> {
    const raw = readCookie(request, cookieName(cookieSecure));
    if (!raw || !/^[A-Za-z0-9_-]{32,64}$/.test(raw)) return null;
    const session = await store.getSession(tokenHash(raw));
    if (!session) return null;
    const user = await store.findAccountById(session.account_id);
    return user?.enabled ? user : null;
  }
  async function requireRole(request: FastifyRequest, reply: FastifyReply, roles: Account['role'][]): Promise<Account | null> {
    const account = await currentUser(request);
    if (!account) { reply.code(401).send({ error: 'Войдите в систему' }); return null; }
    if (!roles.includes(account.role)) { reply.code(403).send({ error: 'Недостаточно прав' }); return null; }
    return account;
  }
  app.get('/api/health', async () => ({ status: 'ok', service: 'navikultura-api', phase: 'stage-01' }));
  app.get('/api/public/navigation', async () => ({
    status: 'demo', sections: [
      { id: 'posters', title: 'Афиша' },
      { id: 'groups', title: 'Коллективы' }, {id:'calendar',title:'Календарь событий'}, {id:'documents',title:'Документы ДК'}, { id: 'navigation', title: 'Навигация' },
      { id: 'about', title: 'О ДК' }, { id: 'safety', title: 'Безопасность' }, { id: 'tickets', title: 'Билеты' }, { id: 'contacts', title: 'Контакты' },
    ],
  }));
  app.get('/api/public/schedule', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return schedule ? await schedule.list() : { entries: [], version:'none', updatedAt:null, stale:false, message:'Расписание ещё не настроено' };
  });
  // Cultural content: seeded preview, protected drafts, explicit publication.
  app.get('/api/public/culture',async(_request,reply)=>{
    reply.header('Cache-Control','no-store');
    const state=culture?await culture.get():defaultCultureState();
    const published=await cultureWithOptionalSchedule(state.published,schedule,()=>{});
    return {content:published,revision:state.publishedRevision};
  });
  app.get('/api/editor/culture',async(request,reply)=>{
    const user=await requireRole(request,reply,['admin','editor','viewer']);if(!user)return;
    reply.header('Cache-Control','no-store');
    const state=culture?await culture.get():defaultCultureState();
    // Old schedule is optional: a broken/retired schedule must never hide the whole editor.
    // Published/draft catalogs remain authoritative; legacy fields are a read-only enrichment.
    state.draft=await cultureWithOptionalSchedule(state.draft,schedule,()=>{});
    return {state};
  });
  app.patch<{Body:{content?:unknown;expectedRevision?:number}}>('/api/editor/culture',async(request,reply)=>{
    const user=await requireRole(request,reply,['admin','editor']);if(!user)return;
    if(!culture)return reply.code(503).send({error:'Редактор культурного контента недоступен'});
    const expected=Number(request.body?.expectedRevision);
    if(!Number.isSafeInteger(expected)||expected<1)return reply.code(400).send({error:'Неверная версия'});
    let value;try{value=validateCulture(request.body?.content);}
    catch(error){return reply.code(400).send({error:error instanceof Error?error.message:'Неверные поля'});}
    const state=await culture.update(value,expected);
    if(!state)return reply.code(409).send({error:'Контент изменён другим сотрудником. Обновите данные'});
    await store.audit(user.id,'culture.save',{revision:state.revision});
    return {state};
  });
  app.post<{Body:{expectedRevision?:number}}>('/api/editor/culture/restore-starter',async(request,reply)=>{
    const user=await requireRole(request,reply,['admin']);if(!user)return;
    if(!culture)return reply.code(503).send({error:'Каталог ДК недоступен'});
    const expected=Number(request.body?.expectedRevision);
    if(!Number.isSafeInteger(expected)||expected<1)return reply.code(400).send({error:'Неверная версия'});
    const current=await culture.get();
    if(expected!==current.revision)return reply.code(409).send({error:'Каталог изменился, обновите страницу'});
    const {content,added}=restoreMissingStarterContent(current.draft);
    if(!Object.values(added).some(Boolean))return {state:current,added};
    const saved=await culture.update(content,expected);
    if(!saved)return reply.code(409).send({error:'Каталог изменился, обновите страницу'});
    await store.audit(user.id,'culture.restore-starter',{added});
    return {state:saved,added};
  });
  app.post<{Body:{expectedRevision?:number}}>('/api/editor/culture/publish',async(request,reply)=>{
    const user=await requireRole(request,reply,['admin']);if(!user)return;
    if(!culture)return reply.code(503).send({error:'Публикация недоступна'});
    const expected=Number(request.body?.expectedRevision);
    if(!Number.isSafeInteger(expected)||expected<1)return reply.code(400).send({error:'Неверная версия'});
    const state=await culture.publish(expected);
    if(!state)return reply.code(409).send({error:'Контент изменён другим сотрудником'});
    await store.audit(user.id,'culture.publish',{revision:state.publishedRevision});
    return {state};
  });
  app.post<{Body:{fileName?:string;base64?:string}}>('/api/editor/culture/photo',
    async(request,reply)=>{
      const user=await requireRole(request,reply,['admin','editor']);if(!user)return;
      if(!cultureMedia)return reply.code(503).send({error:'Загрузка фото недоступна'});
      const {fileName,base64}=request.body??{};
      if(typeof fileName!=='string'||typeof base64!=='string')return reply.code(400).send({error:'Требуется фото'});
      try{
        const url=await cultureMedia.upload(fileName,base64);
        await store.audit(user.id,'culture.photo',{uploaded:true});
        return reply.code(201).send({url});
      }catch(error){return reply.code(400).send({error:error instanceof Error?error.message:'Недопустимое фото'});}
    });
  app.get<{Params:{name:string}}>('/api/public/culture/media/:name',async(request,reply)=>{
    const result=await cultureMedia?.file(request.params.name);
    if(!result)return reply.code(404).send({error:'Фото не найдено'});
    reply.header('Cache-Control','public, max-age=3600');
    reply.header('Content-Type',result.mime);
    reply.header('X-Content-Type-Options','nosniff');
    return reply.send(result.stream);
  });
  app.post<{Body:Buffer}>('/api/editor/culture/video',
    {bodyLimit:MAX_CULTURE_VIDEO_BYTES+1024},async(request,reply)=>{
      const user=await requireRole(request,reply,['admin','editor']);if(!user)return;
      if(!videos)return reply.code(503).send({error:'Локальное видео на сервере не настроено'});
      let filename='';
      try{filename=decodeURIComponent(String(request.headers['x-navikultura-file-name']??''));}
      catch{return reply.code(400).send({error:'Неверное имя файла'});}
      try{
        const url=await videos.upload(filename,request.body);
        await store.audit(user.id,'culture.video',{uploaded:true});
        return reply.code(201).send({url});
      }catch(error){return reply.code(400).send({error:error instanceof Error?error.message:'Недопустимое видео'});}
    });
  app.get<{Params:{name:string}}>('/api/public/culture/video/:name',async(request,reply)=>{
    const info=await videos?.info(request.params.name);
    if(!info)return reply.code(404).send({error:'Видео не найдено'});
    reply.header('Content-Type',info.mime);
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('Cache-Control','public,max-age=3600');
    reply.header('Accept-Ranges','bytes');
    const header=request.headers.range;
    let start=0,end=info.size-1;
    if(header){
      const parts=/^bytes=(\d*)-(\d*)$/.exec(header);
      if(!parts||(!parts[1]&&!parts[2])) {
        reply.header('Content-Range','bytes */'+info.size);
        return reply.code(416).send();
      }
      if(!parts[1]) {
        const suffix=Number(parts[2]);
        if(!Number.isSafeInteger(suffix)||suffix<1){
          reply.header('Content-Range','bytes */'+info.size);
          return reply.code(416).send();
        }
        start=Math.max(0,info.size-suffix);
      }else{
        start=Number(parts[1]);
        end=parts[2]?Number(parts[2]):end;
      }
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=info.size||end<start){
        reply.header('Content-Range','bytes */'+info.size);
        return reply.code(416).send();
      }
      end=Math.min(end,info.size-1);
      reply.header('Content-Range',`bytes ${start}-${end}/${info.size}`);
      reply.code(206);
    }
    reply.header('Content-Length',String(end-start+1));
    return reply.send(videos!.stream(info.path,start,end));
  });
  // Calendar data is independently reviewed: no draft details are exposed to visitors.
  app.get('/api/public/events',async(_request,reply)=>{
    reply.header('Cache-Control','no-store');return {events:events?await events.list():[]};
  });
  app.get('/api/editor/events',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor','viewer']);if(!account)return;
    return {items:events?await events.drafts():[]};
  });
  app.post<{Body:{fields?:unknown}}>('/api/editor/events',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor']);if(!account)return;
    if(!events)return reply.code(503).send({error:'Календарь недоступен'});
    let fields;try{fields=validateEvent(request.body?.fields);}catch(e){return reply.code(400).send({error:String(e instanceof Error?e.message:e)});}
    const item=await events.create(fields);await store.audit(account.id,'events.create',{id:item.id});
    return reply.code(201).send({item});
  });
  app.patch<{Params:{id:string};Body:{fields?:unknown;expectedRevision?:number}}>('/api/editor/events/:id',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor']);if(!account)return;
    if(!events)return reply.code(503).send({error:'Календарь недоступен'});
    if(!ID.test(request.params.id)||!Number.isSafeInteger(request.body?.expectedRevision)||Number(request.body?.expectedRevision)<1)
      return reply.code(400).send({error:'Неверный ID или версия мероприятия'});
    let fields;try{fields=validateEvent(request.body?.fields);}catch(e){return reply.code(400).send({error:String(e instanceof Error?e.message:e)});}
    const item=await events.save(request.params.id,Number(request.body.expectedRevision),fields);
    if(!item)return reply.code(409).send({error:'Мероприятие уже изменено. Обновите список'});
    await store.audit(account.id,'events.save',{id:item.id});return {item};
  });
  app.post<{Params:{id:string};Body:{expectedRevision?:number}}>('/api/editor/events/:id/publish',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor']);if(!account)return;
    if(!events)return reply.code(503).send({error:'Календарь недоступен'});
    if(!ID.test(request.params.id)||!Number.isSafeInteger(request.body?.expectedRevision)||Number(request.body?.expectedRevision)<1)
      return reply.code(400).send({error:'Неверный ID или версия мероприятия'});
    const item=await events.publish(request.params.id,Number(request.body.expectedRevision));
    if(!item)return reply.code(409).send({error:'Мероприятие уже изменено'});
    await store.audit(account.id,'events.publish',{id:item.id});return {item};
  });
  app.delete<{Params:{id:string};Body:{expectedRevision?:number}}>('/api/editor/events/:id',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin']);if(!account)return;
    if(!events)return reply.code(503).send({error:'Календарь недоступен'});
    if(!ID.test(request.params.id)||!Number.isSafeInteger(request.body?.expectedRevision)||Number(request.body?.expectedRevision)<1)
      return reply.code(400).send({error:'Неверный ID или версия'});
    if(!await events.remove(request.params.id,Number(request.body.expectedRevision)))
      return reply.code(409).send({error:'Мероприятие уже изменено'});
    await store.audit(account.id,'events.remove',{id:request.params.id});return {status:'ok'};
  });
  // Public library: Word documents render as sanitised HTML; PDF is offered as an inline file.
  app.get('/api/public/documents',async(_request,reply)=>{
    reply.header('Cache-Control','no-store');return {documents:documents?await documents.list():[]};
  });
  app.get<{Params:{id:string}}>('/api/public/documents/:id/content',async(request,reply)=>{
    if(!ID.test(request.params.id))return reply.code(404).send({error:'Документ не найден'});
    const html=await documents?.html(request.params.id);
    if(html==null)return reply.code(404).send({error:'Документ не найден'});
    reply.header('Cache-Control','no-store');return {html};
  });
  app.get<{Params:{id:string}}>('/api/public/documents/:id/file',async(request,reply)=>{
    if(!ID.test(request.params.id))return reply.code(404).send({error:'Документ не найден'});
    const file=await documents?.file(request.params.id);
    if(!file)return reply.code(404).send({error:'Документ не найден'});
    reply.header('Content-Type',file.mime);reply.header('X-Content-Type-Options','nosniff');
    reply.header('Cache-Control','no-store');reply.header('Content-Length',file.sizeBytes);
    reply.header('Content-Disposition',file.mime==='application/pdf'?'inline; filename="document.pdf"':'attachment; filename="document.docx"');
    return reply.send(documentStream(file.path));
  });
  app.post<{Body:{title?:string;category?:string;name?:string;base64?:string}}>('/api/editor/documents',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor']);if(!account)return;
    if(!documents)return reply.code(503).send({error:'Хранилище документов недоступно'});
    const {title,category,name,base64}=request.body??{};
    if(typeof title!=='string'||typeof category!=='string'||typeof name!=='string'||typeof base64!=='string')
      return reply.code(400).send({error:'Заполните название, категорию и файл'});
    try{
      const doc=await documents.upload(title,category as import('./documents.js').DocumentCategory,name,base64);
      await store.audit(account.id,'documents.upload',{id:doc.id,category:doc.category,size:doc.sizeBytes});
      return reply.code(201).send({document:doc});
    }catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'Не удалось загрузить документ'});}
  });
  app.delete<{Params:{id:string}}>('/api/editor/documents/:id',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin']);if(!account)return;
    if(!documents)return reply.code(503).send({error:'Хранилище документов недоступно'});
    if(!ID.test(request.params.id))return reply.code(404).send({error:'Документ не найден'});
    if(!await documents.remove(request.params.id))return reply.code(404).send({error:'Документ не найден'});
    await store.audit(account.id,'documents.remove',{id:request.params.id});return {status:'ok'};
  });
  // Published design is independent from content; kiosks never receive a draft choice.
  app.get('/api/public/theme',async (_request,reply)=>{
    reply.header('Cache-Control','no-store');
    const selected=themes?await themes.get():defaultThemeSettings();
    return {theme:selected.published,revision:selected.published_revision,fullscreenEnabled:selected.fullscreenEnabled,
      dkBackground:selected.dkBackground,dkGlow:selected.dkGlow};
  });
  app.get('/api/editor/theme',async (request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor','viewer']);
    if(!account)return;
    reply.header('Cache-Control','no-store');
    return {settings:themes?await themes.get():defaultThemeSettings(),
      available:VISITOR_THEME_IDS.map(id=>({id,name:THEME_NAMES[id]}))};
  });
  app.patch<{Body:{id?:unknown;expectedRevision?:unknown}}>('/api/editor/theme',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor']);
    if(!account)return;
    if(!themes)return reply.code(503).send({error:'Хранилище тем не настроено'});
    const {id,expectedRevision}=request.body??{};
    if(!isThemeId(id)||!Number.isSafeInteger(expectedRevision)||Number(expectedRevision)<1)
      return reply.code(400).send({error:'Укажите тему и корректную версию'});
    const result=await themes.choose(id,Number(expectedRevision));
    if(!result)return reply.code(409).send({error:'Тема изменена другим сотрудником. Обновите список'});
    await store.audit(account.id,'theme.select',{id,resultRevision:result.revision});
    reply.header('Cache-Control','no-store');return {settings:result};
  });
  app.post<{Body:{expectedRevision?:unknown}}>('/api/editor/theme/publish',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin']);
    if(!account)return;
    if(!themes)return reply.code(503).send({error:'Хранилище тем не настроено'});
    const {expectedRevision}=request.body??{};
    if(!Number.isSafeInteger(expectedRevision)||Number(expectedRevision)<1)
      return reply.code(400).send({error:'Укажите корректную версию темы'});
    const result=await themes.publish(Number(expectedRevision));
    if(!result)return reply.code(409).send({error:'Тема изменена другим сотрудником. Обновите список'});
    await store.audit(account.id,'theme.publish',{id:result.published,revision:result.revision});
    reply.header('Cache-Control','no-store');return {settings:result};
  });
  app.post<{Body:{enabled?:unknown;expectedRevision?:unknown}}>('/api/editor/theme/fullscreen',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin']);if(!account)return;
    if(!themes)return reply.code(503).send({error:'Хранилище тем не настроено'});
    const {enabled,expectedRevision}=request.body??{};
    if(typeof enabled!=='boolean'||!Number.isSafeInteger(expectedRevision)||Number(expectedRevision)<1)
      return reply.code(400).send({error:'Укажите логическое значение и корректную версию'});
    const result=await themes.setFullscreen(enabled,Number(expectedRevision));
    if(!result)return reply.code(409).send({error:'Настройки изменены другим сотрудником. Обновите страницу'});
    await store.audit(account.id,'theme.fullscreen',{enabled,revision:result.revision});
    reply.header('Cache-Control','no-store');return {settings:result};
  });
  app.post<{Body:{background?:unknown;glow?:unknown;expectedRevision?:unknown}}>(
    '/api/editor/theme/dk-colors',async(request,reply)=>{
      const account=await requireRole(request,reply,['admin']);if(!account)return;
      if(!themes)return reply.code(503).send({error:'Хранилище тем не настроено'});
      const {background,glow,expectedRevision}=request.body??{};
      if(!isHexColor(background)||!isHexColor(glow)||!Number.isSafeInteger(expectedRevision)||
        Number(expectedRevision)<1)return reply.code(400).send({error:'Нужны два цвета HEX и корректная версия'});
      const result=await themes.setDkColors(background,glow,Number(expectedRevision));
      if(!result)return reply.code(409).send({error:'Настройки изменены другим сотрудником. Обновите страницу'});
      await store.audit(account.id,'theme.dk-colors',{revision:result.revision});
      reply.header('Cache-Control','no-store');return {settings:result};
    });
  // Browser schedule editor: drafts are private, only published snapshots reach the kiosk.
  app.get('/api/editor/schedule', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor','viewer']);
    if (!account) return;
    if (!schedule) return reply.code(503).send({ error:'Расписание не настроено' });
    reply.header('Cache-Control','no-store');
    return { items: await schedule.listDrafts() };
  });
  app.post<{ Body: {fields?: unknown} }>('/api/editor/schedule', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor']);
    if (!account) return;
    if (!schedule) return reply.code(503).send({ error:'Расписание не настроено' });
    let fields;
    try { fields = validateScheduleFields(request.body?.fields); }
    catch(e) { return reply.code(400).send({error: e instanceof Error ? e.message : 'Некорректные поля'}); }
    const item = await schedule.create(fields);
    await store.audit(account.id,'schedule.create',{id:item.id});
    reply.header('Cache-Control','no-store');
    return reply.code(201).send({item});
  });
  app.patch<{ Params:{id:string}; Body:{expectedRevision?:number;fields?:unknown} }>('/api/editor/schedule/:id', async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor']);
    if(!account)return;
    if(!schedule)return reply.code(503).send({error:'Расписание не настроено'});
    if(!ID.test(request.params.id)||!Number.isSafeInteger(request.body?.expectedRevision)||Number(request.body?.expectedRevision)<1)
      return reply.code(400).send({error:'Неверный ID или версия записи'});
    let fields;
    try {fields=validateScheduleFields(request.body?.fields);}
    catch(e) {return reply.code(400).send({error:e instanceof Error?e.message:'Некорректные поля'});}
    const item=await schedule.save(request.params.id,Number(request.body.expectedRevision),fields);
    if(!item)return reply.code(409).send({error:'Карточка уже изменена или удалена. Сначала обновите список'});
    await store.audit(account.id,'schedule.save',{id:item.id,revision:item.revision});
    reply.header('Cache-Control','no-store');return {item};
  });
  app.post<{ Params:{id:string}; Body:{expectedRevision?:number} }>('/api/editor/schedule/:id/publish',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin','editor']);
    if(!account)return;
    if(!schedule)return reply.code(503).send({error:'Расписание не настроено'});
    if(!ID.test(request.params.id)||!Number.isSafeInteger(request.body?.expectedRevision)||Number(request.body?.expectedRevision)<1)
      return reply.code(400).send({error:'Неверная версия карточки'});
    const item=await schedule.publish(request.params.id,Number(request.body.expectedRevision));
    if(!item)return reply.code(409).send({error:'Карточка изменилась. Обновите список'});
    await store.audit(account.id,'schedule.publish',{id:item.id,revision:item.revision});
    reply.header('Cache-Control','no-store');return {item};
  });
  app.delete<{ Params:{id:string}; Body:{expectedRevision?:number} }>('/api/editor/schedule/:id',async(request,reply)=>{
    const account=await requireRole(request,reply,['admin']);
    if(!account)return;
    if(!schedule)return reply.code(503).send({error:'Расписание не настроено'});
    if(!ID.test(request.params.id)||!Number.isSafeInteger(request.body?.expectedRevision)||Number(request.body?.expectedRevision)<1)
      return reply.code(400).send({error:'Неверная версия карточки'});
    const removed=await schedule.archive(request.params.id,Number(request.body.expectedRevision));
    if(!removed)return reply.code(409).send({error:'Карточка уже изменена. Обновите список'});
    await store.audit(account.id,'schedule.delete',{id:request.params.id});
    return {status:'ok'};
  });
  // Posters are discovered directly from the configured local folder.
  app.get('/api/public/posters', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return posters ? await posters.list() : { posters: [], ignored: 0 };
  });
  app.get<{ Params: { name: string } }>('/api/public/posters/:name/file', async (request, reply) => {
    const media = await posters?.media(request.params.name);
    if (!media) return reply.code(404).send({ error: 'Материал не найден' });
    reply.header('Content-Type', media.mime);
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Length', media.sizeBytes);
    return reply.send(posterFileStream(media.filePath));
  });
  app.post<{ Body: { name?: string; base64?: string } }>('/api/editor/posters', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor']);
    if (!account) return;
    if (!posters) return reply.code(503).send({ error: 'Папка афиш не настроена' });
    if (typeof request.body?.name !== 'string' || typeof request.body?.base64 !== 'string')
      return reply.code(400).send({ error: 'Укажите файл изображения' });
    try {
      const item = await posters.upload(request.body.name, request.body.base64);
      await store.audit(account.id, 'poster.upload', { name: item.name, bytes: item.sizeBytes });
      return reply.code(201).send({ poster: item });
    } catch (error) {
      if (error instanceof Error && ['INVALID_FILENAME','INVALID_MEDIA','UPLOAD_IMAGE_ONLY'].includes(error.message))
        return reply.code(400).send({ error: 'Нужен корректный JPG, PNG или WebP размером до 8 МБ' });
      throw error;
    }
  });
  app.delete<{ Params: { name: string } }>('/api/editor/posters/:name', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor']);
    if (!account) return;
    if (!posters) return reply.code(503).send({ error: 'Папка афиш не настроена' });
    const removed = await posters.remove(request.params.name);
    if (!removed) return reply.code(404).send({ error: 'Афиша не найдена' });
    await store.audit(account.id, 'poster.delete', { name: request.params.name });
    return { status: 'ok' };
  });
  app.get<{ Params: { slug: string } }>('/api/public/pages/:slug', async (request, reply) => {
    if (!ID.test(request.params.slug)) return reply.code(400).send({ error: 'Некорректный адрес страницы' });
    const page = await store.getPublishedBySlug(request.params.slug);
    if (!page) return reply.code(404).send({ error: 'Страница не опубликована' });
    return { page };
  });
  app.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string'
      || body.username.length > 80 || body.password.length > 128) return reply.code(400).send({ error: 'Неправильный формат' });
    const username = body.username.trim().toLowerCase();
    if (!ID.test(username)) return reply.code(400).send({ error: 'Некорректное имя пользователя' });
    const key = `${request.ip}:${username}`;
    const now = Date.now();
    const attempt = failedLogins.get(key) ?? { count: 0, windowStart: now };
    if (now - attempt.windowStart > 15 * 60_000) { attempt.count = 0; attempt.windowStart = now; }
    if (attempt.count >= 8) return reply.code(429).send({ error: 'Слишком много попыток. Повторите через 15 минут' });
    const account = await store.findAccountByUsername(username);
    const valid = account?.enabled ? await verifyPassword(body.password, account.password_hash) : false;
    if (!valid || !account) {
      attempt.count += 1; failedLogins.set(key, attempt);
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }
    failedLogins.delete(key);
    const token = createSessionToken();
    await store.createSession(tokenHash(token), account.id, new Date(now + MAX_AGE_S * 1000));
    reply.header('Set-Cookie', cookieHeader(token, cookieSecure, MAX_AGE_S));
    reply.header('Cache-Control', 'no-store');
    await store.audit(account.id, 'login', { username: account.username });
    return { user: userPublic(account) };
  });
  app.get('/api/auth/me', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor','viewer']);
    if (!account) return;
    reply.header('Cache-Control', 'no-store');
    return { user: userPublic(account) };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const raw = readCookie(request, cookieName(cookieSecure));
    if (raw) await store.deleteSession(tokenHash(raw));
    reply.header('Set-Cookie', cookieHeader('', cookieSecure, 0));
    reply.header('Cache-Control', 'no-store');
    return { status: 'ok' };
  });
  app.get('/api/editor/pages', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor','viewer']);
    if (!account) return;
    reply.header('Cache-Control','no-store');
    return { pages: await store.listPages() };
  });
  app.patch<{ Params: { id: string }; Body: PublicContent & { expectedRevision: number } }>('/api/editor/pages/:id', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor']);
    if (!account) return;
    const { id } = request.params; const body = request.body;
    if (!ID.test(id) || !body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1
      || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 140
      || typeof body.body !== 'string' || body.body.length > 100_000)
      return reply.code(400).send({ error: 'Проверьте название, содержимое и версию страницы' });
    const page = await store.updateDraft(id, body.expectedRevision, { title: body.title.trim(), body: body.body }, account.id);
    if (!page) return reply.code(409).send({ error: 'Страница была изменена. Обновите данные перед повторной правкой' });
    await store.audit(account.id, 'page.update', { pageId: id, revision: page.revision });
    reply.header('Cache-Control', 'no-store');
    return { page };
  });
  app.post<{ Params: { id: string }; Body: { expectedRevision: number } }>('/api/editor/pages/:id/publish', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin']);
    if (!account) return;
    const { id } = request.params; const body = request.body;
    if (!ID.test(id) || !body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1)
      return reply.code(400).send({ error: 'Некорректная версия публикации' });
    const page = await store.publish(id, body.expectedRevision, account.id);
    if (!page) return reply.code(409).send({ error: 'Страница изменилась. Обновите данные' });
    await store.audit(account.id, 'page.publish', { pageId: id, revision: page.revision });
    return { page };
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) return reply.code(error.statusCode).send({ error: error.message });
    request.log.error({ error }, 'server error');
    return reply.code(500).send({ error: 'Внутренняя ошибка. Обратитесь к администратору' });
  });
  return app;
}
