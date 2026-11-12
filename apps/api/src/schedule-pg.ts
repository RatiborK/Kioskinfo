// apps/api/src/schedule-pg.ts — PostgreSQL-backed browser schedule editor.
// All writes use parameterized SQL and revision guards.
import type pg from 'pg';
import { publishedCatalog, validateScheduleFields, type ScheduleCatalog, type ScheduleFields, type ScheduleRecord, type ScheduleRepository } from './schedule.js';

function fromRow(row: Record<string,unknown>):ScheduleRecord {
  return {id:String(row.id),label:String(row.label),group:String(row.group_name),leader:String(row.leader),
    time:String(row.meeting_time),room:String(row.room),description:String(row.description),age:String(row.age),
    theme:row.theme as ScheduleFields['theme'],inheritTheme:Boolean(row.inherit_theme),position:Number(row.position),
    revision:Number(row.revision),published:row.published as ScheduleFields|null,
    published_revision:row.published_revision==null?null:Number(row.published_revision),
    created_at:new Date(row.created_at as string).toISOString(),updated_at:new Date(row.updated_at as string).toISOString(),
    published_at:row.published_at==null?null:new Date(row.published_at as string).toISOString()};
}
const COLUMNS='id,label,group_name,leader,meeting_time,room,description,age,theme,inherit_theme,position,revision,published,published_revision,created_at,updated_at,published_at';
export class PgScheduleRepository implements ScheduleRepository {
  constructor(private readonly pool:pg.Pool){}
  async listDrafts():Promise<ScheduleRecord[]> {
    const result=await this.pool.query(`SELECT ${COLUMNS} FROM schedule_items WHERE archived_at IS NULL ORDER BY position,created_at,id`);
    return result.rows.map(fromRow);
  }
  async list():Promise<ScheduleCatalog> { return publishedCatalog(await this.listDrafts()); }
  async create(fields:ScheduleFields):Promise<ScheduleRecord> {
    const v=validateScheduleFields(fields);
    const r=await this.pool.query(`INSERT INTO schedule_items (label,group_name,leader,meeting_time,room,description,age,theme,inherit_theme,position)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 WHERE (SELECT count(*) FROM schedule_items WHERE archived_at IS NULL)<300 RETURNING ${COLUMNS}`,
    [v.label,v.group,v.leader,v.time,v.room,v.description,v.age,v.theme,v.inheritTheme,v.position]);
    if(!r.rows[0])throw new Error('Достигнут предел 300 карточек');return fromRow(r.rows[0]);
  }
  async save(id:string,revision:number,fields:ScheduleFields):Promise<ScheduleRecord|null> {
    const v=validateScheduleFields(fields);
    const r=await this.pool.query(`UPDATE schedule_items SET label=$3,group_name=$4,leader=$5,meeting_time=$6,room=$7,
      description=$8,age=$9,theme=$10,inherit_theme=$11,position=$12,revision=revision+1,updated_at=now()
      WHERE id::text=$1 AND revision=$2 AND archived_at IS NULL RETURNING ${COLUMNS}`,
      [id,revision,v.label,v.group,v.leader,v.time,v.room,v.description,v.age,v.theme,v.inheritTheme,v.position]);
    return r.rows[0]?fromRow(r.rows[0]):null;
  }
  async publish(id:string,revision:number):Promise<ScheduleRecord|null> {
    const r=await this.pool.query(`UPDATE schedule_items SET published=jsonb_build_object(
      'label',label,'group',group_name,'leader',leader,'time',meeting_time,'room',room,'description',description,
      'age',age,'theme',theme,'inheritTheme',inherit_theme,'position',position),published_revision=revision,published_at=now()
      WHERE id::text=$1 AND revision=$2 AND archived_at IS NULL RETURNING ${COLUMNS}`,[id,revision]);
    return r.rows[0]?fromRow(r.rows[0]):null;
  }
  async archive(id:string,revision:number):Promise<boolean> {
    const r=await this.pool.query('UPDATE schedule_items SET archived_at=now(),published=NULL,updated_at=now(),revision=revision+1 WHERE id::text=$1 AND revision=$2 AND archived_at IS NULL RETURNING id',[id,revision]);
    return r.rowCount===1;
  }
}
