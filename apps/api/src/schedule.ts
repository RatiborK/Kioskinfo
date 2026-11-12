// apps/api/src/schedule.ts — schedule contracts and validation for browser-based editing.
// Drafts are separate from published snapshots; Excel is no longer an input source.
import { createHash } from 'node:crypto';

export type ButtonTheme = 'orange' | 'blue' | 'neutral';
export interface ButtonAppearance {
  fill: 'outline' | 'solid';
  radius: 'square' | 'soft' | 'pill';
  titleSize: 'normal' | 'large' | 'huge';
  align: 'left' | 'center';
}
export function defaultAppearance(): ButtonAppearance {
  return { fill:'outline', radius:'square', titleSize:'normal', align:'left' };
}
/** Allow older local JSON and published PostgreSQL snapshots without an appearance property. */
export function validateAppearance(value: unknown): ButtonAppearance {
  if (value === undefined) return defaultAppearance();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректные настройки внешнего вида');
  const a = value as Record<string, unknown>;
  if (!['outline','solid'].includes(String(a.fill)) ||
      !['square','soft','pill'].includes(String(a.radius)) ||
      !['normal','large','huge'].includes(String(a.titleSize)) ||
      !['left','center'].includes(String(a.align)) ||
      Object.keys(a).some(key => !['fill','radius','titleSize','align'].includes(key)))
    throw new Error('Недопустимое оформление кнопки');
  return {fill:a.fill as ButtonAppearance['fill'],radius:a.radius as ButtonAppearance['radius'],
    titleSize:a.titleSize as ButtonAppearance['titleSize'],align:a.align as ButtonAppearance['align']};
}
export interface ScheduleFields {
  label: string; group: string; leader: string; time: string;
  room: string; description: string; age: string;
  theme: ButtonTheme; inheritTheme: boolean; position: number; appearance: ButtonAppearance;
}
export interface ScheduleRecord extends ScheduleFields {
  id: string; revision: number; published: ScheduleFields | null;
  published_revision: number | null; created_at: string; updated_at: string;
  published_at: string | null;
}
export interface ScheduleEntry extends ScheduleFields { id: string }
export interface ScheduleCatalog {
  entries: ScheduleEntry[]; version: string; updatedAt: string | null;
  stale: boolean; message: string;
}
export interface ScheduleRepository {
  list(): Promise<ScheduleCatalog>;
  listDrafts(): Promise<ScheduleRecord[]>;
  create(fields: ScheduleFields): Promise<ScheduleRecord>;
  save(id: string, expectedRevision: number, fields: ScheduleFields): Promise<ScheduleRecord | null>;
  publish(id: string, expectedRevision: number): Promise<ScheduleRecord | null>;
  archive(id: string, expectedRevision: number): Promise<boolean>;
}

const names:Record<string,string>={label:'Название кнопки',group:'Коллектив',leader:'Руководитель',time:'Расписание',room:'Кабинет',description:'Описание',age:'Возраст'};
const lengths: Record<keyof Pick<ScheduleFields, 'label'|'group'|'leader'|'time'|'room'|'description'|'age'>, number> = {
  label: 70, group: 140, leader: 140, time: 200, room: 80, description: 2500, age: 100,
};
export function validateScheduleFields(input: unknown): ScheduleFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Заполните поля карточки');
  const body = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [name, limit] of Object.entries(lengths)) {
    if (typeof body[name] !== 'string' || body[name].length > limit) throw new Error(`Поле «${names[name]}» должно быть текстом длиной не более ${limit} символов`);
    fields[name] = body[name].trim();
  }
  if (!fields.label || !fields.group) throw new Error('Заполните название кнопки и название коллектива');
  if (!['orange', 'blue', 'neutral'].includes(String(body.theme))) throw new Error('Выберите оформление кнопки');
  if (typeof body.inheritTheme !== 'boolean') throw new Error('Неверное значение наследования оформления');
  if (!Number.isSafeInteger(body.position) || (body.position as number) < 0 || (body.position as number) > 1000000) throw new Error('Порядок кнопки должен быть от 0 до 1000000');
  return { ...fields, label: fields.label, group: fields.group, leader: fields.leader,
    time: fields.time, room: fields.room, description: fields.description, age: fields.age,
    theme: body.theme as ButtonTheme, inheritTheme: body.inheritTheme as boolean,
    position: body.position as number, appearance:validateAppearance(body.appearance) };
}
export function defaultScheduleFields(label = 'Новый раздел', group = 'Новый коллектив'): ScheduleFields {
  return { label, group, leader: '', time: '', room: '', description: '', age: '',
    theme: 'orange', inheritTheme: false, position: 0, appearance: defaultAppearance() };
}
export function publishedCatalog(records: ScheduleRecord[], stale = false, message = ''): ScheduleCatalog {
  const ordered = [...records].sort((a,b) => (a.published?.position ?? a.position) - (b.published?.position ?? b.position) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const visible = ordered.filter(row => row.published != null);
  const base = visible[0]?.published ? validateScheduleFields(visible[0].published) : defaultScheduleFields();
  const entries: ScheduleEntry[] = visible.map((row, index) => {
    const fields = validateScheduleFields(row.published!);
    // The first published button defines the template. Only published snapshots affect the kiosk.
    const inherit = index > 0 && fields.inheritTheme;
    return { ...fields, id: row.id,
      theme: inherit ? base.theme : fields.theme,
      appearance: inherit ? { ...base.appearance } : { ...fields.appearance } };
  });
  const version = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);
  const updatedAt = visible.reduce<string | null>((latest, row) => !latest || (row.published_at && row.published_at > latest) ? row.published_at : latest, null);
  return { entries, version, updatedAt, stale, message: message || `Опубликовано карточек: ${entries.length}` };
}
