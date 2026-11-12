// apps/api/src/schedule.ts — bounded, fail-safe XLSX-to-button projection.
// Public content is derived from one Excel workbook; no executable spreadsheet macros or HTML are used.
import { readSheet } from 'read-excel-file/node';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ButtonTheme = 'orange' | 'blue' | 'neutral';
export interface ScheduleEntry {
  id: string; label: string; group: string; leader: string; time: string;
  room: string; description: string; age: string; theme: ButtonTheme;
}
export interface ScheduleCatalog {
  entries: ScheduleEntry[]; version: string; updatedAt: string | null; stale: boolean; message: string;
}
export type ExcelCell = string | number | boolean | Date | null | undefined;
export interface ScheduleRepository { list(): Promise<ScheduleCatalog> }

const MAX_XLSX_BYTES = 3 * 1024 * 1024;
const MAX_ROWS = 301; // header + 300 entries
const MAX_COLS = 18;
const HEADER_KEYS: Record<string, string> = {
  'id': 'id', 'код': 'id', 'кнопка': 'label', 'название кнопки': 'label',
  'коллектив': 'group', 'руководитель': 'leader', 'расписание': 'time',
  'кабинет': 'room', 'описание': 'description', 'возраст': 'age',
  'шаблон': 'theme', 'повторить стиль': 'inherit', 'наследовать стиль': 'inherit',
};
const THEMES: Record<string, ButtonTheme> = {
  orange: 'orange', 'оранжевый': 'orange', blue: 'blue', 'синий': 'blue',
  neutral: 'neutral', 'нейтральный': 'neutral', 'серый': 'neutral',
};
function value(cell: ExcelCell): string {
  if (cell == null) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}
function simplify(value: string): string { return value.toLowerCase().replace(/\s+/g, ' ').trim(); }
function inherited(cell: ExcelCell): boolean {
  if (cell === true || cell === 1) return true;
  return ['да','true','1','✓','yes'].includes(simplify(value(cell)));
}
const ID = /^[a-z][a-z0-9_-]{1,63}$/;
/** Throws user-readable validation errors; caller keeps last good snapshot. */
export function parseScheduleRows(rows: ExcelCell[][]): ScheduleEntry[] {
  if (rows.length < 1) throw new Error('В Excel отсутствует строка заголовков');
  if (rows.length > MAX_ROWS) throw new Error('Максимум 300 строк расписания');
  const header = rows[0] ?? [];
  if (header.length > MAX_COLS) throw new Error('Слишком много столбцов');
  const columns = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = HEADER_KEYS[simplify(value(cell))];
    if (key) {
      if (columns.has(key)) throw new Error(`Повторяется заголовок: ${value(cell)}`);
      columns.set(key, index);
    }
  });
  for (const required of ['id','label','group','leader','time','room']) {
    if (!columns.has(required)) throw new Error(`Не найден столбец: ${required}`);
  }
  const cell = (row: ExcelCell[], key: string): ExcelCell => row[columns.get(key) ?? -1];
  const seen = new Set<string>();
  let previousTheme: ButtonTheme = 'orange';
  const entries: ScheduleEntry[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    if (row.every(v => !value(v))) continue;
    if (row.length > MAX_COLS) throw new Error(`Строка ${index + 1}: слишком много столбцов`);
    const id = value(cell(row,'id')).toLowerCase();
    const label = value(cell(row,'label'));
    const group = value(cell(row,'group'));
    if (!ID.test(id)) throw new Error(`Строка ${index + 1}: ID — латинские буквы, цифры, _ или - (2–64 символа, начинается с буквы)`);
    if (seen.has(id)) throw new Error(`Строка ${index + 1}: повторяется ID «${id}»`);
    if (!label || !group) throw new Error(`Строка ${index + 1}: заполните «Кнопка» и «Коллектив»`);
    const entry = {
      id, label, group, leader: value(cell(row,'leader')), time: value(cell(row,'time')),
      room: value(cell(row,'room')), description: value(cell(row,'description')),
      age: value(cell(row,'age')),
    };
    for (const [key, limit] of Object.entries({label:70,group:140,leader:140,time:200,room:80,description:2500,age:100}) as [keyof typeof entry,number][]) {
      if (entry[key].length > limit) throw new Error(`Строка ${index + 1}: слишком длинное поле «${key}»`);
    }
    const explicit = simplify(value(cell(row,'theme')));
    if (explicit && !THEMES[explicit]) throw new Error(`Строка ${index + 1}: неизвестный шаблон «${explicit}»`);
    const theme: ButtonTheme = explicit ? THEMES[explicit] : inherited(cell(row,'inherit')) ? previousTheme : 'orange';
    previousTheme = theme;
    seen.add(id);
    entries.push({ ...entry, theme });
  }
  return entries;
}
export function defaultScheduleFile(): string {
  return fileURLToPath(new URL('../../../content/schedule/raspisanie.xlsx', import.meta.url));
}
export class XlsxScheduleRepository implements ScheduleRepository {
  readonly file: string;
  private snapshot: ScheduleCatalog = {entries:[],version:'none',updatedAt:null,stale:false,message:'Файл расписания ещё не добавлен'};
  private goodHash = '';
  private serial: Promise<ScheduleCatalog> = Promise.resolve(this.snapshot);
  constructor(file = process.env.SCHEDULE_XLSX || defaultScheduleFile(),
    private readonly reader: (path:string)=>Promise<ExcelCell[][]> = (path)=>readSheet(path)) { this.file = resolve(file); }
  list(): Promise<ScheduleCatalog> {
    // Concurrent kiosk requests must never parse the same incomplete workbook simultaneously.
    const task = this.serial.catch(() => this.snapshot).then(() => this.scan());
    this.serial = task;
    return task;
  }
  private async scan(): Promise<ScheduleCatalog> {
    try {
      await mkdir(dirname(this.file), {recursive:true});
      const before = await stat(this.file);
      if (!before.isFile() || before.size < 100 || before.size > MAX_XLSX_BYTES) throw new Error('Файл должен быть XLSX размером до 3 МБ');
      const bytes = await readFile(this.file);
      const after = await stat(this.file);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size)
        throw new Error('Excel сейчас сохраняется. Повторная проверка при следующем обновлении');
      // ZIP magic prevents obvious mistakes such as CSV renamed to XLSX.
      if (bytes.toString('ascii',0,2) !== 'PK') throw new Error('Ожидается настоящий файл .xlsx');
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash === this.goodHash) return this.snapshot;
      const rows = await this.reader(this.file);
      const entries = parseScheduleRows(rows);
      this.goodHash = hash;
      this.snapshot = { entries, version:hash.slice(0,16), updatedAt:after.mtime.toISOString(), stale:false,
        message:entries.length?`Загружено записей: ${entries.length}`:'Расписание пустое' };
      return this.snapshot;
    } catch(error) {
      const detail = error instanceof Error ? error.message : 'Ошибка чтения Excel';
      // Only explicit empty initial state is harmless; loss/invalid source never clears published records.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !this.goodHash) return this.snapshot;
      return {...this.snapshot,stale:true,message:detail.length<220?detail:'Ошибка чтения Excel. Исправьте файл и сохраните снова'};
    }
  }
}
