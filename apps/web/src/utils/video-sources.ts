// apps/web/src/utils/video-sources.ts — allowlisted embed URLs or our own media, never full provider pages.
export type VideoSource={kind:'embed'|'file';src:string};
const LOCAL=/^\/api\/public\/culture\/video\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$/;
const YT=/^[A-Za-z0-9_-]{11}$/;
const RUTUBE=/^[0-9a-f]{32}$/i;
const VK_ID=/^(-?\d+)_(\d+)$/;

export function resolveVideoSource(value:unknown):VideoSource|null{
  if(typeof value!=='string'||!value||value.length>650)return null;
  if(LOCAL.test(value))return {kind:'file',src:value};
  let url:URL;
  try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)return null;
  const host=url.hostname.toLowerCase();
  const path=url.pathname.replace(/\/$/,'');
  if(['youtu.be','www.youtube.com','youtube.com','www.youtube-nocookie.com'].includes(host)){
    let id:string|null=null;
    if(host==='youtu.be')id=path.match(/^\/([A-Za-z0-9_-]{11})$/)?.[1]??null;
    else if(path==='/watch')id=url.searchParams.get('v');
    else id=path.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})$/)?.[1]??null;
    return id&&YT.test(id)?{kind:'embed',src:'https://www.youtube-nocookie.com/embed/'+id+'?rel=0'}:null;
  }
  if(['rutube.ru','www.rutube.ru'].includes(host)){
    const id=path.match(/^\/(?:video(?:\/private)?|play\/embed)\/([0-9a-f]{32})$/i)?.[1];
    if(!id||!RUTUBE.test(id))return null;
    const p=url.searchParams.get('p');
    if(p&&!/^[A-Za-z0-9_-]{1,120}$/.test(p))return null;
    return {kind:'embed',src:'https://rutube.ru/play/embed/'+id+(p?'/?p='+encodeURIComponent(p):'')};
  }
  if(['vk.com','vkvideo.ru'].includes(host)){
    let oid:string|undefined,id:string|undefined;
    if(path==='/video_ext.php'){
      oid=url.searchParams.get('oid')??undefined;
      id=url.searchParams.get('id')??undefined;
    }else{
      const parts=path.match(/^\/video(-?\d+)_(\d+)$/);
      oid=parts?.[1];id=parts?.[2];
    }
    if(!oid||!id||!/^[-]?\d{1,16}$/.test(oid)||!/^\d{1,16}$/.test(id))return null;
    const hash=url.searchParams.get('hash');
    if(hash&&!/^[a-fA-F0-9]{8,64}$/.test(hash))return null;
    const params=new URLSearchParams({oid,id});
    if(hash)params.set('hash',hash);
    return {kind:'embed',src:'https://'+host+'/video_ext.php?'+params.toString()};
  }
  return null;
}
