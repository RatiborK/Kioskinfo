// apps/web/src/utils/dk-colors.ts — theme-derived contrast; no arbitrary CSS input.
export const DK_BACKGROUND='#2c3e50';
export const DK_GLOW='#4ca1af';
const hex=/^#[0-9a-fA-F]{6}$/;
export function normalizeHex(value:unknown,fallback:string):string {
  return typeof value==='string'&&hex.test(value)?value.toLowerCase():fallback;
}
type RGB=[number,number,number];
function rgb(value:string):RGB {
  return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)) as RGB;
}
function toHex(channels:RGB):string {
  return '#'+channels.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function blend(base:string,other:string,part:number):string {
  const a=rgb(base),b=rgb(other);
  return toHex([a[0]+(b[0]-a[0])*part,a[1]+(b[1]-a[1])*part,a[2]+(b[2]-a[2])*part]);
}
function luminance(value:string):number {
  const c=rgb(value).map(v=>{const n=v/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});
  return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
}
export function dkThemeVars(background:unknown,glow:unknown):Record<string,string>{
  const bg=normalizeHex(background,DK_BACKGROUND);
  const light=normalizeHex(glow,DK_GLOW);
  const lumin=luminance(bg);
  const whiteContrast=1.05/(lumin+0.05);
  const blackContrast=(lumin+0.05)/0.05;
  const brightInk=whiteContrast>=blackContrast;
  const text=brightInk?'#f8fbff':'#091422';
  const surface=blend(bg,brightInk?'#ffffff':'#000000',brightInk?0.08:0.07);
  const side=blend(bg,brightInk?'#000000':'#ffffff',brightInk?0.12:0.13);
  const border=blend(bg,text,0.32);
  return {
    '--v-bg':bg,'--v-nav':side,'--v-card':surface,'--v-text':text,
    '--v-muted':blend(bg,text,0.78),'--v-line':border,
    '--dk-adaptive-ink':text,
    '--dk-glow-rgb':rgb(light).join(','),
    '--dk-line-rgb':rgb(text).join(','),
    '--v-backdrop':`repeating-linear-gradient(90deg,transparent 0 83px,rgba(${rgb(text).join(',')},.045) 83px 84px)`,
  };
}
