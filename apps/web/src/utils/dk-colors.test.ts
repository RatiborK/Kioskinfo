// apps/web/src/utils/dk-colors.test.ts — validate colors and adapt ink on both background extremes.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DK_BACKGROUND,DK_GLOW,dkThemeVars,normalizeHex} from './dk-colors.ts';
test('hex color input has closed format; arbitrary CSS cannot enter variables',()=>{
  assert.equal(normalizeHex('#AaBBcc',DK_BACKGROUND),'#aabbcc');
  for(const invalid of ['red','#abc','#ffffff;opacity:0','url(javascript:x)',null,'#12345678'])
    assert.equal(normalizeHex(invalid,DK_BACKGROUND),DK_BACKGROUND);
});
test('background and glow are independent variables; readable ink adapts',()=>{
  const dark=dkThemeVars('#142638','#cfa72a');
  const light=dkThemeVars('#f4f5f7','#cfa72a');
  assert.equal(dark['--v-bg'],'#142638');
  assert.equal(dark['--v-text'],'#f8fbff');
  assert.equal(light['--v-text'],'#091422');
  assert.equal(dark['--dk-glow-rgb'],'207,167,42');
  assert.notEqual(dark['--v-nav'],light['--v-nav']);
  assert.equal(dkThemeVars(null,null)['--dk-glow-rgb'],dkThemeVars(DK_BACKGROUND,DK_GLOW)['--dk-glow-rgb']);
});
