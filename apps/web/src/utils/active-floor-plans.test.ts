// apps/web/src/utils/active-floor-plans.test.ts — visible 1st/2nd floors without data loss.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {CultureNavigation} from './culture-types.js';
import {visibleFloorPlans,isVisibleFloorPlan} from './active-floor-plans.js';

const fixture:CultureNavigation={
  title:'Навигация',intro:'',notice:'',floors:[
    {id:'floor-1',title:'Первый этаж',note:'Первый план',points:[]},
    {id:'floor-2',title:'Схема верхнего уровня',note:'Архив',points:[
      {id:'legacy',title:'Архивная отметка',kind:'other',x:21,y:41,description:'Сохранить'}
    ]},
    {id:'floor-3',title:'Схема с обозначениями',
      note:'Дополнительные условные обозначения; этаж уточняется',points:[
        {id:'hall',title:'Кабинет 25',kind:'studio',x:70,y:20,description:'Точка второго этажа'}
      ]},
  ],
};
test('only first and newly confirmed second floor are visible in correct order',()=>{
  const shown=visibleFloorPlans(fixture);
  assert.deepEqual(shown.map(f=>f.id),['floor-1','floor-3']);
  assert.deepEqual(shown.map(f=>f.title),['Первый этаж','Второй этаж']);
  assert.match(shown[1].note,/добавим позже/);
  assert.equal(shown[1].points[0].id,'hall');
  assert.equal(isVisibleFloorPlan('floor-2'),false);
  assert.equal(isVisibleFloorPlan('floor-3'),true);
});
test('the old upper-level plan remains untouched in stored content',()=>{
  visibleFloorPlans(fixture);
  assert.equal(fixture.floors.length,3);
  assert.equal(fixture.floors[1].title,'Схема верхнего уровня');
  assert.equal(fixture.floors[1].points[0].description,'Сохранить');
  assert.equal(fixture.floors[2].title,'Схема с обозначениями');
});
test('custom editorial notes remain unchanged on the second floor',()=>{
  const edited=structuredClone(fixture);
  edited.floors[2].note='Утверждённое описание ДК';
  const [first,second]=visibleFloorPlans(edited);
  assert.equal(first.title,'Первый этаж');
  assert.equal(second.note,'Утверждённое описание ДК');
});
