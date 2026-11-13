// apps/api/src/app.test.ts — isolated API tests; no PostgreSQL or network ports.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';
import { hashPassword, tokenHash, verifyPassword } from './crypto.js';
import type { Account, Page, PublicContent, Session, Store } from './model.js';
import { FolderPosterRepository } from './posters.js';
import { FileScheduleRepository } from './schedule-file.js';
import { defaultScheduleFields, type ScheduleRepository } from './schedule.js';
import { FileThemeRepository } from './themes.js';
import { FileEventsRepository } from './events.js';
import { FolderDocumentsRepository } from './documents.js';
import {FileCultureRepository,CultureMedia,CultureVideos,defaultCultureState} from './culture.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class MemoryStore implements Store {
  accounts: Account[] = [];
  sessions = new Map<string, Session>();
  pages: Page[] = [{id:'page1',slug:'welcome',title:'Привет',body:'Исходный текст',revision:1,published:{title:'Привет',body:'Исходный текст'},published_revision:1,updated_at:new Date().toISOString()}];
  events: string[] = [];
  async findAccountByUsername(name:string){return this.accounts.find(a=>a.username===name)||null;}
  async findAccountById(id:string){return this.accounts.find(a=>a.id===id)||null;}
  async createSession(hash:string,id:string,expiresAt:Date){this.sessions.set(hash,{account_id:id,expires_at:expiresAt.toISOString()});}
  async getSession(hash:string){const s=this.sessions.get(hash);return s && new Date(s.expires_at)>new Date()?s:null;}
  async deleteSession(hash:string){this.sessions.delete(hash);}
  async listPages(){return this.pages.map(x=>structuredClone(x));}
  async getPage(id:string){return structuredClone(this.pages.find(p=>p.id===id||p.slug===id)||null);}
  async getPublishedBySlug(slug:string){return structuredClone(this.pages.find(p=>p.slug===slug)?.published||null);}
  async updateDraft(id:string,expected:number,content:PublicContent){const p=this.pages.find(p=>p.id===id||p.slug===id);if(!p||p.revision!==expected)return null;Object.assign(p,content,{revision:p.revision+1});return structuredClone(p);}
  async publish(id:string,expected:number){const p=this.pages.find(p=>p.id===id||p.slug===id);if(!p||p.revision!==expected)return null;p.published={title:p.title,body:p.body};p.published_revision=p.revision;return structuredClone(p);}
  async audit(_:string|null,action:string){this.events.push(action);}
}
const headers={'content-type':'application/json','x-navikultura-action':'1'};
const loginBody=(username:string,password:string)=>({method:'POST' as const,url:'/api/auth/login',headers,payload:{username,password}});
async function fixture(role:'admin'|'editor'|'viewer'='admin', posters?:FolderPosterRepository, schedule?:ScheduleRepository, videos?:CultureVideos){
  const store=new MemoryStore();store.accounts=[{id:'account1',username:'worker',display_name:'Сотрудник',role,password_hash:await hashPassword('some-strong-password-123'),enabled:true}];
  const app=createApp({store,posters,schedule,videos,allowedOrigin:'http://127.0.0.1:5173'});
  const login=await app.inject(loginBody('worker','some-strong-password-123'));
  assert.equal(login.statusCode,200);
  const cookie=login.headers['set-cookie'];assert.equal(typeof cookie,'string');
  return {app,store,cookie:String(cookie).split(';')[0]};
}
test('scrypt stores no plaintext and rejects bad password',async()=>{
  const secret='correct-password-123';const digest=await hashPassword(secret);
  assert.equal(digest.includes(secret),false);
  assert.equal(await verifyPassword(secret,digest),true);
  assert.equal(await verifyPassword('wrong',digest),false);
});
test('health and public navigation are available without login',async()=>{
  const app=createApp({store:new MemoryStore()});
  try{const health=await app.inject({method:'GET',url:'/api/health'});assert.equal(health.statusCode,200);assert.equal(health.json().phase,'stage-01');
    const menu=await app.inject({method:'GET',url:'/api/public/navigation'});assert.equal(menu.json().status,'demo');}
  finally{await app.close();}
});
test('anonymous editing and login without required header are denied',async()=>{
  const app=createApp({store:new MemoryStore()});
  try{const r=await app.inject({method:'PATCH',url:'/api/editor/pages/page1',headers,payload:{title:'x',body:'y',expectedRevision:1}});assert.equal(r.statusCode,401);
    const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'worker',password:'123'}});assert.equal(login.statusCode,403);}
  finally{await app.close();}
});
test('wrong credentials return 401 without session',async()=>{
  const store=new MemoryStore();store.accounts=[{id:'a',username:'worker',display_name:'Editor',role:'editor',password_hash:await hashPassword('some-strong-password-123'),enabled:true}];
  const app=createApp({store});
  try{const res=await app.inject(loginBody('worker','wrongpassword'));assert.equal(res.statusCode,401);assert.equal(res.headers['set-cookie'],undefined);}
  finally{await app.close();}
});
test('admin saves drafts with revision guard and publishes atomically',async()=>{
  const {app,cookie,store}=await fixture();
  try{const update=await app.inject({method:'PATCH',url:'/api/editor/pages/page1',headers:{...headers,cookie},payload:{title:'Новое',body:'Новый текст',expectedRevision:1}});assert.equal(update.statusCode,200);
    assert.equal(update.json().page.revision,2);
    const before=await app.inject({method:'GET',url:'/api/public/pages/welcome'});assert.equal(before.json().page.title,'Привет');
    const conflict=await app.inject({method:'PATCH',url:'/api/editor/pages/page1',headers:{...headers,cookie},payload:{title:'Конфликт',body:'x',expectedRevision:1}});assert.equal(conflict.statusCode,409);
    const published=await app.inject({method:'POST',url:'/api/editor/pages/page1/publish',headers:{...headers,cookie},payload:{expectedRevision:2}});assert.equal(published.statusCode,200);
    const after=await app.inject({method:'GET',url:'/api/public/pages/welcome'});assert.equal(after.json().page.title,'Новое');
    assert.deepEqual(store.events,['login','page.update','page.publish']);
  }finally{await app.close();}
});
test('viewer cannot change page, editor cannot publish',async()=>{
  const view=await fixture('viewer');
  try{const r=await view.app.inject({method:'PATCH',url:'/api/editor/pages/page1',headers:{...headers,cookie:view.cookie},payload:{title:'x',body:'y',expectedRevision:1}});assert.equal(r.statusCode,403);}
  finally{await view.app.close();}
  const editor=await fixture('editor');
  try{const r=await editor.app.inject({method:'POST',url:'/api/editor/pages/page1/publish',headers:{...headers,cookie:editor.cookie},payload:{expectedRevision:1}});assert.equal(r.statusCode,403);}
  finally{await editor.app.close();}
});
test('malicious Origin is rejected for state-changing requests',async()=>{
  const {app,cookie}=await fixture();try{
    const r=await app.inject({method:'PATCH',url:'/api/editor/pages/page1',headers:{...headers,cookie,origin:'https://attacker.example'},payload:{title:'x',body:'y',expectedRevision:1}});assert.equal(r.statusCode,403);
  }finally{await app.close();}
});
test('logout invalidates cookie session',async()=>{
  const {app,cookie}=await fixture();try{
    const before=await app.inject({method:'GET',url:'/api/auth/me',headers:{cookie}});assert.equal(before.statusCode,200);
    const logout=await app.inject({method:'POST',url:'/api/auth/logout',headers:{...headers,cookie},payload:{}});assert.equal(logout.statusCode,200);
    const after=await app.inject({method:'GET',url:'/api/auth/me',headers:{cookie}});assert.equal(after.statusCode,401);
  }finally{await app.close();}
});

