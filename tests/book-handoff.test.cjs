const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../dist/book.js'),'utf8');
assert(!source.includes('preserveDrawingBuffer:true'),'Every frame is drawn; no retained framebuffer copy is needed');
assert(!/canvas\.style\.opacity=String\(1-/.test(source),'No raster->live crossfade: the destination is never drawn as a raster');
const schedule=source.match(/function turnSchedule\(count\) \{[\s\S]*?\n  \}/)[0];
const riffle=source.slice(source.indexOf('async function riffle('),source.indexOf('\n  async function go('));
(async()=>{
  for(const reverse of [false,true]){
    let next,draws=[],headerUpdates=0,finished=0,overlayHost=null;
    const from=reverse?1:0,target=1-from,state={target};
    const pages=[{style:{}},{style:{}}];
    const snapshots=[];
    const renderer={canvas:{style:{}},pinImages(){},prepare(){},cacheImage(){},clear(){},bound:null,bind(a){this.bound=a},paint(t){draws.push([this.bound,t])}};
    const ctx={URLSearchParams,location:{search:''},TURN_DURATION:1650,active:state,pages,renderer,scrollPositions:[0,0],
      ids:['hero','work'],header:{},raf:0,
      book:{classList:{add(){}},append(){overlayHost='book'},dataset:{}},
      document:{body:{append(){overlayHost='body'}},createElement:()=>({setAttribute(){},append(){}})},
      performance:{now:()=>0},preparePageImages:async()=>{},texture:async(i)=>({index:i}),
      updateHeader(){headerUpdates++},finish(){finished++},
      requestAnimationFrame(fn){next=fn;return 1}};
    vm.createContext(ctx);
    await vm.runInContext(`${schedule}\n${riffle}\nriffle(active,${from},${reverse?-1:1},854,773,0)`,ctx);
    assert.equal(headerUpdates,1,'Destination header must be prepared before motion');
    assert.equal(overlayHost,'body','Only the moving sheet may stack above the live header');
    assert.equal(pages[from].style.visibility,'hidden');
    const destination=draws.some(([img])=>img&&img.index===target);
    // paint(0) is the initial call; draws so far: outgoing flat half only (destination half skipped).
    assert(!destination,'Destination must never be drawn as a flat raster');
    // Two held frames at pose 0 let the live destination lay out and rasterise
    // beneath the canvas before anything moves; they draw nothing new.
    draws=[];next(0);next(0);
    assert(draws.length>0&&draws.every(([img,t])=>img.index===from&&t===0||img.index===from&&t===1),'Held frames show only the outgoing sheet, flat');
    assert(source.includes('let settleFrames=2'),'Motion starts only after the destination has had frames to rasterise');
    draws=[];next(0);
    assert(draws.some(([img,t])=>img.index===from&&t===1),'Outgoing flat half is rasterized while covered');
    assert(!draws.some(([img,t])=>img.index===target&&(t===0||t===1)),'Destination flat halves are left to the live page');
    draws=[];next(1485);
    assert.equal(draws.length,0,'At the end of motion nothing is drawn: the canvas is transparent over the live page');
    assert.equal(headerUpdates,1,'Turn must not change menu state again');
    next(1500);assert.equal(finished,1,'Settle follows immediately after the last flat frame');
  }
  console.log('PASS: live destination beneath a transparent canvas, no crossfade, outgoing raster only while covered');
})().catch(error=>{console.error(error);process.exitCode=1});
