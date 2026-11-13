// apps/api/src/themes.test.ts — global theme selection, consistency and local durability.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileThemeRepository,THEME_NAMES,VISITOR_THEME_IDS,isThemeId} from './themes.js';

test('exactly eight curated themes; arbitrary ids are rejected',()=>{
  assert.equal(VISITOR_THEME_IDS.length,8);
  assert.equal(new Set(VISITOR_THEME_IDS).size,8);
  for(const id of VISITOR_THEME_IDS)assert.ok(THEME_NAMES[id].length>3);
  assert.equal(isThemeId('holiday'),true);
  assert.equal(isThemeId('custom-css'),false);
  assert.equal(isThemeId('<script>'),false);
});
test('choice is a draft; only publishing changes kiosk theme, and revisions guard writes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-theme-test-'));const path=join(dir,'visitor-theme.json');
  try{
    const repo=new FileThemeRepository(path);
    assert.equal((await repo.get()).published,'dk');
    const chosen=await repo.choose('holiday',1);
    assert.equal(chosen?.revision,2);
    assert.equal(chosen?.draft,'holiday');
    assert.equal((await repo.get()).published,'dk');
    assert.equal(await repo.choose('neon',1),null);
    assert.equal(await repo.publish(1),null);
    const updated=await repo.publish(2);
    assert.equal(updated?.published,'holiday');
    assert.equal(updated?.published_revision,2);
    const restored=new FileThemeRepository(path);
    assert.equal((await restored.get()).published,'holiday');
    const saved=await restored.choose('aurora',2);
    assert.equal(saved?.revision,3);
    assert.equal((await restored.get()).published,'holiday');
    assert.equal((await restored.get()).draft,'aurora');
    assert.equal((await restored.publish(3))?.published,'aurora');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('corrupt file does not get overwritten or clear last published choice',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-theme-corrupt-'));const path=join(dir,'visitor-theme.json');
  try{
    const repo=new FileThemeRepository(path);
    await repo.choose('neon',1);await repo.publish(2);
    await writeFile(path,'{broken');
    assert.equal((await repo.get()).published,'neon');
    await assert.rejects(()=>repo.choose('dk',2));
    assert.equal(await readFile(path,'utf8'),'{broken');
    const fresh=new FileThemeRepository(path);
    await assert.rejects(()=>fresh.publish(2));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('fullscreen preference persists, defaults off and keeps old theme snapshots valid',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-fullscreen-'));
  const filename=join(dir,'theme.json');
  try{
    const repo=new FileThemeRepository(filename);
    assert.equal((await repo.get()).fullscreenEnabled,false);
    const enabled=await repo.setFullscreen(true,1);
    assert.equal(enabled?.fullscreenEnabled,true);
    assert.equal(enabled?.revision,2);
    assert.equal(await repo.setFullscreen(false,1),null);
    assert.equal((await new FileThemeRepository(filename).get()).fullscreenEnabled,true);
    const published=await repo.publish(2);
    assert.equal(published?.fullscreenEnabled,true);
    const legacy={draft:'dk',published:'dk',revision:7,published_revision:6,
      updatedAt:new Date().toISOString()};
    await writeFile(filename,JSON.stringify(legacy));
    assert.equal((await new FileThemeRepository(filename).get()).fullscreenEnabled,false);
    await assert.rejects(()=>repo.setFullscreen('yes' as unknown as boolean,7));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('DK background and glow persist independently and refuse injected colors',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-dk-palette-'));
  try{
    const file=join(dir,'palette.json'),repo=new FileThemeRepository(file);
    const first=await repo.setDkColors('#1A2637','#E3A12F',1);
    assert.equal(first?.dkBackground,'#1a2637');
    assert.equal(first?.dkGlow,'#e3a12f');
    assert.equal(first?.revision,2);
    assert.equal(await repo.setDkColors('#eeeeee','#eeeeee',1),null);
    const next=new FileThemeRepository(file);
    assert.equal((await next.get()).dkGlow,'#e3a12f');
    await assert.rejects(()=>next.setDkColors('#000000; color:red','#abcdef',2),/Недопустимые/);
    await assert.rejects(()=>next.setDkColors('#abcdef','red',2),/Недопустимые/);
    assert.equal((await next.get()).dkBackground,'#1a2637');
  }finally{await rm(dir,{recursive:true,force:true});}
});
