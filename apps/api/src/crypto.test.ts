// apps/api/src/crypto.test.ts — local preview credential policy never lowers production requirements.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hashPassword,hashLocalPreviewPassword,verifyPassword} from './crypto.js';

test('localhost preview: 8-character password can be hashed and verified using scrypt',async()=>{
  const plain='test1234';
  const hashed=await hashLocalPreviewPassword(plain);
  assert.match(hashed,/^scrypt\$[0-9a-f]{48}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword(plain,hashed),true);
  assert.equal(await verifyPassword('wrong123',hashed),false);
  await assert.rejects(()=>hashLocalPreviewPassword('short7'),/8 до 128/);
});

test('production password policy remains minimum 12 characters',async()=>{
  await assert.rejects(()=>hashPassword('test1234'),/12 до 128/);
  const strong='test-password-2026';
  const hashed=await hashPassword(strong);
  assert.equal(await verifyPassword(strong,hashed),true);
});
