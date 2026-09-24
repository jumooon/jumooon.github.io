const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../dist/book.js'),'utf8');
const duration=Number(source.match(/const TURN_DURATION = (\d+)/)[1]);
function readFunction(name){
  const body=source.match(new RegExp('function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'))[0];
  return vm.runInNewContext(`const TURN_DURATION=${duration}; (${body})`);
}
const schedule=readFunction('turnSchedule');
assert.equal(duration,1850);
assert.equal(schedule(1).duration,duration);
for(let count=1;count<=4;count++){
  const s=schedule(count);let peak=0;
  for(let t=0;t<s.duration;t++)peak=Math.max(peak,s.turns.filter(x=>t>x.start&&t<x.start+x.duration).length);
  assert(peak<=2,'At most two curved sheets may be drawn together');
  assert.equal(s.turns.length,count);
  if(count>1)assert(Math.max(...s.turns.map(x=>x.duration))/Math.min(...s.turns.map(x=>x.duration))<1.2,'Neighboring sheets must not suddenly rush');
  for(let i=1;i<count;i++)assert(s.turns[i].start<s.turns[i-1].start+s.turns[i-1].duration);
  if(count>1)assert(s.duration<count*duration,'Riffle must be faster than independent turns');
}
for(let distance=1;distance<=100;distance++){
  let remaining=distance,drawn=0;
  while(remaining){const batch=Math.min(4,remaining);drawn+=schedule(batch).turns.length;remaining-=batch;}
  assert.equal(drawn,distance);
}
// The turn ends on the frame the last sheet is flat; the schedule's trailing
// 165 ms is not animated (see riffle(): motionEnd = schedule.duration - 165).
assert(source.includes('motionEnd=schedule.duration-165'));
assert(!source.includes('function turnPose'),'The opacity handoff pose is gone with the crossfade');
console.log('PASS: slower single turn, overlapping bounded riffles, 1–100 page distances, flat end without crossfade');
