const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../dist/ocean.js'),'utf8');
// The book reads the canvas back (page snapshots), so the buffer is kept unless a
// caller opts out: scroll mode passes {preserveDrawingBuffer:false}; book.js
// passes nothing and keeps it.
assert(source.includes('preserveDrawingBuffer:options.preserveDrawingBuffer!==false'));
const book=readFileSync(require('node:path').join(__dirname,'../dist/book.js'),'utf8');
assert(/createOcean\(document\.querySelector\('\.ocean-scene'\)\)/.test(book),'book.js keeps the default (buffer kept)');
const method=source.match(/setRunning\(value\)\{[\s\S]*?\n      \}/)[0];
let draws=0,scheduled=0,cleared=0;
const ctx={running:true,scene:{dataset:{}},lost:false,loaded:true,raf:1,last:10,timer:7,
  cancelAnimationFrame(){},requestAnimationFrame(){return 2},frame(){},
  clearInterval(){cleared++},schedule(){scheduled++},
  draw(){draws++},compute(){throw Error('Pausing must not recompute the sky')}};
vm.createContext(ctx);
vm.runInContext(`const api={${method}};api.setRunning(false)`,ctx);
assert.equal(ctx.running,false);assert.equal(ctx.last,null);assert.equal(draws,1);
assert.equal(ctx.scene.dataset.oceanRunning,'false');
assert.equal(cleared,1);assert.equal(scheduled,0,'paused water must not keep the 30s sky timer');
vm.runInContext('api.setRunning(true)',ctx);
assert.equal(ctx.running,true);assert.equal(ctx.raf,2);assert.equal(scheduled,1);
console.log('PASS: ocean retains its buffer, freezes without recomputing, and stops the sky timer while paused');
