const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../dist/book.js'),'utf8');
const fn=source.match(/function rasterScale\(w,h,dpr\) \{[\s\S]*?\n  \}/)[0];
const scale=vm.runInNewContext(`(${fn})`);
assert.equal(scale(854,773,2),2,'Retina viewport must keep native device pixels');
assert.equal(scale(854,773,1),1);
// A laptop window at 2x keeps native pixels, so the raster matches the live page
// at the handoff (1920x895 had been dropped to 1.67x and landed soft and offset).
assert.equal(scale(1920,895,2),2,'Full-screen laptop window keeps native device pixels');
assert.equal(scale(1920,1080,2),2);
for(const [w,h,dpr] of [[1920,1080,2],[3840,2160,2],[5120,2880,2],[390,844,3]]){
  const s=scale(w,h,dpr);
  assert(Math.max(w,h)*s<=4096.001,'Texture side stays within 4096');
  assert(s<=dpr&&s<=2);
}
assert(source.includes('bytes>256*1024*1024'),'Texture budget sized for native-resolution pages');
assert(source.includes("getContext('webgl2'"),'Prefer WebGL2 so NPOT snapshots can be mipmapped');
assert(source.includes('generateMipmap'),'Angled sheets must sample mipmapped textures (no aliasing shimmer)');
assert(/mipmapped\?gl\.LINEAR_MIPMAP_LINEAR:gl\.LINEAR/.test(source),'WebGL1 NPOT fallback keeps plain LINEAR');
assert(source.includes('EXT_texture_filter_anisotropic'));
assert(source.includes('GL_FRAGMENT_PRECISION_HIGH'),'Texture coordinates need highp where available');
// Embedded images are sized to their displayed width times the raster scale.
assert(/embeddedImage\(img, displayedWidth, displayedHeight\)/.test(source),'Embeds are sized by the rendered (object-fit) image');
assert(source.includes('createImageBitmap'));
console.log('PASS: shared native-resolution scale, bounded memory, mipmapped sampling and display-sized embeds');
