// apps/web/src/utils/branding.test.ts — prevent regressions to logo, icon frames or one-tone menu graphics.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const read = (file:string)=>readFile(new URL(file,import.meta.url),'utf8');
const sections=['posters','groups','calendar','documents','safety','about','contacts','navigation'] as const;
const themes=['dk','holiday','modern','aurora','poster','gallery','neon','kids'] as const;

test('all eight visitor sections use the single dual-color SVG component',async()=>{
  const icon=await read('../components/KioskMenuIcon.vue');
  const screen=await read('../views/ScreenView.vue');
  for(const name of sections){
    assert.ok(icon.includes(`name==='${name}'`),`No SVG variant for ${name}`);
    assert.ok(screen.includes(`id:'${name}'`),`Missing kiosk section ${name}`);
  }
  assert.match(icon,/class="menu-icon-primary"/);
  assert.match(icon,/class="menu-icon-secondary"/);
  assert.match(icon,/class="menu-icon-secondary-solid"/);
  assert.match(screen,/<KioskMenuIcon :name="item.id"\s*\/>/);
  assert.doesNotMatch(screen,/item\.icon/);
});

test('visitor themes each supply distinct primary and secondary icon colors',async()=>{
  const css=await read('../visitor-themes.css');
  for(const theme of themes){
    const selector=`:is(.screen-shell,.visitor-theme-preview)[data-visitor-theme="${theme}"]{\n  --nav-icon-primary:`;
    const start=css.indexOf(selector);
    assert.ok(start>=0,`Missing ${theme} two-tone palette`);
    const block=css.slice(start,css.indexOf('}',start)+1);
    for(const variable of ['--nav-icon-primary:','--nav-icon-secondary:','--nav-icon-primary-active:','--nav-icon-secondary-active:']){
      assert.ok(block.includes(variable),`${theme}: missing ${variable}`);
    }
    const primary=/--nav-icon-primary:(#[0-9a-f]{6})/.exec(block)?.[1];
    const secondary=/--nav-icon-secondary:(#[0-9a-f]{6})/.exec(block)?.[1];
    assert.ok(primary&&secondary&&primary!==secondary,`${theme}: two inks must be different`);
  }
});

test('DK logo appears in both visitor and staff header with no data dependency',async()=>{
  const svg=await read('../components/DkLogo.vue');
  const screen=await read('../views/ScreenView.vue');
  const editor=await read('../views/EditorView.vue');
  assert.match(svg,/КИРОВСКИЙ/);
  assert.match(svg,/ДВОРЕЦ КУЛЬТУРЫ/);
  assert.match(svg,/viewBox="0 0 424 96"/);
  assert.match(screen,/<DkLogo class="kiosk-dk-logo"\s*\/>/);
  assert.match(editor,/<DkLogo class="editor-brand-logo"\s*\/>/);
  assert.doesNotMatch(screen,/class="brand-glyph"/);
});

test('menu icon surfaces are frameless and themed, while theme previews show actual icons',async()=>{
  const css=await read('../stage056.css');
  const preview=await read('../components/VisitorThemeEditor.vue');
  const block=css.slice(css.indexOf('/* Stage 05.7: every menu pictogram'),css.indexOf('/* A catalog outage'));
  assert.ok(block.includes('border:0'));
  assert.ok(block.includes('background:transparent'));
  assert.ok(block.includes('var(--nav-icon-primary)'));
  assert.ok(block.includes('var(--nav-icon-secondary)'));
  assert.match(preview,/<KioskMenuIcon name="calendar"\s*\/>/);
  assert.doesNotMatch(preview,/Расписание<\/span>/);
});
