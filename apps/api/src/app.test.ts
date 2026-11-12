// apps/api/src/app.test.ts — isolated API tests; no PostgreSQL or network ports.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';
import { hashPassword, tokenHash, verifyPassword } from './crypto.js';
import type { Account, Page, PublicContent, Session, Store } from './model.js';

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
async function fixture(role:'admin'|'editor'|'viewer'='admin'){
  const store=new MemoryStore();store.accounts=[{id:'account1',username:'worker',display_name:'Сотрудник',role,password_hash:await hashPassword('some-strong-password-123'),enabled:true}];
  const app=createApp({store,allowedOrigin:'http://127.0.0.1:5173'});
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
