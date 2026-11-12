// apps/api/src/app.test.ts — isolated API tests; no PostgreSQL or network ports.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';
import { hashPassword, tokenHash, verifyPassword } from './crypto.js';
import type { Account, Page, PublicContent, Session, Store } from './model.js';
import { FolderPosterRepository } from './posters.js';
import { FileScheduleRepository } from './schedule-file.js';
import { defaultScheduleFields, type ScheduleRepository } from './schedule.js';
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
async function fixture(role:'admin'|'editor'|'viewer'='admin', posters?:FolderPosterRepository, schedule?:ScheduleRepository){
  const store=new MemoryStore();store.accounts=[{id:'account1',username:'worker',display_name:'Сотрудник',role,password_hash:await hashPassword('some-strong-password-123'),enabled:true}];
  const app=createApp({store,posters,schedule,allowedOrigin:'http://127.0.0.1:5173'});
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
