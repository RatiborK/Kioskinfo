// desktop/preload.cjs — narrow OS integration; no Node/filesystem exposure to pages.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const showKeyboard = () => ipcRenderer.invoke('navikultura:keyboard');
contextBridge.exposeInMainWorld('navikulturaDesktop', Object.freeze({
  showKeyboard,
  setupAdmin: password => ipcRenderer.invoke('navikultura:setup', password),
}));

// Touch-only keyboard discovery for the many editor forms. Avoid popping OSK
// when somebody is using a mouse on a desktop PC. The ticket iframe has its
// own explicit OSK button because cross-origin focus events cannot bubble out.
let lastTouch = 0;
let lastKeyboard = 0;
document.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') lastTouch = Date.now();
}, { capture: true, passive: true });
document.addEventListener('focusin', event => {
  const element = event.target;
  if (!element || !(element instanceof HTMLElement)) return;
  if (Date.now() - lastTouch > 2500 || Date.now() - lastKeyboard < 1600) return;
  const editable = element.matches('textarea,[contenteditable="true"]') ||
    (element.matches('input') && !['checkbox','radio','file','button','submit','color','range','hidden','date','time']
      .includes(element.getAttribute('type') || 'text'));
  if (!editable) return;
  lastKeyboard = Date.now();
  void showKeyboard().catch(() => {});
}, { capture: true });
