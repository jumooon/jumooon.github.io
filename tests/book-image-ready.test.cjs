const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../dist/book.js'),'utf8');
const fn=source.match(/async function preparePageImages\(index\) \{[\s\S]*?\n  \}/)[0];
(async()=>{
  let release,ready=false;
  const image={loading:'lazy',decode:()=>new Promise(resolve=>{release=resolve})};
  const broken={loading:'lazy',decode:()=>Promise.reject(Error('unavailable'))};
  const context={pages:[{querySelectorAll:()=>[image,broken]}]};
  vm.createContext(context);
  const preparing=vm.runInContext(`${fn};preparePageImages(0)`,context).then(()=>{ready=true});
  assert.equal(ready,false,'Navigation must wait for decoding');
  assert.equal(image.loading,'eager');
  release();await preparing;
  assert.equal(ready,true,'A broken image must not block the whole book');
  assert(source.includes('!pinnedImages.has(image)'),'Active batch must not be evicted');
  console.log('PASS: destination image decoding completes before motion; broken images remain navigable');
})().catch(error=>{console.error(error);process.exitCode=1});
