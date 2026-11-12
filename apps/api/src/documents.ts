// apps/api/src/documents.ts — official document library with safe HTML from DOCX and inline PDFs.
import {randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,rename,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';

export const DOCUMENT_CATEGORIES=['prices','policies','benefits','other'] as const;
export type DocumentCategory=typeof DOCUMENT_CATEGORIES[number];
export type DocumentFormat='pdf'|'docx';
export interface PublicDocument {
  id:string;title:string;category:DocumentCategory;format:DocumentFormat;
  sizeBytes:number;createdAt:string;
}
export interface DocumentRepository{
  list():Promise<PublicDocument[]>;
  upload(title:string,category:DocumentCategory,fileName:string,base64:string):Promise<PublicDocument>;
  remove(id:string):Promise<boolean>;
  html(id:string):Promise<string|null>;
  file(id:string):Promise<{path:string;sizeBytes:number;mime:string}|null>;
}
export const defaultDocumentDir=()=>fileURLToPath(new URL('../../../content/documents',import.meta.url));
const LIMIT_BYTES=6*1024*1024;
const MAX_DOCUMENTS=60;
const MAX_HTML=700000;
const ID=/^[a-f0-9-]{36}$/;
export const safeDocumentHtml=(unsafe:string)=>sanitizeHtml(unsafe,{
  allowedTags:['h1','h2','h3','h4','p','strong','b','em','i','u','ul','ol','li','table','thead','tbody',
    'tr','th','td','br','blockquote','sup','sub','hr','pre','code'],
  allowedAttributes:{},allowedSchemes:[],disallowedTagsMode:'discard',
  enforceHtmlBoundary:true,
});
export function validateDocumentTitle(title:unknown,category:unknown):{title:string;category:DocumentCategory}{
  if(typeof title!=='string'||!title.trim()||title.length>150)throw Error('Введите название документа до 150 символов');
  if(!DOCUMENT_CATEGORIES.includes(category as DocumentCategory))throw Error('Выберите категорию документа');
  return {title:title.trim(),category:category as DocumentCategory};
}
export class FolderDocumentsRepository implements DocumentRepository{
  private queue:Promise<void>=Promise.resolve();
  private good:PublicDocument[]=[];
  constructor(private readonly dir=defaultDocumentDir()){}
  private get index(){return join(this.dir,'index.json');}
  private async read():Promise<PublicDocument[]>{
    try{
      if((await stat(this.index)).size>300000)throw Error('Индекс документов слишком большой');
      const rows:unknown=JSON.parse(await readFile(this.index,'utf8'));
      if(!Array.isArray(rows)||rows.length>MAX_DOCUMENTS)throw Error('Индекс документов повреждён');
      for(const doc of rows){
        if(!doc||typeof doc!=='object')throw Error('Индекс документов повреждён');
        const d=doc as PublicDocument;
        if(typeof d.id!=='string'||!ID.test(d.id)||!['pdf','docx'].includes(d.format)||
          !Number.isSafeInteger(d.sizeBytes)||d.sizeBytes<1||d.sizeBytes>LIMIT_BYTES)
          throw Error('Недопустимая запись документа');
        validateDocumentTitle(d.title,d.category);
      }
      this.good=structuredClone(rows);return rows as PublicDocument[];
    }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return structuredClone(this.good);throw e;}
  }
  private async writeIndex(rows:PublicDocument[]){
    await mkdir(this.dir,{recursive:true});
    const temp=this.index+'.'+randomUUID()+'.tmp';
    try{await writeFile(temp,JSON.stringify(rows,null,2)+'\n',{flag:'wx',mode:0o600});
      await rename(temp,this.index);this.good=structuredClone(rows);
    }finally{await rm(temp,{force:true}).catch(()=>{});}
  }
  private async locked<T>(fn:()=>Promise<T>):Promise<T>{
    const result=this.queue.then(fn);this.queue=result.then(()=>{},()=>{});return result;
  }
  async list(){await this.queue;try{return (await this.read()).sort((a,b)=>a.category.localeCompare(b.category)||a.title.localeCompare(b.title,'ru'));}catch{return structuredClone(this.good);}}
  async upload(title:string,category:DocumentCategory,fileName:string,base64:string){
    const fields=validateDocumentTitle(title,category);
    if(typeof base64!=='string'||base64.length>Math.ceil(LIMIT_BYTES*4/3)+16||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('Неверный файл или превышение 6 МБ');
    const bytes=Buffer.from(base64,'base64');
    if(!bytes.length||bytes.length>LIMIT_BYTES||bytes.toString('base64')!==base64)throw Error('Файл повреждён');
    const lower=fileName.toLocaleLowerCase('ru-RU');
    const format:DocumentFormat=lower.endsWith('.pdf')?'pdf':lower.endsWith('.docx')?'docx':(()=>{throw Error('Нужен файл PDF или DOCX')})();
    if(format==='pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Недопустимый PDF');
    if(format==='docx'&&!bytes.subarray(0,2).equals(Buffer.from('PK')))throw Error('Недопустимый DOCX');
    let html='';
    if(format==='docx'){
      // Mammoth deliberately does not sanitize Word HTML. Disable images and untrusted attributes.
      const result=await mammoth.convertToHtml({buffer:bytes},{includeEmbeddedStyleMap:false,
        convertImage:mammoth.images.imgElement(()=>Promise.resolve({src:''}))});
      html=safeDocumentHtml(result.value);
      if(!html.trim()||html.length>MAX_HTML)throw Error('Документ пуст или слишком большой для показа');
    }
    return this.locked(async()=>{
      const rows=await this.read();
      if(rows.length>=MAX_DOCUMENTS)throw Error('Достигнут предел 60 документов');
      const doc:PublicDocument={id:randomUUID(),...fields,format,sizeBytes:bytes.length,createdAt:new Date().toISOString()};
      await mkdir(this.dir,{recursive:true});
      const binary=join(this.dir,doc.id+'.'+format),htmlPath=join(this.dir,doc.id+'.html');
      try{
        await writeFile(binary,bytes,{flag:'wx',mode:0o600});
        if(format==='docx')await writeFile(htmlPath,html,{flag:'wx',mode:0o600});
        await this.writeIndex([...rows,doc]);
      }catch(e){
        await Promise.all([rm(binary,{force:true}),rm(htmlPath,{force:true})]);
        throw e;
      }
      return doc;
    });
  }
  async remove(id:string){
    if(!ID.test(id))return false;
    return this.locked(async()=>{
      const rows=await this.read(),doc=rows.find(x=>x.id===id);if(!doc)return false;
      await this.writeIndex(rows.filter(x=>x.id!==id));
      await rm(join(this.dir,id+'.'+doc.format),{force:true});
      if(doc.format==='docx')await rm(join(this.dir,id+'.html'),{force:true});
      return true;
    });
  }
  async html(id:string){
    if(!ID.test(id))return null;
    await this.queue;
    const doc=(await this.list()).find(x=>x.id===id&&x.format==='docx');if(!doc)return null;
    try{return await readFile(join(this.dir,id+'.html'),'utf8');}catch{return null;}
  }
  async file(id:string){
    if(!ID.test(id))return null;
    await this.queue;
    const doc=(await this.list()).find(x=>x.id===id);if(!doc)return null;
    const path=join(this.dir,id+'.'+doc.format);
    try{const size=(await stat(path)).size;if(size!==doc.sizeBytes)return null;
      return {path,sizeBytes:size,mime:doc.format==='pdf'?'application/pdf':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
    }catch{return null;}
  }
}
export {createReadStream as documentStream};
