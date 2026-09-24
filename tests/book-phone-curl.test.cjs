// The phone's finger mapping (book-phone.js curlTable) must mirror the mesh:
// a flat page reaches the right edge, the pose where it has fully passed the
// spine is found, and a finger moving left always turns the page further.
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const book=readFileSync(path.join(__dirname,'../dist/book.js'),'utf8');
const phone=readFileSync(path.join(__dirname,'../dist/book-phone.js'),'utf8');
const context=vm.createContext({Math,Map});
vm.runInContext(book.match(/function poseProgress\(t\)\{[^\n]*\}/)[0],context);
vm.runInContext('const curlTables=new Map();'+phone.match(/function curlTable\(w,h\)\{[\s\S]*?\n  \}\n/)[0]+'this.curlTable=curlTable;',context);
for(const [w,h] of [[390,844],[360,740],[430,932]]){
  const table=context.curlTable(w,h);
  assert.equal(table.tAt(w),0,'a flat page reaches the right edge');
  assert.ok(table.tEnd>0.4&&table.tEnd<0.7,`the page leaves the screen part-way through the pose (tEnd ${table.tEnd})`);
  assert.equal(table.tAt(0),table.tEnd);
  let last=-1;
  for(let r=w;r>=0;r-=w/40){const t=table.tAt(r);assert.ok(t>=last,`reach ${r}: pose must not go back (${t} < ${last})`);last=t}
}
console.log('PASS: phone curl mapping is monotonic and ends where the sheet leaves the screen');
