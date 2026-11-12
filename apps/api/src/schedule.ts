// apps/api/src/schedule.ts — schedule contracts and validation for browser-based editing.
// Drafts are separate from published snapshots; Excel is no longer an input source.
import { createHash } from 'node:crypto';

export type ButtonTheme = 'orange' | 'blue' | 'neutral';
export interface ScheduleFields {
  label: string; group: string; leader: string; time: string;
  room: string; description: string; age: string;
  theme: ButtonTheme; inheritTheme: boolean; position: number;
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
    position: body.position as number };
}
export function defaultScheduleFields(label = 'Новый раздел', group = 'Новый коллектив'): ScheduleFields {
  return { label, group, leader: '', time: '', room: '', description: '', age: '',
    theme: 'orange', inheritTheme: false, position: 0 };
}
export function publishedCatalog(records: ScheduleRecord[], stale = false, message = ''): ScheduleCatalog {
  const ordered = [...records].sort((a,b) => (a.published?.position ?? a.position) - (b.published?.position ?? b.position) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const visible = ordered.filter(row => row.published != null);
  const baseTheme = visible[0]?.published?.theme ?? 'orange';
  const entries: ScheduleEntry[] = visible.map(row => {
    const fields = row.published!;
    return { ...fields, id: row.id, theme: fields.inheritTheme ? baseTheme : fields.theme };
  });
  const version = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);
  const updatedAt = visible.reduce<string | null>((latest, row) => !latest || (row.published_at && row.published_at > latest) ? row.published_at : latest, null);
  return { entries, version, updatedAt, stale, message: message || `Опубликовано карточек: ${entries.length}` };
}
