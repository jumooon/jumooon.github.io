/* Phones (≤760px): the book one page at a time.

   The desktop shows the book as a two-page spread and turns its right half over
   the spine in the middle (book.js). A phone is one page, so here the spine is
   the screen's left edge and the whole page turns — the same curl, drawn by the
   same renderer with its `single` option — and the page is held by the finger
   rather than played as a set animation. What lives in this file:

     beginCurl / curlTable / turnCurl   the finger-held curl and full turns
     beginSlide / slideTo               the live slide, if the curl is unavailable
     hint                               Home's swipe hint and first-visit lift
     touch handlers, holdHome           gestures below 760px

   book.js hands in `core`: its snapshot, settle/finish and history functions,
   and accessors for the values it reassigns (pages, ids, current, active, raf,
   renderer). book.js calls turn() for a menu tap / Back on a phone and sync()
   after every settle. Load this file before book.js. */
window.createBookPhone = function(core) {
  'use strict';
  const {book,header,cache,reduced,narrow,detailOpen,finish,syncOcean,updateHeader,texture,preparePageImages,navigate,pushPage,poseProgress}=core;
  let hint=null;

  // Phones: one sheet, slid rather than curled. Below 760px the screen is a
  // single page, not a two-page spread, so there is no spine to fold over. Going
  // forward, the next page is laid over the current one from the right edge;
  // going back, the current page is lifted off to the right, uncovering the one
  // beneath. The covered page drifts a little the same way and dims, and the top
  // page casts a soft shadow on it. Both sheets stay live DOM — nothing is
  // rasterised, which also spares the phone the snapshot work the curl needs —
  // and each carries a copy of the header in its own colours, so the menu travels
  // with its page as it does in the curl.
  const SLIDE_MS=560,UNDER_SHIFT=.28,UNDER_DIM=.16;
  const easeOut=t=>1-Math.pow(1-t,3);
  const easeInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  function headerFor(index){
    const h=header.cloneNode(true);
    h.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    h.classList.add('slide-header');h.inert=true;h.setAttribute('aria-hidden','true');
    h.style.removeProperty('visibility');h.style.removeProperty('transform');
    h.dataset.page=core.ids[index];
    h.querySelectorAll('.nav-links a, .brand').forEach(a=>{a.classList.toggle('is-active',a.hash==='#'+core.ids[index]);a.removeAttribute('aria-current')});
    return h;
  }
  function beginSlide(target){
    const from=core.current,forward=target>from,w=book.clientWidth;
    const topIndex=forward?target:from,underIndex=forward?from:target;
    const top=core.pages[topIndex],under=core.pages[underIndex];
    const topHead=headerFor(topIndex),underHead=headerFor(underIndex);
    const dim=document.createElement('div');dim.className='slide-dim';dim.setAttribute('aria-hidden','true');
    const incoming=core.pages[target];
    incoming.hidden=false;incoming.scrollTop=core.scrollPositions[target];
    incoming.inert=true;core.pages[from].inert=true;
    under.style.zIndex='1';underHead.style.zIndex='2';dim.style.zIndex='3';top.style.zIndex='4';topHead.style.zIndex='5';
    top.classList.add('slide-top');topHead.classList.add('slide-top');
    book.append(underHead,dim,topHead);
    header.style.visibility='hidden';
    book.classList.add('is-sliding');
    const state={slide:true,from,target,destination:target,forward,w,p:0,
      paint(p){
        state.p=p;
        const cover=forward?p:1-p;     // how much of the under sheet is covered
        const topX=(1-cover)*w,underX=-cover*UNDER_SHIFT*w;
        top.style.transform=topHead.style.transform='translate3d('+topX+'px,0,0)';
        under.style.transform=underHead.style.transform='translate3d('+underX+'px,0,0)';
        dim.style.opacity=String(cover*UNDER_DIM);
        hint?.follow(state,topX);
      },
      cleanup(){
        [top,under].forEach(el=>{el.style.removeProperty('transform');el.classList.remove('slide-top')});
        topHead.remove();underHead.remove();dim.remove();
        book.classList.remove('is-sliding');
      },
      // The drag interface shared with the curl (see the touch handlers).
      update(x,dx){state.paint(Math.max(0,Math.min(1,(forward?-dx:dx)/w)))},
      progress(){return state.p},
      release(commit){settleDrag(state,commit)}};
    return state;
  }
  function animateSlide(state,to,ms,ease,done){
    const from=state.p;let t0;
    cancelAnimationFrame(core.raf);
    function step(ts){
      if(core.active!==state)return;
      if(t0===undefined)t0=ts;
      const t=ms>0?Math.min(1,(ts-t0)/ms):1;
      state.paint(from+(to-from)*ease(t));
      if(t<1)core.raf=requestAnimationFrame(step);else done();
    }
    core.raf=requestAnimationFrame(step);
  }
  function endSlide(state,commit){
    if(core.active!==state)return;
    if(commit)book.dataset.lastTurn=JSON.stringify({mode:'slide',from:core.ids[state.from],to:core.ids[state.target]});
    else state.target=state.destination=state.from;
    finish();
  }
  function slideTo(target){
    const state=beginSlide(target);core.active=state;syncOcean();
    book.setAttribute('aria-busy','true');
    hint?.away();
    state.paint(0);
    animateSlide(state,1,SLIDE_MS,easeInOut,()=>endSlide(state,true));
  }
  // A released finger: finish the way it was going, at a speed that matches the
  // distance left, or fall back.
  function settleDrag(state,commit){
    const left=commit?1-state.p:state.p;
    animateSlide(state,commit?1:0,Math.max(160,Math.min(420,left*SLIDE_MS)),easeOut,()=>endSlide(state,commit));
  }

  // Phones: the desktop curl, one page wide, held by the finger. The screen is a
  // single page bound at its left edge, so the sheet is the whole width and turns
  // about x = 0 (renderer option single). Forward, the current page is the sheet:
  // it lifts from the right edge and curls away to the left, uncovering the live
  // next page. Back, the previous page is the sheet: it curls in from the left
  // over the live current page and lands flat, where the live page takes over.
  // Either way only one snapshot is needed — the current page going forward,
  // the previous one going back — and warm() keeps both ready while idle.
  //
  // Only the first part of the pose is ever seen: once the whole sheet has
  // passed the spine it is off screen. curlTable() measures, for each pose, how
  // far right the sheet still reaches on screen (the same geometry the mesh
  // uses), which gives the pose where it vanishes (tEnd) and lets the finger
  // hold the sheet's free edge: going forward the edge stays under the finger at
  // the offset it was picked up with; going back it follows the finger's travel,
  // scaled so the page lands flat as the finger reaches the right side.
  // Should a snapshot or WebGL fail, the gesture carries on as the slide.
  const CURL_MS=1100;
  let curlBroken=false;
  const curlTables=new Map();
  function curlTable(w,h){
    const key=w+'x'+h;if(curlTables.has(key))return curlTables.get(key);
    // Mirrors renderer.paint() in single mode for the top, middle and bottom rows.
    const cols=64,step=w/cols,persp=Math.max(3000,w*2.2),N=200,ts=[],reach=[];
    for(let i=0;i<=N;i++){
      const t=i/N,phase=Math.PI*poseProgress(t),lift=t===1?0:Math.sin(phase),base=phase-lift*0.78*0.48;
      const fold=Math.min(1,Math.max(0,(t-0.5)/0.5)),land=1-fold*fold*(3-2*fold);
      let most=0;
      for(const v of [0,0.5,1]){
        const inc=lift*(0.78+0.10*(v-0.5))/cols;let x=0,z=0,a=base+inc/2;
        for(let col=1;col<=cols;col++){
          x+=step*Math.cos(a);z+=step*Math.sin(a);a+=inc;
          most=Math.max(most,w/2+(x-w/2)/(1-z*0.68*land/persp));
        }
      }
      ts.push(t);reach.push(Math.min(w,most));
    }
    let endIndex=reach.findIndex(r=>r<=0.5);if(endIndex<0)endIndex=N;
    const table={tEnd:ts[endIndex],
      // The pose whose sheet reaches exactly r px across the screen.
      tAt(r){
        if(r>=w)return 0;if(r<=0)return ts[endIndex];
        for(let i=1;i<=endIndex;i++)if(reach[i]<=r){const k=(reach[i-1]-r)/Math.max(1e-6,reach[i-1]-reach[i]);return ts[i-1]+(ts[i]-ts[i-1])*k}
        return ts[endIndex];
      }};
    curlTables.set(key,table);return table;
  }
  function paperOf(el){
    const m=getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return m&&m.length>=3?m.slice(0,3).map(n=>Number(n)/255):[0.98,0.99,0.99];
  }
  function beginCurl(target,touchRef){
    const from=core.current,forward=target>from,sheet=forward?from:target;
    const w=book.clientWidth,h=book.clientHeight,table=curlTable(w,h);
    const x0=touchRef?touchRef.x:w,gain=Math.min(2.5,w/Math.max(1,w-x0));
    const state={curl:true,from,target,destination:target,forward,w,h,table,
      reach:forward?w:0,t:forward?0:table.tEnd,ready:false,
      progress(){return forward?1-state.reach/w:state.reach/w},
      update(x,dx){
        const e=forward?x+(w-x0):(x-x0)*gain;                  // the free edge's x
        state.reach=Math.max(0,Math.min(w,e));state.t=table.tAt(state.reach);
        requestCurlPaint(state);
      },
      release(commit){
        if(!state.ready){state.pendingRelease=commit;return}
        const to=forward===commit?0:w;
        animateCurl(state,to,Math.max(200,Math.min(650,Math.abs(to-state.reach)/w*900)),easeOut,()=>endCurl(state,commit));
      }};
    // A live Home is drawn with moving water, so its snapshot is taken afresh, as
    // on the desktop — for a finger, already at touchstart (see holdHome).
    if(!touchRef&&sheet===core.current&&core.ids[sheet]==='hero')cache.delete(sheet);
    (async()=>{
      await preparePageImages(sheet);
      if(core.active!==state)return;
      const image=await texture(sheet);
      if(core.active!==state)return;
      core.renderer.pinImages([image]);
      core.renderer.prepare(image,image,w,h,1,{single:true,paper:paperOf(core.pages[sheet])});
      const overlay=document.createElement('div');overlay.className='paper-turn';
      overlay.inert=true;overlay.setAttribute('aria-hidden','true');
      overlay.append(core.renderer.canvas);document.body.append(overlay);state.overlay=overlay;
      core.renderer.paint(state.t,w,h,1);
      // Beneath the sheet lies the later page. Going forward that is the
      // destination, shown now; going back it is the page being left, already live.
      const incoming=core.pages[target],outgoing=core.pages[from];
      if(forward){
        incoming.hidden=false;incoming.scrollTop=core.scrollPositions[target];
        incoming.style.zIndex='1';outgoing.style.zIndex='2';outgoing.style.visibility='hidden';
        updateHeader(target);
      }
      incoming.inert=true;outgoing.inert=true;
      book.classList.add('is-page-turning');
      state.ready=true;
      if(state.onReady)state.onReady();
      else if(state.pendingRelease!==undefined)state.release(state.pendingRelease);
    })().catch(error=>{
      if(core.active!==state)return;
      console.warn('Page curl unavailable; using the slide.',error);
      curlBroken=true;
      const pending=state.pendingRelease;
      state.target=state.destination=state.from;finish(true);
      if(state.peek){hint.peekSlide();return}
      if(state.onReady)slideTo(target);                         // a programmatic turn
      else if(touchRef&&!touchRef.ended){                       // the finger is still down
        const s=beginSlide(target);core.active=s;touchRef.state=s;s.update(touchRef.lastX,touchRef.lastDx||0);
      }else if(pending)slideTo(target);
    });
    return state;
  }
  function requestCurlPaint(state){
    if(!state.ready||state.painting)return;
    state.painting=true;
    core.raf=requestAnimationFrame(()=>{state.painting=false;if(core.active===state)core.renderer.paint(state.t,state.w,state.h,1)});
  }
  // Moves the sheet's free edge to `to` px (0 = gone past the spine, w = flat).
  function animateCurl(state,to,ms,ease,done){
    const from=state.reach;let start;
    cancelAnimationFrame(core.raf);state.painting=false;
    function step(ts){
      if(core.active!==state)return;
      if(start===undefined)start=ts;
      const k=ms>0?Math.min(1,(ts-start)/ms):1;
      state.reach=from+(to-from)*ease(k);state.t=state.table.tAt(state.reach);
      core.renderer.paint(state.t,state.w,state.h,1);
      if(k<1)core.raf=requestAnimationFrame(step);else done();
    }
    core.raf=requestAnimationFrame(step);
  }
  // A whole turn from the menu, Back/Forward or the hint: the pose runs at an
  // even rate, as on the desktop, so the mesh's own easing shapes the motion —
  // the sheet gathers speed as it lifts away, or loses it as it lands. Two
  // frames are held first so the page beneath is laid out before anything moves.
  function turnCurl(state,done){
    const t0=state.t,t1=state.forward?state.table.tEnd:0;let start,hold=2;
    cancelAnimationFrame(core.raf);
    function step(ts){
      if(core.active!==state)return;
      if(hold>0){hold--;core.renderer.paint(state.t,state.w,state.h,1);core.raf=requestAnimationFrame(step);return}
      if(start===undefined)start=ts;
      const k=Math.min(1,(ts-start)/CURL_MS);
      state.t=t0+(t1-t0)*k;
      core.renderer.paint(state.t,state.w,state.h,1);
      if(k<1)core.raf=requestAnimationFrame(step);else done();
    }
    core.raf=requestAnimationFrame(step);
  }
  function endCurl(state,commit){
    if(core.active!==state)return;
    if(commit)book.dataset.lastTurn=JSON.stringify({mode:'curl',from:core.ids[state.from],to:core.ids[state.target]});
    else state.target=state.destination=state.from;
    finish();
  }
  function curlTo(target){
    const state=beginCurl(target);core.active=state;syncOcean();
    book.setAttribute('aria-busy','true');
    hint?.away();
    state.onReady=()=>turnCurl(state,()=>endCurl(state,true));
  }

  // Phones, Home only: the desktop's right-hand chevron, drawn in the sky's ink
  // at rest opacity, to say the book goes on to the right. On a first visit it
  // lights once, 1.5 s after Home appears — label, glow — while Home is drawn
  // back a finger's width so the edge of the Work page shows, then lets go.
  // Tapping it turns the page. Once the reader has turned a page it is not shown
  // again for the visit; the lit peek is remembered on the device.
  hint=(()=>{
    const KEY='jm.swipeHint.seen';
    const b=document.createElement('button');
    b.type='button';b.className='swipe-hint';b.hidden=true;
    b.innerHTML='<span class="page-arrow-light" aria-hidden="true"></span><svg class="page-arrow-glyph" viewBox="0 0 12 24" aria-hidden="true"><path d="M3 3l6 9-6 9"/></svg><span class="page-arrow-label"></span>';
    document.body.append(b);
    let turned=false,peeked=false,timer=0;
    const seen=()=>{if(peeked)return true;try{return localStorage.getItem(KEY)==='1'}catch{return false}};
    const nameOf=i=>{const a=document.querySelector('#nav-links a[href="#'+core.ids[i]+'"]');return (a&&a.textContent.trim())||core.ids[i]||''};
    b.addEventListener('click',()=>{
      b.classList.add('is-pressed');setTimeout(()=>b.classList.remove('is-pressed'),420);
      navigate(core.current+1);
    });
    function peek(){
      if(core.active||document.hidden||b.hidden||reduced.matches)return;
      peeked=true;try{localStorage.setItem(KEY,'1')}catch{}
      b.classList.add('is-lit');
      if(curlBroken){peekSlide();return}
      // Home's free edge lifts a finger's width and settles back.
      const s=beginCurl(core.current+1);s.peek=true;core.active=s;syncOcean();
      s.onReady=()=>animateCurl(s,s.w-34,560,easeOut,()=>setTimeout(()=>{
        if(core.active===s)animateCurl(s,s.w,620,easeInOut,()=>endCurl(s,false));
      },380));
    }
    // Without the curl: Work's edge slides in a finger's width and back.
    function peekSlide(){
      if(core.active||b.hidden)return;
      b.classList.add('is-lit');
      const s=beginSlide(core.current+1);s.peek=true;core.active=s;syncOcean();
      s.paint(0);
      animateSlide(s,.08,460,easeOut,()=>setTimeout(()=>{
        if(core.active===s)animateSlide(s,0,560,easeInOut,()=>endSlide(s,false));
      },420));
    }
    return {
      peekSlide,
      sync(){
        if(core.ids.length&&core.ids[core.current]!=='hero')turned=true;
        const show=narrow()&&!turned&&core.ids[core.current]==='hero'&&core.ids.length>1&&!detailOpen();
        b.hidden=!show;b.classList.remove('is-away','is-lit');b.style.removeProperty('transform');
        clearTimeout(timer);
        if(!show)return;
        const n=nameOf(core.current+1);
        b.querySelector('.page-arrow-label').textContent=n;b.setAttribute('aria-label','Next page: '+n);
        if(!seen()&&!reduced.matches)timer=setTimeout(peek,1500);
      },
      // During the peek, keep the chevron just inside the edge of the Work page.
      follow(state,topX){if(state.peek&&!b.hidden)b.style.transform='translateX('+(topX-state.w)+'px)'},
      away(){clearTimeout(timer);b.classList.add('is-away')}
    };
  })();

  // Touch. The sheet follows the finger (see beginCurl). The direction is
  // decided once the finger has moved 10px: mostly sideways takes the gesture
  // from the page's vertical scroll, otherwise it is left alone. Past the first
  // or last page the sheet only stretches and springs back. Wider touch screens
  // are handled in book.js (a quick swipe turns the page).
  let touch=null;
  book.addEventListener('touchstart',e=>{
    if(!narrow()){touch=null;return}
    if(core.active?.peek){core.active.target=core.active.destination=core.active.from;finish(true)}
    const t=e.touches[0];
    touch=e.touches.length===1&&!e.target.closest('.collection-wall, .embed-stage, iframe, input, textarea')?{x:t.clientX,y:t.clientY,at:performance.now(),lock:false,trail:[]}:null;
    if(touch)holdHome(true);
  },{passive:true});
  // On Home a swipe curls a snapshot of the moving water. Taking it only once
  // the swipe is recognised would hold the page still under the finger while it
  // is drawn, so a touch on Home stops the water and starts the snapshot at
  // once; the water runs on again when the finger lifts without turning.
  function holdHome(on){
    if(on){
      if(!narrow()||core.active||detailOpen()||curlBroken||reduced.matches||core.ids[core.current]!=='hero')return;
      core.holdingHome=true;syncOcean();cache.delete(core.current);texture(core.current).catch(()=>{});
    }else if(core.holdingHome){core.holdingHome=false;syncOcean()}
  }
  book.addEventListener('touchmove',e=>{
    if(!touch||!narrow()||detailOpen())return;
    if(e.touches.length!==1){cancelTouch();return}
    const t=e.touches[0],dx=t.clientX-touch.x,dy=t.clientY-touch.y;
    if(!touch.lock){
      if(Math.hypot(dx,dy)<10)return;
      if(Math.abs(dx)<Math.abs(dy)*1.2||core.active){touch=null;return}
      touch.lock=true;
      const target=core.current+(dx<0?1:-1);
      if(target<0||target>=core.ids.length)touch.edge=true;
      else{touch.state=curlBroken||reduced.matches?beginSlide(target):beginCurl(target,touch);core.active=touch.state;syncOcean();hint?.away()}
    }
    if(e.cancelable)e.preventDefault();
    const now=performance.now();
    touch.trail.push({x:t.clientX,at:now});
    while(touch.trail.length>2&&now-touch.trail[0].at>100)touch.trail.shift();
    touch.lastX=t.clientX;touch.lastDx=dx;
    if(touch.edge){stretch(dx);return}
    const s=touch.state;if(core.active!==s){touch=null;return}
    s.update(t.clientX,dx);
  },{passive:false});
  book.addEventListener('touchend',()=>{
    const tt=touch;touch=null;holdHome(false);if(!tt||detailOpen())return;
    tt.ended=true;
    if(!tt.lock)return;
    if(tt.edge){unstretch();return}
    const s=tt.state;if(core.active!==s)return;
    const a=tt.trail[0],b=tt.trail[tt.trail.length-1];
    const v=a&&b&&b.at>a.at?(b.x-a.x)/(b.at-a.at):0;      // px per ms
    const toward=s.forward?-v:v;                           // + means "keep going"
    const done=s.progress();
    const commit=(done>.25&&toward>-.2)||(toward>.35&&done>.03);
    if(commit)pushPage(s.target);
    s.release(commit);
  },{passive:true});
  function cancelTouch(){
    const tt=touch;touch=null;holdHome(false);if(!tt||!tt.lock)return;
    tt.ended=true;
    if(tt.edge)unstretch();else if(core.active===tt.state)tt.state.release(false);
  }
  book.addEventListener('touchcancel',cancelTouch,{passive:true});
  function stretch(dx){
    const t='translate3d('+Math.sign(dx)*Math.min(56,Math.abs(dx)*.25)+'px,0,0)';
    core.pages[core.current].style.transform=t;header.style.transform=t;
  }
  function unstretch(){
    const els=[core.pages[core.current],header];
    els.forEach(el=>{el.style.transition='transform .32s cubic-bezier(.2,.8,.2,1)';el.style.removeProperty('transform')});
    setTimeout(()=>els.forEach(el=>el.style.removeProperty('transition')),340);
  }

  function turn(target){if(curlBroken)slideTo(target);else curlTo(target)}
  return {turn,sync(){if(hint)hint.sync()}};
};
