const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const source=readFileSync(require('node:path').join(__dirname,'../dist/book.js'),'utf8');
const clockCode=source.slice(source.indexOf('  const cityClocks='),source.indexOf("  place.addEventListener('click'"));
let now=Date.parse('2026-09-18T22:08:59.900Z'),pending,delay;
class ClockDate extends Date {constructor(){super(now)} static now(){return now}}
const buttons=['busan','sandiego'].map(id=>({dataset:{place:id},time:{textContent:''},attributes:{},
  querySelector(selector){return selector==='.place-time'?this.time:{textContent:id}},
  setAttribute(name,value){this.attributes[name]=value}}));
const listeners={};
const ctx={Date:ClockDate,Intl,place:{querySelectorAll:()=>buttons},ocean:{city:'sandiego'},
  document:{hidden:false,addEventListener(name,fn){listeners[name]=fn}},
  window:{addEventListener(name,fn){listeners[name]=fn}},
  clearTimeout(){pending=null},setTimeout(fn,ms){pending=fn;delay=ms;return 1}};
vm.createContext(ctx);vm.runInContext(clockCode,ctx);
assert.deepEqual(buttons.map(b=>b.time.textContent),['07:08','15:08']);
assert.equal(delay,100);
now+=100;pending();
assert.deepEqual(buttons.map(b=>b.time.textContent),['07:09','15:09']);
vm.runInContext("syncPlaces({times:{busan:'00:00',sandiego:'00:00'}})",ctx);
assert.equal(buttons[0].time.textContent,'07:09','Sky updates cannot overwrite current time');
ctx.document.hidden=true;listeners.visibilitychange();assert.equal(pending,null);
now=Date.parse('2026-12-18T22:10:00Z');ctx.document.hidden=false;listeners.visibilitychange();
assert.deepEqual(buttons.map(b=>b.time.textContent),['07:10','14:10'],'Restore immediately, including winter DST offset');
assert(buttons[1].attributes['aria-label'].includes('14:10'));
console.log('PASS: minute boundary, stale sky timestamp, tab restore and DST');
