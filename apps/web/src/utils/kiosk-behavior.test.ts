import assert from 'node:assert/strict';
import {test} from 'node:test';
import {visiblePosterWindow,shouldReturnHome} from './kiosk-behavior.ts';
test('poster filmstrip handles zero, one and two posters',()=>{
  assert.deepEqual(visiblePosterWindow([],0),[]);
  assert.deepEqual(visiblePosterWindow(['a'],0),[{poster:'a',index:0}]);
  assert.deepEqual(visiblePosterWindow(['a','b'],1),[{poster:'a',index:0},{poster:'b',index:1}]);
});
test('poster filmstrip follows active index without losing true item positions',()=>{
  const posters=Array.from({length:12},(_,i)=>'p'+i);
  const visible=visiblePosterWindow(posters,9);
  assert.equal(visible.length,6);
  assert.deepEqual(visible.map(item=>item.index),[6,7,8,9,10,11]);
  assert.deepEqual(visiblePosterWindow(posters,0).map(x=>x.index),[0,1,2,3,4,5]);
  assert.equal(visiblePosterWindow(posters,11).at(-1)?.index,11);
});
test('inactivity return only after threshold and not with backwards timestamps',()=>{
  assert.equal(shouldReturnHome(1000,180999),false);
  assert.equal(shouldReturnHome(1000,181000),true);
  assert.equal(shouldReturnHome(1000,999),false);
  assert.equal(shouldReturnHome(Number.NaN,200000),false);
});
