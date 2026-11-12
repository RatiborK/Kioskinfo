// apps/web/src/utils/kiosk-behavior.ts — pure slideshow and idle-policy helpers.
export interface IndexedPoster<T>{poster:T;index:number}
export function visiblePosterWindow<T>(items:readonly T[],index:number,limit=6):IndexedPoster<T>[] {
  if(!items.length)return [];
  const size=Math.max(1,Math.min(12,Math.floor(limit)));
  const current=Math.max(0,Math.min(items.length-1,Math.trunc(index)));
  const start=Math.max(0,Math.min(current-2,items.length-size));
  return items.slice(start,start+size).map((poster,offset)=>({poster,index:start+offset}));
}
export function shouldReturnHome(lastActivity:number,now:number,timeoutMs=180000):boolean{
  return Number.isFinite(lastActivity)&&Number.isFinite(now)&&now>=lastActivity&&now-lastActivity>=timeoutMs;
}
