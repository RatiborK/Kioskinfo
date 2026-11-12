// apps/web/src/utils/kiosk-search.ts
// Pure visitor-side search: no personal data, no remote service, no indexing state.
export interface SearchableSchedule {
  label: string;
  group: string;
  leader: string;
  time: string;
  room: string;
  description: string;
  age: string;
}
const keyboardEnglish = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const keyboardRussian = "ёйцукенгшщзхъфывапролджэячсмитьбю.";
const layout = new Map([...keyboardEnglish].map((letter,index)=>[letter,keyboardRussian[index]??letter]));
export function normalizeSearch(value:string):string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/ё/g,'е').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[.,;:!?()\[\]{}"'«»/\\|_-]+/g,' ')
    .replace(/\s+/g,' ').trim();
}
export function queryVariants(query:string):string[] {
  const exact = normalizeSearch(query);
  if (!exact)return [];
  const mapped = normalizeSearch([...query.toLocaleLowerCase('ru-RU')].map(c=>layout.get(c)??c).join(''));
  return mapped && mapped !== exact ? [exact,mapped] : [exact];
}
/** Keep the published ordering; match all query terms across all fields. */
export function filterSchedule<T extends SearchableSchedule>(rows:readonly T[],query:string):T[] {
  const variants=queryVariants(query);
  if(!variants.length)return [...rows];
  return rows.filter(row=>{
    const value=normalizeSearch([row.label,row.group,row.leader,row.time,row.room,row.description,row.age].join(' '));
    return variants.some(variant=>variant.split(' ').every(token=>value.includes(token)));
  });
}