test('poster API is public to view but protected for modifications', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-api-posters-'));
  const posters=new FolderPosterRepository(dir);
  const app=createApp({store:new MemoryStore(),posters,allowedOrigin:'http://127.0.0.1:5173'});
  try {
    const listing=await app.inject({method:'GET',url:'/api/public/posters'});
    assert.equal(listing.statusCode,200);assert.deepEqual(listing.json().posters,[]);
    const anonymous=await app.inject({method:'POST',url:'/api/editor/posters',headers,payload:{name:'test.png',base64:'abc='}});
    assert.equal(anonymous.statusCode,401);
    const traversal=await app.inject({method:'GET',url:'/api/public/posters/..%2Fsecret.png/file'});
    assert.equal(traversal.statusCode,404);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('admin can upload and delete a verified poster, viewer cannot',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-api-posters-'));
  const posters=new FolderPosterRepository(dir);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXjoAAAAASUVORK5CYII=';
  const admin=await fixture('admin',posters);
  try {
    const upload=await admin.app.inject({method:'POST',url:'/api/editor/posters',headers:{...headers,cookie:admin.cookie},payload:{name:'Концерт.png',base64:png}});
    assert.equal(upload.statusCode,201);
    const item=upload.json().poster;
    assert.equal(item.kind,'image');
    const bytes=await admin.app.inject({method:'GET',url:item.url});
    assert.equal(bytes.statusCode,200);assert.equal(bytes.headers['content-type'],'image/png');
    const listing=await admin.app.inject({method:'GET',url:'/api/public/posters'});
    assert.equal(listing.json().posters.length,1);
    const removal=await admin.app.inject({method:'DELETE',url:'/api/editor/posters/'+encodeURIComponent(item.name),headers:{...headers,cookie:admin.cookie},payload:{}});
    assert.equal(removal.statusCode,200);
    assert.deepEqual(admin.store.events,['login','poster.upload','poster.delete']);
  }finally{await admin.app.close();await rm(dir,{recursive:true,force:true});}
});

test('schedule API rejects guests, hides drafts, and publishes only authorized updates',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-schedule-api-'));
  try{
    const schedule=new FileScheduleRepository(join(dir,'records.json'));
    const admin=await fixture('admin',undefined,schedule);
    try{
      const forbidden=await admin.app.inject({method:'POST',url:'/api/editor/schedule',headers,
        payload:{fields:defaultScheduleFields('Танцы','Вдохновение')}});
      assert.equal(forbidden.statusCode,401);
      const created=await admin.app.inject({method:'POST',url:'/api/editor/schedule',headers:{...headers,cookie:admin.cookie},
        payload:{fields:defaultScheduleFields('Танцы','Вдохновение')}});
      assert.equal(created.statusCode,201);
      const item=created.json().item;
      const invisible=await admin.app.inject({method:'GET',url:'/api/public/schedule'});
      assert.equal(invisible.json().entries.length,0);
      const saved=await admin.app.inject({method:'PATCH',url:'/api/editor/schedule/'+item.id,
        headers:{...headers,cookie:admin.cookie},payload:{fields:{...item,leader:'Иванова'},expectedRevision:1}});
      assert.equal(saved.statusCode,200);
      const stale=await admin.app.inject({method:'PATCH',url:'/api/editor/schedule/'+item.id,
        headers:{...headers,cookie:admin.cookie},payload:{fields:{...item,leader:'Неверно'},expectedRevision:1}});
      assert.equal(stale.statusCode,409);
      const pub=await admin.app.inject({method:'POST',url:'/api/editor/schedule/'+item.id+'/publish',
        headers:{...headers,cookie:admin.cookie},payload:{expectedRevision:2}});
      assert.equal(pub.statusCode,200);
      const publicList=await admin.app.inject({method:'GET',url:'/api/public/schedule'});
      assert.equal(publicList.json().entries[0].leader,'Иванова');
      const removed=await admin.app.inject({method:'DELETE',url:'/api/editor/schedule/'+item.id,
        headers:{...headers,cookie:admin.cookie},payload:{expectedRevision:2}});
      assert.equal(removed.statusCode,200);
      assert.equal((await admin.app.inject({method:'GET',url:'/api/public/schedule'})).json().entries.length,0);
    }finally{await admin.app.close();}
    const viewer=await fixture('viewer',undefined,schedule);
    try{const no=await viewer.app.inject({method:'POST',url:'/api/editor/schedule',
      headers:{...headers,cookie:viewer.cookie},payload:{fields:defaultScheduleFields('X','Y')}});
      assert.equal(no.statusCode,403);
    }finally{await viewer.app.close();}
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('visitor theme API authenticates writes and displays only the published choice',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-theme-api-'));
  const themes=new FileThemeRepository(join(dir,'theme.json'));
  const store=new MemoryStore();
  store.accounts=[{id:'admint',username:'themesadmin',display_name:'Админ',role:'admin',
    password_hash:await hashPassword('secure-test-password-2026'),enabled:true}];
  const app=createApp({store,themes,allowedOrigin:'http://127.0.0.1:5173'});
  try{
    const initial=await app.inject({method:'GET',url:'/api/public/theme'});
    assert.equal(initial.statusCode,200);assert.equal(initial.json().theme,'dk');
    const anon=await app.inject({method:'PATCH',url:'/api/editor/theme',headers,payload:{id:'holiday',expectedRevision:1}});
    assert.equal(anon.statusCode,401);
    const login=await app.inject(loginBody('themesadmin','secure-test-password-2026'));
    assert.equal(login.statusCode,200);
    const cookie=String(login.headers['set-cookie']).split(';')[0];
    const save=await app.inject({method:'PATCH',url:'/api/editor/theme',headers:{...headers,cookie},
      payload:{id:'holiday',expectedRevision:1}});
    assert.equal(save.statusCode,200);
    assert.equal(save.json().settings.revision,2);
    const old=await app.inject({method:'GET',url:'/api/public/theme'});
    assert.equal(old.json().theme,'dk');
    const conflict=await app.inject({method:'PATCH',url:'/api/editor/theme',headers:{...headers,cookie},
      payload:{id:'neon',expectedRevision:1}});
    assert.equal(conflict.statusCode,409);
    const injection=await app.inject({method:'PATCH',url:'/api/editor/theme',headers:{...headers,cookie},
      payload:{id:'<style>hack</style>',expectedRevision:2}});
    assert.equal(injection.statusCode,400);
    const publish=await app.inject({method:'POST',url:'/api/editor/theme/publish',headers:{...headers,cookie},
      payload:{expectedRevision:2}});
    assert.equal(publish.statusCode,200);
    const active=await app.inject({method:'GET',url:'/api/public/theme'});
    assert.equal(active.json().theme,'holiday');
    assert.equal(active.json().fullscreenEnabled,false);
    const enabled=await app.inject({method:'POST',url:'/api/editor/theme/fullscreen',
      headers:{...headers,cookie},payload:{enabled:true,expectedRevision:2}});
    assert.equal(enabled.statusCode,200);
    assert.equal(enabled.json().settings.fullscreenEnabled,true);
    assert.equal((await app.inject({method:'GET',url:'/api/public/theme'})).json().fullscreenEnabled,true);
    const stale=await app.inject({method:'POST',url:'/api/editor/theme/fullscreen',
      headers:{...headers,cookie},payload:{enabled:false,expectedRevision:2}});
    assert.equal(stale.statusCode,409);
    const invalid=await app.inject({method:'POST',url:'/api/editor/theme/fullscreen',
      headers:{...headers,cookie},payload:{enabled:'yes',expectedRevision:3}});
    assert.equal(invalid.statusCode,400);
    const palette=await app.inject({method:'POST',url:'/api/editor/theme/dk-colors',
      headers:{...headers,cookie},payload:{background:'#123456',glow:'#abcdef',expectedRevision:3}});
    assert.equal(palette.statusCode,200);
    assert.equal(palette.json().settings.revision,4);
    const publicColors=(await app.inject({method:'GET',url:'/api/public/theme'})).json();
    assert.equal(publicColors.dkBackground,'#123456');
    assert.equal(publicColors.dkGlow,'#abcdef');
    const colorsConflict=await app.inject({method:'POST',url:'/api/editor/theme/dk-colors',
      headers:{...headers,cookie},payload:{background:'#112233',glow:'#445566',expectedRevision:3}});
    assert.equal(colorsConflict.statusCode,409);
    const colorsInvalid=await app.inject({method:'POST',url:'/api/editor/theme/dk-colors',
      headers:{...headers,cookie},payload:{background:'red;background:url(x)',glow:'#445566',expectedRevision:4}});
    assert.equal(colorsInvalid.statusCode,400);
    assert.ok(store.events.includes('theme.select'));
    assert.ok(store.events.includes('theme.publish'));
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('viewer cannot select or publish theme',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-theme-viewer-'));
  const store=new MemoryStore();
  store.accounts=[{id:'view1',username:'viewer',display_name:'Читатель',role:'viewer',
    password_hash:await hashPassword('test-password-2026'),enabled:true}];
  const app=createApp({store,themes:new FileThemeRepository(join(dir,'themes.json')),
    allowedOrigin:'http://127.0.0.1:5173'});
  try{
    const login=await app.inject(loginBody('viewer','test-password-2026'));
    const cookie=String(login.headers['set-cookie']).split(';')[0];
    assert.equal((await app.inject({method:'GET',url:'/api/editor/theme',headers:{cookie}})).statusCode,200);
    assert.equal((await app.inject({method:'PATCH',url:'/api/editor/theme',headers:{...headers,cookie},
      payload:{id:'kids',expectedRevision:1}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/editor/theme/publish',headers:{...headers,cookie},
      payload:{expectedRevision:1}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/editor/theme/fullscreen',
      headers:{...headers,cookie},payload:{enabled:true,expectedRevision:1}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/editor/theme/dk-colors',
      headers:{...headers,cookie},payload:{background:'#123456',glow:'#abcdef',expectedRevision:1}})).statusCode,403);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('calendar and documents APIs protect editing and publish only approved event drafts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-content-routes-'));
  const store=new MemoryStore();
  store.accounts=[{id:'admin-docs',username:'admin_docs',display_name:'Админ',role:'admin',
    password_hash:await hashPassword('very-long-test-secret-2026'),enabled:true}];
  const events=new FileEventsRepository(join(dir,'events.json'));
  const documents=new FolderDocumentsRepository(join(dir,'docs'));
  const app=createApp({store,events,documents,allowedOrigin:'http://127.0.0.1:5173'});
  const fields={title:'Тестовое мероприятие',date:'2026-11-24',time:'18:00',
    type:'concert',venue:'hall',description:'Только тест'} as const;
  try{
    assert.equal((await app.inject({method:'GET',url:'/api/public/events'})).json().events.length,0);
    assert.equal((await app.inject({method:'GET',url:'/api/public/documents'})).json().documents.length,0);
    assert.equal((await app.inject({method:'POST',url:'/api/editor/events',headers,
      payload:{fields}})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/api/editor/documents',headers,
      payload:{title:'Прайс',category:'prices',name:'a.pdf',base64:Buffer.from('%PDF-1.0').toString('base64')}})).statusCode,401);
    const login=await app.inject(loginBody('admin_docs','very-long-test-secret-2026'));
    assert.equal(login.statusCode,200);
    const cookie=String(login.headers['set-cookie']).split(';')[0],authed={...headers,cookie};
    const created=await app.inject({method:'POST',url:'/api/editor/events',headers:authed,payload:{fields}});
    assert.equal(created.statusCode,201);const id=created.json().item.id;
    assert.equal((await app.inject({method:'GET',url:'/api/public/events'})).json().events.length,0);
    const invalid=await app.inject({method:'PATCH',url:'/api/editor/events/'+id,headers:authed,
      payload:{expectedRevision:1,fields:{...fields,type:'other',date:'2026-02-31'}}});
    assert.equal(invalid.statusCode,400);
    const publish=await app.inject({method:'POST',url:'/api/editor/events/'+id+'/publish',headers:authed,
      payload:{expectedRevision:1}});
    assert.equal(publish.statusCode,200);
    assert.equal((await app.inject({method:'GET',url:'/api/public/events'})).json().events[0].title,fields.title);
    const payload=Buffer.from('%PDF-1.7\n%integration-test\n').toString('base64');
    const uploaded=await app.inject({method:'POST',url:'/api/editor/documents',headers:authed,
      payload:{title:'Тестовый прейскурант',category:'prices',name:'price.pdf',base64:payload}});
    assert.equal(uploaded.statusCode,201);const docId=uploaded.json().document.id;
    const indexed=await app.inject({method:'GET',url:'/api/public/documents'});
    assert.equal(indexed.json().documents.length,1);
    const file=await app.inject({method:'GET',url:'/api/public/documents/'+docId+'/file'});
    assert.equal(file.statusCode,200);assert.match(String(file.headers['content-type']),/application\/pdf/);
    assert.equal((await app.inject({method:'GET',url:'/api/public/documents/'+docId+'/content'})).statusCode,404);
    const removed=await app.inject({method:'DELETE',url:'/api/editor/documents/'+docId,headers:authed,payload:{}});
    assert.equal(removed.statusCode,200);
    assert.equal((await app.inject({method:'GET',url:'/api/public/documents'})).json().documents.length,0);
    assert.ok(store.events.includes('events.publish'));assert.ok(store.events.includes('documents.upload'));
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('public cultural pages are seeded, staff edits stay in draft until admin publishes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-culture-api-'));
  const store=new MemoryStore();
  store.accounts=[{id:'cultureadmin',username:'cultureadmin',display_name:'Администратор',role:'admin',
    password_hash:await hashPassword('another-long-test-password-2026'),enabled:true}];
  const culture=new FileCultureRepository(join(dir,'catalog.json')),cultureMedia=new CultureMedia(join(dir,'images'));
  const app=createApp({store,culture,cultureMedia,allowedOrigin:'http://127.0.0.1:5173'});
  try{
    const initial=await app.inject({method:'GET',url:'/api/public/culture'});
    assert.equal(initial.statusCode,200);
    assert.ok(initial.json().content.collectives.length>=35);
    const anon=await app.inject({method:'PATCH',url:'/api/editor/culture',headers,
      payload:{content:initial.json().content,expectedRevision:1}});
    assert.equal(anon.statusCode,401);
    const login=await app.inject(loginBody('cultureadmin','another-long-test-password-2026'));
    assert.equal(login.statusCode,200);
    const cookie=String(login.headers['set-cookie']).split(';')[0],authed={...headers,cookie};
    const editor=await app.inject({method:'GET',url:'/api/editor/culture',headers:{cookie}});
    assert.equal(editor.statusCode,200);
    const draft=structuredClone(editor.json().state.draft);
    draft.about.intro='Новое вступление, ещё не опубликовано';
    const saved=await app.inject({method:'PATCH',url:'/api/editor/culture',headers:authed,
      payload:{content:draft,expectedRevision:1}});
    assert.equal(saved.statusCode,200);
    assert.equal(saved.json().state.revision,2);
    assert.notEqual((await app.inject({method:'GET',url:'/api/public/culture'})).json().content.about.intro,draft.about.intro);
    const conflict=await app.inject({method:'PATCH',url:'/api/editor/culture',headers:authed,
      payload:{content:draft,expectedRevision:1}});
    assert.equal(conflict.statusCode,409);
    const published=await app.inject({method:'POST',url:'/api/editor/culture/publish',headers:authed,
      payload:{expectedRevision:2}});
    assert.equal(published.statusCode,200);
    assert.equal((await app.inject({method:'GET',url:'/api/public/culture'})).json().content.about.intro,draft.about.intro);
    const image=Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
    const upload=await app.inject({method:'POST',url:'/api/editor/culture/photo',headers:authed,
      payload:{fileName:'portrait.png',base64:image}});
    assert.equal(upload.statusCode,201);
    assert.match(upload.json().url,/^\/api\/public\/culture\/media\//);
    assert.equal((await app.inject({method:'GET',url:upload.json().url})).statusCode,200);
    assert.ok(store.events.includes('culture.publish'));
    assert.ok(store.events.includes('culture.photo'));
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('viewer cannot edit or publish cultural content',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-culture-viewer-'));
  const store=new MemoryStore();
  store.accounts=[{id:'viewer-culture',username:'viewerculture',display_name:'Наблюдатель',role:'viewer',
    password_hash:await hashPassword('test-secret-for-viewer-2026'),enabled:true}];
  const app=createApp({store,culture:new FileCultureRepository(join(dir,'catalog.json')),
    cultureMedia:new CultureMedia(join(dir,'photos')),allowedOrigin:'http://127.0.0.1:5173'});
  try{
    const login=await app.inject(loginBody('viewerculture','test-secret-for-viewer-2026'));
    assert.equal(login.statusCode,200);
    const cookie=String(login.headers['set-cookie']).split(';')[0];
    const authed={...headers,cookie};
    assert.equal((await app.inject({method:'GET',url:'/api/editor/culture',headers:{cookie}})).statusCode,200);
    assert.equal((await app.inject({method:'PATCH',url:'/api/editor/culture',headers:authed,
      payload:{content:defaultCultureState().draft,expectedRevision:1}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/editor/culture/publish',headers:authed,
      payload:{expectedRevision:1}})).statusCode,403);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('public culture still loads if the legacy schedule repository throws',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-broken-schedule-'));
  const app=createApp({store:new MemoryStore(),
    culture:new FileCultureRepository(join(dir,'catalog.json')),
    schedule:{list:async()=>{throw Error('retired schedule corrupted');}} as unknown as ScheduleRepository});
  try{
    const r=await app.inject({method:'GET',url:'/api/public/culture'});
    assert.equal(r.statusCode,200);
    assert.ok(r.json().content.collectives.length>=35);
    assert.ok(r.json().content.leaders.length>=28);
    assert.ok(r.json().content.safety.sections.length>=17);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('admin can restore only missing base collectives, without publishing or granting editor rights',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-api-recover-'));
  const repo=new FileCultureRepository(join(dir,'catalog.json'));
  const before=await repo.get();
  const draft=structuredClone(before.draft);
  draft.collectives.shift();
  draft.collectives[0].history='Сохранённый авторский текст';
  const changed=await repo.update(draft,1);
  assert.equal(changed?.revision,2);
  const store=new MemoryStore();
  store.accounts=[{id:'culture-admin',username:'cultureadmin',display_name:'Редактор',
    role:'admin',password_hash:await hashPassword('some-strong-password-123'),enabled:true}];
  const app=createApp({store,culture:repo,allowedOrigin:'http://127.0.0.1:5173'});
  try{
    assert.equal((await app.inject({method:'POST',url:'/api/editor/culture/restore-starter',
      headers,payload:{expectedRevision:2}})).statusCode,401);
    const login=await app.inject(loginBody('cultureadmin','some-strong-password-123'));
    const cookie=String(login.headers['set-cookie']).split(';')[0];
    const restored=await app.inject({method:'POST',url:'/api/editor/culture/restore-starter',
      headers:{...headers,cookie},payload:{expectedRevision:2}});
    assert.equal(restored.statusCode,200);
    assert.equal(restored.json().added.collectives,1);
    assert.equal((await repo.get()).draft.collectives.length,before.draft.collectives.length);
    assert.equal((await repo.get()).draft.collectives.find(x=>x.id===draft.collectives[0].id)?.history,
      'Сохранённый авторский текст');
    assert.equal((await repo.get()).publishedRevision,1);
    assert.ok(store.events.includes('culture.restore-starter'));
    const again=await app.inject({method:'POST',url:'/api/editor/culture/restore-starter',
      headers:{...headers,cookie},payload:{expectedRevision:3}});
    assert.equal(again.statusCode,200);
    assert.equal(again.json().added.collectives,0);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('local MP4 upload uses authenticated binary body and ranged in-app streaming',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-local-video-'));
  const {app,cookie}=await fixture('admin',undefined,undefined,new CultureVideos(dir));
  try{
    const bytes=Buffer.concat([Buffer.from([0,0,0,16]),Buffer.from('ftypisom'),Buffer.alloc(96)]);
    const uploaded=await app.inject({method:'POST',url:'/api/editor/culture/video',
      headers:{cookie,'x-navikultura-action':'1','content-type':'application/octet-stream',
        'x-navikultura-file-name':'tour.mp4'},
      payload:bytes});
    assert.equal(uploaded.statusCode,201,uploaded.body);
    const url=uploaded.json().url as string;
    assert.match(url,/^\/api\/public\/culture\/video\/[a-f0-9-]{36}\.mp4$/);
    const full=await app.inject({method:'GET',url});
    assert.equal(full.statusCode,200);
    assert.equal(full.headers['content-type'],'video/mp4');
    assert.equal(full.headers['accept-ranges'],'bytes');
    assert.equal(full.headers['content-length'],String(bytes.length));
    const partial=await app.inject({method:'GET',url,headers:{range:'bytes=4-11'}});
    assert.equal(partial.statusCode,206);
    assert.equal(partial.headers['content-range'],`bytes 4-11/${bytes.length}`);
    assert.equal(partial.headers['content-length'],'8');
    assert.equal(partial.rawPayload.toString('ascii'),'ftypisom');
    assert.equal((await app.inject({method:'GET',url,headers:{range:'bytes=999-'}})).statusCode,416);
    const fake=await app.inject({method:'POST',url:'/api/editor/culture/video',
      headers:{cookie,'x-navikultura-action':'1','content-type':'application/octet-stream',
        'x-navikultura-file-name':'fake.mp4'},payload:Buffer.from('not a real MP4 file')});
    assert.equal(fake.statusCode,400);
    const unauth=await app.inject({method:'POST',url:'/api/editor/culture/video',
      headers:{'x-navikultura-action':'1','content-type':'application/octet-stream',
        'x-navikultura-file-name':'tour.mp4'},payload:bytes});
    assert.equal(unauth.statusCode,401);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
