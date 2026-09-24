// The phone curl's geometry (book-phone.js): the fold is a cylinder whose
// vertex-shader twin is foldPoint(). A page at rest is flat, the held point
// lands exactly under the finger, nothing ever tears or leaves the page plane
// by more than the roll, and at goneAt() no part of the page is on screen.
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=readFileSync(path.join(__dirname,'../dist/book-phone.js'),'utf8');
const geometry=src.slice(src.indexOf('  const PI=Math.PI'),src.indexOf('  function createCurlRenderer'));
const ctx=vm.createContext({Math});
vm.runInContext(geometry+';this.g={foldFor,foldPoint,crestOf,goneAt,norm}',ctx);
const {foldFor,foldPoint,crestOf,goneAt,norm}=ctx.g;
const close=(a,b,msg,eps=1e-6)=>assert.ok(Math.abs(a-b)<=eps,`${msg}: ${a} vs ${b}`);
for(const [w,h] of [[390,844],[360,740],[430,932]]){
  const rMax=Math.max(26,Math.min(60,w*.13));
  for(const n of [norm(1,0),norm(1,.18),norm(1,-.18),norm(1,.6)]){
    const C={x:w,y:h*.8};
    // At rest: every point stays where it is.
    const flat=foldFor(C,n,0,rMax);
    for(const [x,y] of [[0,0],[w,h],[w,C.y],[w/2,h/3]]){const p=foldPoint(x,y,flat);close(p.x,x,'flat x');close(p.y,y,'flat y');assert.equal(p.z,0)}
    close(crestOf(C,n,0,rMax),w,'a flat page reaches the right edge');
    // The held point is carried exactly to F = C - n·D.
    for(const D of [5,40,120,300,700]){
      const f=foldFor(C,n,D,rMax),p=foldPoint(C.x,C.y,f);
      close(p.x,C.x-n.x*D,`held point x at D=${D}`,1e-6);close(p.y,C.y-n.y*D,`held point y at D=${D}`,1e-6);
      assert.ok(f.R<=rMax+1e-9);
      // Continuity across the fold (no tearing): neighbouring page points stay neighbours.
      for(let y=0;y<=h;y+=h/8)for(let x=0;x<w;x+=w/60){
        const a=foldPoint(x,y,f),b=foldPoint(x+w/60,y,f);
        assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<=w/60+1e-6,'the page never stretches');
        assert.ok(a.z>=0&&a.z<=2*f.R+1e-9);
      }
    }
    // Gone: every page point is off the left of the screen.
    const G=goneAt(C,n,rMax,h),g=foldFor(C,n,G,rMax);
    for(let y=0;y<=h;y+=h/40)for(let x=0;x<=w;x+=w/40)assert.ok(foldPoint(x,y,g).x<=0,`point ${x},${y} still on screen at goneAt`);
    // A finger moving on turns the page further: the crest only moves left.
    let last=Infinity;for(let D=0;D<=G;D+=G/50){const c=crestOf(C,n,D,rMax);assert.ok(c<=last+1e-9);last=c}
  }
}
console.log('PASS: phone curl is flat at rest, carries the held point to the finger, never stretches, and leaves the screen at goneAt');
