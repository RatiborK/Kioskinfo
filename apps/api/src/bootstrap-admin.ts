// apps/api/src/bootstrap-admin.ts — local-only one-time admin bootstrap (read password from stdin).
import { readFileSync } from 'node:fs';
import { hashPassword } from './crypto.js';
import { makePool } from './store-pg.js';
const username = (process.argv[2] ?? '').trim().toLowerCase();
if(!/^[a-z0-9_-]{3,80}$/.test(username)) throw new Error('Укажите имя пользователя из латинских букв, цифр, _ или -');
const password = readFileSync(0,'utf8').trimEnd();
if(password.includes('\n') || password.includes('\r')) throw new Error('Пароль должен быть одной строкой');
const hash = await hashPassword(password);
const pool = makePool();
try {
  const existing = await pool.query("SELECT 1 FROM accounts WHERE role='admin' LIMIT 1");
  if(existing.rows.length) throw new Error('Администратор уже существует — bootstrap повторно запрещён');
  const r=await pool.query('INSERT INTO accounts(username, display_name, role, password_hash) VALUES($1,$2,$3,$4) RETURNING id',[username,'Администратор','admin',hash]);
  process.stdout.write(`Администратор ${username} создан: ${r.rows[0].id}\n`);
} finally { await pool.end(); }
