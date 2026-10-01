(() => {
 // Opt-in diagnostic only; no sampling or UI is installed for normal visitors.
 if(new URLSearchParams(location.search).has('framecheck')){
   const samples=[];let previous=0,start=0;
   const output=document.createElement('output');
   output.style.cssText='position:fixed;bottom:8px;left:8px;z-index:100;background:white;color:black;padding:8px;font:12px monospace';
   output.textContent='Frame check: sampling for 6 seconds';
   document.body.append(output);
   function sample(t){
     if(!start)start=t;
     if(previous)samples.push(t-previous);
     previous=t;
     if(t-start<6000){requestAnimationFrame(sample);return;}
     const sorted=[...samples].sort((a,b)=>a-b);
     output.textContent='Frame check: median '+sorted[Math.floor(sorted.length*.5)].toFixed(1)+'ms; p95 '+sorted[Math.floor(sorted.length*.95)].toFixed(1)+'ms; over 25ms '+samples.filter(n=>n>25).length+'/'+samples.length;
   }
   requestAnimationFrame(sample);
 }
 const book=document.getElementById('book'),header=document.querySelector('.site-header');
 const pages=[...book.children].filter(p=>p.matches('section,footer'));
 let current=Math.max(0,pages.findIndex(p=>p.id===location.hash.slice(1).split('/')[0]));
 let moving=false,lastWheel=0,locked=false,touch=null,pendingHistory=null;
 // A gesture that scrolls content cannot also turn the section at its tail.
 const gesturePause=180,turnDistance=48;
 let wheelGesture=null;
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const ocean=window.createOcean?.(document.querySelector('.ocean-scene'),{preserveDrawingBuffer:false});
 let oceanRunning=null;
 function runOcean(value){
   if(oceanRunning===value)return;
   oceanRunning=value;
   ocean?.setRunning(value);
 }
 const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 function buildMenus(){
   pages.forEach(page=>{
     page.querySelector(':scope > .section-menu')?.remove();
     const menu=header.cloneNode(true);
     menu.classList.add('section-menu');
     menu.removeAttribute('id');
     menu.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
     menu.dataset.page=page.id;
     menu.inert=false;
     menu.querySelectorAll('a').forEach(a=>{
       const on=a.hash==='#'+page.id;
       a.classList.toggle('is-active',on);
       if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
     });
     page.prepend(menu);
   });
   resize();
 }
 // Pictures further down the current page are loaded and decoded while the page
 // is idle, nearest first, one at a time. Otherwise a lazy picture is fetched
 // and decoded the moment the scroll reaches it, and its first paint can cost
 // a frame in the middle of the scroll. Stops when the page changes.
 let warmToken=0;
 const idle=f=>window.requestIdleCallback?requestIdleCallback(f,{timeout:1500}):setTimeout(f,200);
 function warmPictures(page){
   const token=++warmToken;
   // Every picture, loaded or not: loading is not decoding. Measured in Chrome:
   // Work's pictures were loaded but still decoded (35–58 ms each) on the
   // raster threads at the moment the scroll brought them in.
   const waiting=[...page.querySelectorAll('img')].filter(img=>img.getClientRects().length);
   const top=page.getBoundingClientRect().top;
   waiting.sort((a,b)=>Math.abs(a.getBoundingClientRect().top-top)-Math.abs(b.getBoundingClientRect().top-top));
   const next=()=>{
     if(token!==warmToken||moving)return;
     const img=waiting.shift();if(!img)return;
     idle(()=>{
       if(token!==warmToken||moving)return;
       img.loading='eager';
       img.decode().catch(()=>{}).then(()=>next());
     });
   };
   next();
 }
 function sync(){
   // Each menu belongs to its own section, including while two are sliding.
   // With reduced motion the water is shown still (one drawn frame, the real
   // sky's colours), not moving: constant decorative motion is the first thing
   // that setting asks to stop.
   runOcean(!moving&&current===0&&!document.hidden&&!reducedMotion.matches);
 }
 reducedMotion.addEventListener?.('change',()=>sync());
 function resize(){
   const menu=pages[current].querySelector('.section-menu');
   const height=menu?.getBoundingClientRect().height;
   if(height)document.documentElement.style.setProperty('--book-header-height',height+'px');
 }
 window.addEventListener('resize',resize);
 pages.forEach((p,i)=>{p.hidden=i!==current;p.inert=i!==current;p.setAttribute('aria-hidden',String(i!==current));});
 if(window.CONTENT_RENDERED)buildMenus();
 sync();resize();
 addEventListener('load',()=>warmPictures(pages[current]),{once:true});
 // Room change timing (reviewed against Emil Kowalski's review-animations):
 // a full-screen panel, so the drawer budget and curve, 450 ms (was 700 ms).
 // From the keyboard it is a short 240 ms ease-out (keyboard actions should
 // barely animate). With reduced motion it is a 200 ms crossfade, no movement.
 const SLIDE_MS=450,SLIDE_EASE='cubic-bezier(0.32, 0.72, 0, 1)',KEY_MS=240,KEY_EASE='cubic-bezier(0.23, 1, 0.32, 1)',FADE_MS=200;
 async function go(index,update=true,fromMenu=false,fromKey=false){
   if(moving||index<0||index>=pages.length)return;
   if(index===current){if(fromMenu)pages[current].scrollTo({top:0,behavior:reducedMotion.matches?'instant':'smooth'});return;}
   const from=pages[current],to=pages[index],direction=index>current?1:-1;
   moving=true;locked=true;book.classList.add('is-sliding');
   // Freeze the existing canvas before compositing the two moving surfaces.
   runOcean(false);
   from.inert=true;
   const fade=reducedMotion.matches;
   to.style.transform=fade?'translate3d(0,0,0)':'translate3d(0,'+(direction*100)+'%,0)';
   if(fade)to.style.opacity='0';
   to.hidden=false;to.inert=true;
   if(from.contains(document.activeElement))document.activeElement.blur();
   to.scrollTop=fromMenu||direction>0?0:to.scrollHeight;
   // Decode only images in the incoming viewport, never the entire Work list.
   const top=to.getBoundingClientRect().top;
   const images=[...to.querySelectorAll('img')].filter(img=>{
     const rect=img.getBoundingClientRect();
     return rect.bottom>top&&rect.top<top+to.clientHeight;
   });
   let decodeTimer;
   await Promise.race([
     Promise.allSettled(images.map(img=>img.decode())),
     // At most 60 ms (was 160): the wait sits between the input and the first
     // movement, and warmPictures has usually decoded these already.
     new Promise(resolve=>{decodeTimer=setTimeout(resolve,60);})
   ]);
   clearTimeout(decodeTimer);
   // Allow layout, first paint and layer allocation to finish before motion.
   await nextPaint();
   const options=fade?{duration:FADE_MS,easing:'ease',fill:'both'}:{duration:fromKey?KEY_MS:SLIDE_MS,easing:fromKey?KEY_EASE:SLIDE_EASE,fill:'both'};
   const a=fade?from.animate([{opacity:1},{opacity:0}],options):from.animate([{transform:'translate3d(0,0,0)'},{transform:'translate3d(0,'+(-direction*100)+'%,0)'}],options);
   const b=fade?to.animate([{opacity:0},{opacity:1}],options):to.animate([{transform:'translate3d(0,'+(direction*100)+'%,0)'},{transform:'translate3d(0,0,0)'}],options);
   await Promise.allSettled([a.finished,b.finished]);
   to.style.transform='translate3d(0,0,0)';
   from.hidden=true;from.setAttribute('aria-hidden','true');a.cancel();b.cancel();
   from.style.removeProperty('transform');to.style.removeProperty('opacity');
   current=index;to.inert=false;to.setAttribute('aria-hidden','false');
   moving=false;book.classList.remove('is-sliding');sync();resize();warmPictures(to);
   if(fromMenu){to.setAttribute('tabindex','-1');to.focus({preventScroll:true});}
   if(update&&!pendingHistory)history.pushState({page:to.id},'', '#'+to.id);
   if(pendingHistory){const route=pendingHistory;pendingHistory=null;restoreHistory(route);}
 }
 function edge(p,d){return d>0?p.scrollTop+p.clientHeight>=p.scrollHeight-2:p.scrollTop<=2;}
 function nested(target,d){
   for(let el=target;el&&el!==pages[current];el=el.parentElement){
     if(el.scrollHeight>el.clientHeight+2&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&!edge(el,d))return true;
   }
   return false;
 }
 // A wheel gesture belongs to the scroller it started on. One that turned the
 // page (its remaining momentum), or one started during a slide (when the book
 // takes no pointer), stays with the old page or with the window, so the new
 // page did not move until that gesture ended: About, entered from Method,
 // looked stuck for a moment (reproduced in Chrome: 82 wheel events, About
 // scrollTop stayed 0). So each gesture is checked once: if a few frames after
 // it starts the page has not moved although it could, its wheel steps are
 // applied to the page here for the rest of that gesture.
 let carry=null;
 function carryWheel(e,gap){
   const page=pages[current],unit=e.deltaMode===1?16:e.deltaMode===2?page.clientHeight:1,dy=e.deltaY*unit;
   if(!carry||gap>=gesturePause)carry={state:'unknown',top:page.scrollTop,sum:0,page,target:e.target};
   if(carry.page!==page)carry={state:'unknown',top:page.scrollTop,sum:0,page,target:e.target};
   if(carry.state==='manual'){page.scrollTop+=dy;return;}
   if(carry.state!=='unknown')return;
   carry.sum+=dy;
   if(carry.timer)return;
   const c=carry;
   c.timer=requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
     if(carry!==c||moving)return;
     const d=Math.sign(c.sum);
     if(page.scrollTop===c.top&&d&&!edge(page,d)&&!nested(c.target,d)){c.state='manual';page.scrollTop+=c.sum;}
     else c.state='native';
   })));
 }
 book.addEventListener('wheel',e=>{
   if(e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||!e.deltaY)return;
   const now=performance.now(),gap=now-lastWheel;lastWheel=now;
   if(moving){carry=null;return;}
   carryWheel(e,gap);
   if(locked){if(gap<gesturePause)return;locked=false;wheelGesture=null;}
   if(document.body.classList.contains('work-detail-open'))return;
   const d=Math.sign(e.deltaY);
   const atBoundary=edge(pages[current],d);
   // Most events only scroll the current page. Avoid walking its DOM ancestors
   // and reading computed styles until a section boundary is actually reached.
   const nestedCanScroll=atBoundary&&nested(e.target,d);
   if(!wheelGesture||gap>=gesturePause||wheelGesture.direction!==d){
     wheelGesture={direction:d,eligible:atBoundary&&!nestedCanScroll,distance:0};
   }
   if(nestedCanScroll||!atBoundary){
     wheelGesture.eligible=false;
     return;
   }
   if(!wheelGesture.eligible)return;
   // Wheel deltas can be pixels, lines or pages; normalize before accumulating.
   const unit=e.deltaMode===1?16:e.deltaMode===2?pages[current].clientHeight:1;
   wheelGesture.distance+=Math.abs(e.deltaY)*unit;
   if(wheelGesture.distance>=turnDistance){
     wheelGesture.eligible=false;
     go(current+d);
   }
 },{passive:true}); // CSS overscroll containment keeps native scrolling in this room.
 book.addEventListener('touchstart',e=>{
   if(e.touches.length!==1){touch=null;return;}
   const t=e.touches[0];touch={x:t.clientX,y:t.clientY,top:edge(pages[current],-1),bottom:edge(pages[current],1)};
 },{passive:true});
 // Passive: a touchmove listener that can cancel makes the browser wait for this
 // script before every scroll step of the page (a scroll-blocking handler), so
 // the native scroll could no longer run on its own. Nothing here cancels: the
 // bounce at a page's end is turned off in CSS (overscroll-behavior-y: none),
 // and during a slide the book takes no touches (pointer-events: none).
 book.addEventListener('touchmove',e=>{
   if(e.touches.length!==1){touch=null;return;}
   if(moving||!touch||document.body.classList.contains('work-detail-open'))return;
   const t=e.touches[0],dy=touch.y-t.clientY,dx=touch.x-t.clientX;
   if(Math.abs(dy)<45||Math.abs(dx)>Math.abs(dy))return;
   const d=Math.sign(dy);
   if((d>0?touch.bottom:touch.top)&&!nested(e.target,d)){touch=null;go(current+d);}
 },{passive:true});
 book.addEventListener('touchend',()=>{touch=null;},{passive:true});
 book.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
 document.addEventListener('keydown',e=>{
   if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button,video,iframe,[contenteditable]')||document.body.classList.contains('work-detail-open'))return;
   const d=e.key===' '?(e.shiftKey?-1:1):['ArrowDown','PageDown'].includes(e.key)?1:['ArrowUp','PageUp'].includes(e.key)?-1:0;
   if(d&&edge(pages[current],d)){e.preventDefault();if(!e.repeat)go(current+d,true,false,true);}
 });
 book.addEventListener('click',e=>{
   const a=e.target.closest('.section-menu a');if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;
   const i=pages.findIndex(p=>'#'+p.id===a.hash);if(i<0)return;
   e.preventDefault();e.stopPropagation();go(i,true,true);
 },true); // Handle menus before Work's independent case-study router.
 function restoreHistory(route){
   if(moving){pendingHistory=route;return;}
   const [page,study]=route;
   document.dispatchEvent(new CustomEvent('book:history',{detail:{page,case:study}}));
   const i=pages.findIndex(p=>p.id===(page||'hero'));if(i>=0)go(i,false,true);
 }
 window.addEventListener('popstate',()=>{
   restoreHistory(location.hash.slice(1).split('/'));
 });
 document.addEventListener('content:rendered',()=>{buildMenus();sync();clock();});
 document.addEventListener('visibilitychange',()=>{sync();clock();});
 const place=document.getElementById('hero-place');
 const clocks=Object.fromEntries(Object.entries({busan:'Asia/Seoul',sandiego:'America/Los_Angeles'}).map(([id,timeZone])=>[id,new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone})]));
 let clockTimer;
 function clock(){
   clearTimeout(clockTimer);
   place.querySelectorAll('[data-place]').forEach(b=>{
     b.setAttribute('aria-pressed',String(b.dataset.place===ocean?.city));
     const label=b.querySelector('.place-time');
     if(label)label.textContent=clocks[b.dataset.place]?.format(new Date())||'';
   });
   if(!document.hidden)clockTimer=setTimeout(clock,60000-Date.now()%60000);
 }
 place.addEventListener('click',e=>{const b=e.target.closest('[data-place]');if(b){ocean?.setCity(b.dataset.place);clock();}});
 clock();
})();
