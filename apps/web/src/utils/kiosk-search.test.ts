// apps/web/src/utils/kiosk-search.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {filterSchedule, normalizeSearch,queryVariants} from './kiosk-search.ts';
const rows=[
  {id:1,label:'Танцы',group:'Вдохновение',leader:'Анна Сергеева',time:'Пн, Ср 16:00',room:'210',age:'7–12 лет',description:'Танцевальное направление'},
  {id:2,label:'Вокал',group:'Мелодия',leader:'Алёна Петрова',time:'Вт, Чт 18:30',room:'312',age:'12+',description:'Эстрадное пение'},
  {id:3,label:'Театр',group:'Премьера',leader:'Мария Ильина',time:'Сб 11:00',room:'204',age:'от 8 лет',description:'Сценическое искусство'},
];
test('normalization folds е/ё, punctuation, capitals and multiple spaces',()=>{
  assert.equal(normalizeSearch('  ЁЛКА,  КУЛЬТУРА! '),'елка культура');
  assert.equal(normalizeSearch('Поиск — Театр'),normalizeSearch('ПОИСК — ТЕАТР'));
});
test('search matches labels, staff, room, weekdays, descriptions and age in published order',()=>{
  assert.deepEqual(filterSchedule(rows,'танцы').map(x=>x.id),[1]);
  assert.deepEqual(filterSchedule(rows,'алёна').map(x=>x.id),[2]);
  assert.deepEqual(filterSchedule(rows,'комната 312').map(x=>x.id),[]);
  assert.deepEqual(filterSchedule(rows,'312').map(x=>x.id),[2]);
  assert.deepEqual(filterSchedule(rows,'Сб премьера').map(x=>x.id),[3]);
  assert.deepEqual(filterSchedule(rows,'СЦЕНИЧЕСКОЕ').map(x=>x.id),[3]);
  assert.deepEqual(filterSchedule(rows,'12').map(x=>x.id),[1,2]);
  assert.deepEqual(filterSchedule(rows,'').map(x=>x.id),[1,2,3]);
});
test('a two-word search can match across different fields',()=>{
  assert.deepEqual(filterSchedule(rows,'Вокал Петрова').map(x=>x.id),[2]);
  assert.deepEqual(filterSchedule(rows,'210 Пн').map(x=>x.id),[1]);
});
test('common accidental English keyboard layout works for Russian labels',()=>{
  assert.ok(queryVariants('njhn').includes('торт'));
  assert.deepEqual(filterSchedule(rows,'nfyws').map(x=>x.id),[1]); // танцы
});
test('no arbitrary regex execution or HTML evaluation',()=>{
  assert.deepEqual(filterSchedule(rows,'.*').map(x=>x.id),[]);
  assert.deepEqual(filterSchedule(rows,'<script>').map(x=>x.id),[]);
});
