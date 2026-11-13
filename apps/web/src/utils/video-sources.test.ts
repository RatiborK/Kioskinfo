// apps/web/src/utils/video-sources.test.ts — links must become players, never full websites.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveVideoSource} from './video-sources.ts';
test('YouTube watch, shorts and shortlinks resolve to an embedded player only',()=>{
  const expected='https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0';
  for(const value of [
    'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    'https://www.youtube.com/shorts/M7lc1UVf-VE',
    'https://youtu.be/M7lc1UVf-VE',
  ])assert.deepEqual(resolveVideoSource(value),{kind:'embed',src:expected});
});
test('RUTUBE ordinary and embedded paths resolve to embed endpoint',()=>{
  const id='7716bd3e665725c3c008ae7ab4ff02e2';
  assert.deepEqual(resolveVideoSource('https://rutube.ru/video/'+id+'/'),
    {kind:'embed',src:'https://rutube.ru/play/embed/'+id});
  assert.deepEqual(resolveVideoSource('https://rutube.ru/play/embed/'+id),
    {kind:'embed',src:'https://rutube.ru/play/embed/'+id});
});
test('VK Video post links and embed links always resolve to video_ext player',()=>{
  const expected='https://vkvideo.ru/video_ext.php?oid=-139157852&id=456239750';
  assert.deepEqual(resolveVideoSource('https://vkvideo.ru/video-139157852_456239750'),{kind:'embed',src:expected});
  assert.deepEqual(resolveVideoSource(expected),{kind:'embed',src:expected});
});
test('local video uses native player and never accepts arbitrary same-origin paths',()=>{
  const id='913b2be2-d524-45dc-b94e-e0942fd9385c';
  const file='/api/public/culture/video/'+id+'.mp4';
  assert.deepEqual(resolveVideoSource(file),{kind:'file',src:file});
  assert.equal(resolveVideoSource('/api/public/culture/video/../admin.mp4'),null);
  assert.equal(resolveVideoSource('/api/public/culture/media/'+id+'.jpg'),null);
});
test('arbitrary pages, javascript links and other hosts never become iframes',()=>{
  for(const src of [
    'https://youtube.com/','https://vkvideo.ru/','https://rutube.ru/',
    'https://example.org/video','https://youtube.com.evil.example/watch?v=M7lc1UVf-VE',
    'http://youtube.com/watch?v=M7lc1UVf-VE','javascript:alert(1)',
    'https://youtu.be/invalid','file:///C:/video.mp4',
    'https://www.youtube.com/watch?v=M7lc1UVf-VE#x',
  ])assert.equal(resolveVideoSource(src),null,src);
});
