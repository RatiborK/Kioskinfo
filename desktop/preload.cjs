// desktop/preload.cjs — narrow IPC surface; renderers cannot access Node or filesystem.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('navikulturaDesktop', Object.freeze({
  showKeyboard: () => ipcRenderer.invoke('navikultura:keyboard'),
  setupAdmin: password => ipcRenderer.invoke('navikultura:setup', password),
}));
