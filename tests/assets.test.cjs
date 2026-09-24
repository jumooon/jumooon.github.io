// Every local file the site names must exist under dist/, with the exact case
// (GitHub Pages is case-sensitive): the page's src/srcset/href attributes, the
// exhibit manifest, and the WebP copies work-preview.js offers.
const {readFileSync,existsSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const dist=path.join(__dirname,'../dist');
const html=readFileSync(path.join(dist,'index.html'),'utf8');
const names=new Set();
for(const m of html.matchAll(/\b(?:src|href)="([^"#:?]+)(?:\?[^"]*)?"/g))names.add(m[1]);
for(const m of html.matchAll(/\bsrcset="([^"]+)"/g))for(const part of m[1].split(','))names.add(part.trim().split(/\s+/)[0]);
const manifest=readFileSync(path.join(dist,'work-exhibits.js'),'utf8');
for(const m of manifest.matchAll(/(?:src|link):\s*'(exhibits\/[^']+)'/g))names.add(m[1]);
const preview=readFileSync(path.join(dist,'work-preview.js'),'utf8');
const webp=preview.match(/const WEBP = \{([\s\S]*?)\};/)[1];
for(const m of webp.matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)){
  const base=m[1].replace(/\.(jpe?g|png)$/i,'');
  names.add(base+'.webp');
  for(const w of m[2].split(',').map(x=>x.trim()).filter(Boolean))names.add(base+'-'+w+'.webp');
}
const missing=[...names].filter(n=>!/^(https?:|data:|mailto:)/.test(n)&&!existsSync(path.join(dist,n)));
assert.deepEqual(missing,[],'missing files: '+missing.join(', '));
console.log('PASS: all '+names.size+' local files the site names exist');
