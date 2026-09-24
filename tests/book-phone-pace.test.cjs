// The phone turn's pace (book-phone.js turnEase): it keeps the cubic
// ease-in-out's slow lift and slow landing, but never runs faster than
// TURN_PEAK times the average speed — the cubic reaches 3x, a 50 px jump per
// frame at 60 Hz on a phone page, which looked choppy.
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=readFileSync(path.join(__dirname,'../dist/book-phone.js'),'utf8');
const peakLine=src.match(/const TURN_PEAK=[\d.]+;/)[0];
const ease=src.match(/const turnEase=\(\(\)=>\{[\s\S]*?\n  \}\)\(\);/)[0];
const ctx=vm.createContext({Math});
vm.runInContext(peakLine+ease+';this.f=turnEase;this.peak=TURN_PEAK',ctx);
const {f,peak}=ctx;
const cubic=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
assert.equal(f(0),0);assert.equal(f(1),1);
let last=0,maxSpeed=0;const step=1e-4;
for(let t=step;t<=1+1e-12;t+=step){
  const v=f(Math.min(1,t));
  assert.ok(v>=last-1e-12,'never goes back');
  assert.ok(v-last<=peak*step+1e-9,'never faster than the cap (and no jump anywhere)');
  maxSpeed=Math.max(maxSpeed,(v-last)/step);last=v;
}
assert.ok(maxSpeed>peak-0.01,'reaches the cap');
for(const t of [0.05,0.1,0.2,0.3,0.7,0.8,0.9,0.95])assert.ok(Math.abs(f(t)-cubic(t))<0.012,`lift and landing follow the cubic (t=${t})`);
console.log('PASS: phone turn pace keeps the cubic ends and caps the middle at '+peak+'x');
