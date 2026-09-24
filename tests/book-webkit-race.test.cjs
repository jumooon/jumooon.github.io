// WebKit can draw a page snapshot before its inlined pictures have decoded
// (book.js, WEBKIT_SVG_RACE). The snapshot is checked with patches of each
// picture: a patch counts as drawn when it has about the picture's colour AND
// at least half its detail. A blank picture shows its flat, pale box, which a
// pale dashboard panel can match in colour but never in detail.
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=readFileSync(path.join(__dirname,'../dist/book.js'),'utf8');
const grab=name=>src.match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))[0];
const ctx=vm.createContext({Math});
vm.runInContext('const PATCH=8;'+grab('patchOf')+grab('probesMatch')+';this.patchOf=patchOf;this.probesMatch=probesMatch',ctx);
const {patchOf,probesMatch}=ctx;
const N=8*8;
const patch=fn=>{const d=new Uint8ClampedArray(N*4);for(let i=0;i<N;i++){const [r,g,b]=fn(i%8,Math.floor(i/8));d.set([r,g,b,255],i*4)}return d};
const flat=patch(()=>[229,234,238]);                                   // the grey box, no picture
const detailed=patch((x,y)=>(x+y)%2?[245,250,254]:[213,218,222]);   // a pale panel with fine lines, same mean colour as the box
const fake=d=>({getImageData:()=>({data:d})});
assert.equal(patchOf(flat).detail,0);
assert.ok(patchOf(detailed).detail>=6,'a panel with lines has detail');
const want=patchOf(detailed),probes=[0,1,2,3,4].map(i=>({x:i,y:0,want}));
assert.ok(probesMatch(fake(detailed),probes),'the drawn picture matches');
assert.ok(!probesMatch(fake(flat),probes),'a blank picture does not, though its mean colour is close');
// The Work fix: a fixed-size picture loading on Work no longer redraws Work.
assert.match(src,/event\.type === 'load' && target\.tagName === 'IMG' && target\.getAttribute\('width'\) && target\.getAttribute\('height'\)\) return;/);
console.log('PASS: WebKit snapshots are checked for blank pictures by colour and detail');
