// apps/api/src/documents.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FolderDocumentsRepository,safeDocumentHtml,validateDocumentTitle} from './documents.js';
test('sanitize Word HTML before it can be rendered with v-html',()=>{
  const raw='<h1 onclick="evil()">Прейскурант</h1><script>alert(1)</script>'+
    '<table><tr><td>Услуга</td><td>Цена</td></tr></table><a href="javascript:evil()">Ссылка</a>';
  const html=safeDocumentHtml(raw);
  assert.match(html,/<h1>Прейскурант<\/h1>/);
  assert.match(html,/<table>/);
  assert.ok(!html.includes('onclick'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('href='));
});
test('document categories and title have controlled values',()=>{
  assert.deepEqual(validateDocumentTitle('  Положение  ','policies'),
    {title:'Положение',category:'policies'});
  assert.throws(()=>validateDocumentTitle('','policies'),/название/);
  assert.throws(()=>validateDocumentTitle('Прайс','unofficial'),/категорию/);
});
test('PDF upload, list, stream metadata, delete and restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-documents-'));
  try{
    const repo=new FolderDocumentsRepository(dir);
    const bytes=Buffer.from('%PDF-1.7\n%test-document\n');
    const doc=await repo.upload('Прейскурант','prices','prices.pdf',bytes.toString('base64'));
    assert.equal(doc.format,'pdf');
    assert.equal((await repo.list()).length,1);
    assert.equal((await repo.file(doc.id))?.mime,'application/pdf');
    const newRepo=new FolderDocumentsRepository(dir);
    assert.equal((await newRepo.list())[0].title,'Прейскурант');
    const path=(await newRepo.file(doc.id))!.path;
    assert.deepEqual(await readFile(path),bytes);
    assert.equal(await newRepo.html(doc.id),null);
    assert.equal(await newRepo.remove(doc.id),true);
    assert.equal((await newRepo.list()).length,0);
    assert.equal(await newRepo.remove(doc.id),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('reject invalid files and unsupported legacy DOC with no records created',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'navikultura-invalid-docs-'));
  try{
    const repo=new FolderDocumentsRepository(dir);
    await assert.rejects(()=>repo.upload('Положение','policies','test.doc',Buffer.from('NOT PDF').toString('base64')));
    await assert.rejects(()=>repo.upload('Положение','policies','test.docx',Buffer.from('NO ZIP').toString('base64')));
    await assert.rejects(()=>repo.upload('Положение','policies','test.pdf',Buffer.from('NO PDF').toString('base64')));
    await assert.rejects(()=>repo.upload('Положение','policies','test.pdf','%%%'));
    assert.equal((await repo.list()).length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
