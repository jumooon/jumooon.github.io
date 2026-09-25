// The phone turn is timed by what can be seen (book-phone.js visiblePace), and
// lifts from grabPoint(), where the corner is at the fold at rest.
//  - No snap at the start: the first sliver of motion moves no page point by
//    more than a few pixels (the old grab point flipped a 25x140 px corner
//    triangle over in the first frame, a 50 px jump).
//  - The pace table runs 0 → gone, never backwards.
//  - On phone sizes, the most any page edge, the crest or the shadow's edge
//    moves on screen in one 60 Hz frame of an 1100 ms turn stays under 28 px
//    (timed by D with the 2.2 cap it was 36 px, plus the 50 px snap).
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=readFileSync(path.join(__dirname,'../dist/book-phone.js'),'utf8');
const geometry=src.slice(src.indexOf('  const PI=Math.PI'),src.indexOf('  function createCurlRenderer'));
const capped=src.match(/  function cappedEase\(V\)\{[\s\S]*?\n  \}/)[0];
const peak=+src.match(/Math\.max\(1\.2,\+params\.get\('peak'\)\|\|([\d.]+)\)/)[1];
const ctx=vm.createContext({Math,Map,Float64Array});
vm.runInContext(geometry+capped+';this.g={foldFor,foldPoint,goneAt,norm,grabPoint,visiblePace,cappedEase,TILT}',ctx);
const g=ctx.g;
for(const [w,h] of [[390,700],[390,780],[360,660],[430,860]]){
  const rMax=Math.max(26,Math.min(60,w*.13)),n=g.norm(1,g.TILT),C=g.grabPoint(w,h,n),gone=g.goneAt(C,n,rMax,h);
  // No snap at the start.
  const first=g.foldFor(C,n,0.5,rMax);
  for(let y=0;y<=h;y+=h/40)for(let x=0;x<=w;x+=w/40){const q=g.foldPoint(x,y,first);assert.ok(Math.hypot(q.x-x,q.y-y)<=2,`point ${x},${y} jumps at the first lift`)}
  // Monotonic table from 0 to gone.
  const toD=g.visiblePace(C,n,rMax,w,h,gone);
  assert.equal(toD(0),0);assert.equal(toD(1),gone);
  let last=-1;for(let v=0;v<=1;v+=1/500){const D=toD(v);assert.ok(D>=last-1e-9,'never backwards');last=D}
  // Largest on-screen move per frame.
  const pts=[];for(let k=0;k<=60;k++)pts.push([w,h*k/60],[w*k/60,0],[w*k/60,h]);
  const seen=([x,y])=>x>=0&&x<=w&&y>=0&&y<=h;
  const at=D=>{const f=g.foldFor(C,n,D,rMax),o=pts.map(([x,y])=>{const q=g.foldPoint(x,y,f);return [q.x,q.y]});
    for(let k=0;k<=30;k++){const y=h*k/30,ax=f.P.x-(y-f.P.y)*n.y/n.x;o.push([ax+f.R*n.x,y])}return o};
  const e=g.cappedEase(peak),N=66;let prev=at(0),most=0;
  for(let i=1;i<=N;i++){const cur=at(toD(e(i/N)));cur.forEach((p,j)=>{if(seen(p)||seen(prev[j]))most=Math.max(most,Math.hypot(p[0]-prev[j][0],p[1]-prev[j][1]))});prev=cur}
  assert.ok(most<28,`${w}x${h}: ${most.toFixed(1)} px in one frame`);
}
console.log('PASS: phone turn lifts without a snap and is paced by what is seen (under 28 px a frame)');
