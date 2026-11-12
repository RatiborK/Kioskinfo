// apps/api/src/create-user.ts — local CLI; editor/viewer only; password comes from stdin.
import { readFileSync } from 'node:fs';
import { hashPassword } from './crypto.js';
import { makePool } from './store-pg.js';
const username = (process.argv[2] ?? '').trim().toLowerCase();
const role = process.argv[3] ?? '';
if (!/^[a-z0-9_-]{3,80}$/.test(username)) throw new Error('Логин: латиница, цифры, _ или -');
if (role !== 'editor' && role !== 'viewer') throw new Error('Роль должна быть editor или viewer; admin создается отдельно');
const password = readFileSync(0,'utf8').trimEnd();
if(password.includes('\n') || password.includes('\r')) throw new Error('Пароль должен быть одной строкой');
const hash = await hashPassword(password);
const pool = makePool();
try {
  const r = await pool.query('INSERT INTO accounts(username,display_name,role,password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING RETURNING id', [username,username,role,hash]);
  if (!r.rows.length) throw new Error('Пользователь уже существует');
  process.stdout.write(`Пользователь ${username} (${role}) создан\n`);
} finally {await pool.end();}
