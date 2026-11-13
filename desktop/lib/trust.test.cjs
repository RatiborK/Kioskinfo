// desktop/lib/trust.test.cjs — IPC validation must allow real main frames and reject iframes.
'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {sameMainFrame,sameFile,sameLocalPage,trustedFrame}=require('./trust.cjs');

const file=path.join(process.cwd(),'desktop','first-run.html');
const setupUrl=pathToFileURL(file).href;
const origin='http://127.0.0.1:41042';
function windowMock(url){
  const main={parent:null,processId:55,routingId:12,frameTreeNodeId:300,url};
  const contents={mainFrame:main,getURL:()=>url};
  return {window:{isDestroyed:()=>false,webContents:contents}, main, contents};
}
test('new Electron wrappers with same frame tree ID are trusted main-frame IPC senders',()=>{
  const {window,main,contents}=windowMock(setupUrl);
  const equivalent={...main};
  assert.notEqual(equivalent,main);
  assert.equal(sameMainFrame(equivalent,main),true);
  assert.equal(trustedFrame({sender:contents,senderFrame:equivalent},window,
    {setupPath:file,origin,setup:true}),true);
});
test('valid app screen is permitted, provider iframes and malicious URLs are not',()=>{
  const {window,main,contents}=windowMock(origin+'/screen');
  assert.equal(trustedFrame({sender:contents,senderFrame:main},window,
    {setupPath:file,origin}),true);
  for(const url of ['https://ticket.example/','file:///C:/Windows/System32/calc.exe',
    origin+'/editor?other=1','http://localhost:41042/screen',origin+'/setup']){
    assert.equal(sameLocalPage(url,origin),false,url);
  }
  const badFrame={...main,frameTreeNodeId:301,processId:99,routingId:13,
    parent:main,url:setupUrl};
  assert.equal(trustedFrame({sender:contents,senderFrame:badFrame},window,
    {setupPath:file,origin,setup:true}),false);
  assert.equal(trustedFrame({sender:{},senderFrame:main},window,
    {setupPath:file,origin,setup:true}),false);
});
test('setup requires the exact file and rejects query, other paths or fragments',()=>{
  assert.equal(sameFile(setupUrl,file),true);
  assert.equal(sameFile(setupUrl+'?debug=1',file),false);
  assert.equal(sameFile(setupUrl+'#anything',file),false);
  assert.equal(sameFile('https://example.org/first-run.html',file),false);
  assert.equal(sameFile(pathToFileURL(path.join(process.cwd(),'desktop','fake.html')).href,file),false);
});
test('frame with no stable identity or missing main frame is not trusted',()=>{
  assert.equal(sameMainFrame({url:setupUrl,parent:null},{url:setupUrl,parent:null}),false);
  assert.equal(sameMainFrame(null,null),false);
});
