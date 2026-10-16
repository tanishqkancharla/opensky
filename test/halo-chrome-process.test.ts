import assert from 'node:assert/strict';import {test} from 'node:test';
import {hasChromeSwitch,processStartTicks} from '../e2e/halo/chrome-process.mjs';
test('owned Chrome switch evidence supports real rewritten titles without prefix or argument-value matches',()=>{
 const flag='--type=renderer';
 assert.equal(hasChromeSwitch(['/opt/google/chrome/chrome',flag,'--ozone-platform=x11'],flag),true);
 // Actual38911685148 has one rewritten argv0 for each owned renderer.
 assert.equal(hasChromeSwitch(['/opt/google/chrome/chrome --type=renderer --ozone-platform=x11'],flag),true);
 for(const argv of [[],['chrome --type=renderer-helper'],['chrome --not-type=renderer'],['chrome --label=--type=renderer'],['chrome','--title=preview --type=renderer'],['chrome --type=zygote --no-zygote-sandbox']])assert.equal(hasChromeSwitch(argv,flag),false);
 for(const banned of ['--no-sandbox','--disable-setuid-sandbox','--disable-seccomp-filter-sandbox']){
  assert.equal(hasChromeSwitch(['chrome',banned],banned),true);assert.equal(hasChromeSwitch(['chrome --type=renderer '+banned],banned),true);
 }
 assert.equal(hasChromeSwitch(['chrome --no-zygote-sandbox'],'--no-sandbox'),false);
});
test('process epoch evidence rejects missing or malformed stat fields',()=>{
 const valid='42 (chrome (test)) S 1 '+Array(17).fill('0').join(' ')+' 12345';assert.equal(processStartTicks(valid),'12345');
 for(const stat of ['', '42 chrome S 1','42 (chrome) S 1',valid.replace('12345','unknown')])assert.throws(()=>processStartTicks(stat),/Invalid process start-time/);
});
