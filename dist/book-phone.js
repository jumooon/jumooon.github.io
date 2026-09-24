/* Phones (≤760px): the book one page at a time.

   The desktop shows the book as a two-page spread and turns its right half over
   the spine in the middle (book.js). A phone is one page, so it turns the way a
   single sheet of paper does: a corner lifts and the page rolls over a fold. The
   turn is always the same set motion, started by a tap — the menu, the room
   guide at the foot of the page, Back/Forward — or a quick swipe (book.js);
   it never follows the finger, which keeps the work per frame to a minimum.
   What lives in this file:

     beginCurl / foldFor / curlTo       the page curl (its own WebGL renderer)
     beginSlide / slideTo               the slide, if the curl is unavailable
     menu (three lines, top left)       the rooms as a directory
     guide (foot of the page)           ‹ previous room · 02 / 05 · next room ›
     peekCurl                           Home's first-visit dog-ear
     holdHome                           Home's snapshot, taken at the touch

   book.js hands in `core`: its snapshot, settle/finish and history functions,
   and accessors for the values it reassigns (pages, ids, current, active, raf).
   book.js calls turn() for a turn on a phone, sync() after every settle, and
   cacheImage() with idle snapshots. Load this file before book.js. */
window.createBookPhone = function(core) {
  'use strict';
  const {book,header,cache,reduced,narrow,warmLow,narrowMqListen,detailOpen,finish,syncOcean,updateHeader,texture,preparePageImages,navigate}=core;

  // ---- The slide (if the curl is unavailable) --------------------------------
  // One sheet, slid rather than curled. Going
  // forward, the next page is laid over the current one from the right edge;
  // going back, the current page is lifted off to the right, uncovering the one
  // beneath. The covered page drifts a little the same way and dims, and the top
  // page casts a soft shadow on it. Both sheets stay live DOM, and each carries
  // a copy of the header in its own colours, so the header travels with its page.
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
      },
      cleanup(){
        [top,under].forEach(el=>{el.style.removeProperty('transform');el.classList.remove('slide-top')});
        topHead.remove();underHead.remove();dim.remove();
        book.classList.remove('is-sliding');
      }};
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
    state.paint(0);
    animateSlide(state,1,SLIDE_MS,easeInOut,()=>endSlide(state,true));
  }
  // ---- The page curl --------------------------------------------------------
  //
  // A phone page turns the way paper does: a point near the bottom corner is
  // lifted and carried across, and the page rolls over a fold between the two.
  // The fold is a cylinder of radius R lying across the page, tilted slightly so
  // the corner leads; everything past its axis wraps round it and, beyond half a
  // turn, lies back over the page face down, showing the paper's back.
  //
  // Forward, the current page is the sheet and the next page is live beneath.
  // Back, the previous page is the sheet: it unrolls in from the left over the
  // live current page and lands flat, where the live page takes over. One
  // snapshot per turn, uploaded while idle by warm() (cacheImage below), so a
  // turn starts without waiting for pixels.
  //
  // The geometry runs on the GPU: a fixed mesh, and per frame only four numbers
  // (fold point, direction, radius), and the motion is fixed, so a frame costs
  // the same however the turn was started. foldPoint() is its JavaScript twin, used by
  // the tests; goneAt() finds how far the fold must travel for the page to have
  // left the screen entirely.
  const PI=Math.PI,CURL_MS=950,TILT=.18;
  let curlBroken=false,curlRenderer=null;
  const norm=(x,y)=>{const l=Math.hypot(x,y)||1;return {x:x/l,y:y/l}};
  // The fold for grab point C carried a distance D along -n (so C lands on
  // F = C - n·D): axis point P and radius R. R shrinks with D so a page at rest
  // is flat and the first lift is a tight curl, as paper's is.
  function foldFor(C,n,D,rMax){
    const R=Math.min(rMax,Math.max(0,D)/PI),dc=(Math.max(0,D)+PI*R)/2;
    return {R,P:{x:C.x-n.x*dc,y:C.y-n.y*dc},n};
  }
  function foldPoint(x,y,f){
    const d=(x-f.P.x)*f.n.x+(y-f.P.y)*f.n.y;
    if(d<=0||f.R<=0)return {x,y,z:0};
    const bx=x-f.n.x*d,by=y-f.n.y*d,th=d/f.R;
    if(th<PI)return {x:bx+f.n.x*f.R*Math.sin(th),y:by+f.n.y*f.R*Math.sin(th),z:f.R*(1-Math.cos(th))};
    return {x:bx-f.n.x*(d-PI*f.R),y:by-f.n.y*(d-PI*f.R),z:2*f.R};
  }
  // Where the fold's crest (the roll's leading edge) crosses the height of C.
  function crestOf(C,n,D,rMax){const f=foldFor(C,n,D,rMax);return C.x-((Math.max(0,D)+PI*f.R)/2)/n.x+f.R*n.x}
  function goneAt(C,n,rMax,h){
    // The axis crosses height y at x = C.x - dc/n.x - (y - C.y)·n.y/n.x; the page is
    // gone once that, plus the roll, is left of the screen over its full height
    // (with room for the tilt, which carries rolled points up or down the page).
    const lean=Math.abs(n.y/n.x),reach=Math.max(C.y,h-C.y)*lean+h*lean*.5;
    const dc=(C.x+reach+rMax*n.x+2)*n.x;
    return 2*dc-PI*rMax;
  }
  function createCurlRenderer(){
    const canvas=document.createElement('canvas');canvas.className='paper-mesh';
    const attributes={alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'high-performance'};
    const gl=canvas.getContext('webgl2',attributes)||canvas.getContext('webgl',attributes);
    if(!gl)throw new Error('WebGL unavailable');
    const aniso=gl.getExtension('EXT_texture_filter_anisotropic')||gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();curlBroken=true;curlRenderer=null;
      if(core.active?.curl){core.active.target=core.active.destination=core.active.from;finish(true)}
    });
    const precision='#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
    function program(vs,fs){
      const p=gl.createProgram();
      for(const [type,src] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,precision+fs]]){
        const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p,s);
      }
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
      return p;
    }
    // The sheet. Mirrors foldPoint(). Perspective is gentle (the roll is at most
    // 2R off the page), and the flat page sits at z = 0 exactly, so a page at
    // rest is drawn pixel for pixel where the live page is.
    const sheet=program(`
      attribute vec2 uv;
      uniform vec2 size; uniform vec2 axisPoint; uniform vec2 axisNormal; uniform float radius; uniform float persp;
      varying vec2 vUv; varying float vTheta;
      void main(){
        const float PI=3.14159265;
        vec2 p=uv*size; float d=dot(p-axisPoint,axisNormal);
        vec3 pos=vec3(p,0.0); float th=0.0;
        if(d>0.0&&radius>0.0){
          th=d/radius; vec2 b=p-axisNormal*d;
          if(th<PI) pos=vec3(b+axisNormal*(radius*sin(th)),radius*(1.0-cos(th)));
          else pos=vec3(b-axisNormal*(d-PI*radius),2.0*radius);
        }
        vUv=uv; vTheta=th;
        float depth=1.0-pos.z/persp;
        gl_Position=vec4((pos.x/size.x-0.5)*2.0,(0.5-pos.y/size.y)*2.0,-pos.z/persp*depth,depth);
      }`,`
      uniform sampler2D page; uniform vec3 paper;
      varying vec2 vUv; varying float vTheta;
      void main(){
        const float PI=3.14159265;
        vec4 c=texture2D(page,vec2(vUv.x,1.0-vUv.y));
        if(gl_FrontFacing){
          // The printed side darkens as it turns from the light, with a thin
          // bright line where it starts to bend.
          float turn=sin(min(vTheta,PI*0.5));
          float light=1.0-0.30*turn+0.06*smoothstep(0.0,0.35,vTheta)*(1.0-smoothstep(0.35,0.9,vTheta));
          gl_FragColor=vec4(c.rgb*light,1.0);
        }else{
          // The back: paper, with the print showing faintly through (mirrored,
          // as it would be); darker on the roll's underside, full on its top.
          vec3 back=mix(c.rgb,paper,0.9);
          float light=vTheta<PI?0.70+0.30*sin(vTheta-PI*0.5):0.97;
          gl_FragColor=vec4(back*light,1.0);
        }
      }`);
    // The shadow the roll throws on the page beneath, just past its crest.
    const shade=program(`
      attribute vec2 corner; void main(){gl_Position=vec4(corner,0.0,1.0);}`,`
      uniform vec2 size; uniform float scale; uniform vec2 axisPoint; uniform vec2 axisNormal; uniform float radius; uniform float strength;
      void main(){
        vec2 p=vec2(gl_FragCoord.x/scale,size.y-gl_FragCoord.y/scale);
        float e=dot(p-axisPoint,axisNormal)-radius;
        float a=strength*(1.0-smoothstep(0.0,56.0,e))*step(0.0,e);
        gl_FragColor=vec4(0.0,0.0,0.0,a);
      }`);
    const COLS=48,ROWS=96,uv=new Float32Array((COLS+1)*(ROWS+1)*2),index=new Uint16Array(COLS*ROWS*6);
    for(let r=0,k=0;r<=ROWS;r++)for(let c=0;c<=COLS;c++){uv[k++]=c/COLS;uv[k++]=r/ROWS}
    for(let r=0,k=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const a=r*(COLS+1)+c,b=a+COLS+1;index.set([a,b,a+1,a+1,b,b+1],k);k+=6}
    const uvBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);
    const indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,index,gl.STATIC_DRAW);
    const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const loc=(p,names)=>Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,n)]));
    const U=loc(sheet,['size','axisPoint','axisNormal','radius','persp','page','paper']);
    const S=loc(shade,['size','scale','axisPoint','axisNormal','radius','strength']);
    const uvLoc=gl.getAttribLocation(sheet,'uv'),cornerLoc=gl.getAttribLocation(shade,'corner');
    // Uploaded snapshots, newest last. The ones in the turn being drawn are
    // pinned and never evicted; the rest stay within a count and a byte budget.
    const textures=new Map();let pinned=new Set(),scale=1,textureBytes=0;
    function cacheImage(image){
      if(textures.has(image)){const t=textures.get(image);textures.delete(image);textures.set(image,t);return t}
      const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      // No mipmaps: the curled page is never drawn much smaller than it is (it
      // rolls, it does not recede), and skipping them halves the upload.
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(aniso)gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      textures.set(image,t);textureBytes+=image.width*image.height*4;
      // Three pages at device resolution and a set of 1x riffle pages fit well
      // inside 32 MB (a 390x844 phone page is 5.3 MB at 2x, 1.3 MB at 1x).
      while(textures.size>1&&(textures.size>9||textureBytes>32*1024*1024)){
        const [old,tex]=[...textures].find(([img])=>!pinned.has(img)&&img!==image)||[];
        if(!old)break;
        gl.deleteTexture(tex);textures.delete(old);textureBytes-=old.width*old.height*4;
      }
      return t;
    }
    return {
      canvas,cacheImage,
      // Size the canvas to the book and keep this turn's pages resident.
      begin(images,w,h){
        pinned=new Set(images);images.forEach(cacheImage);
        scale=Math.min(devicePixelRatio||1,2);
        const cw=Math.round(w*scale),ch=Math.round(h*scale);
        if(canvas.width!==cw)canvas.width=cw;if(canvas.height!==ch)canvas.height=ch;
        gl.viewport(0,0,cw,ch);
        gl.useProgram(sheet);gl.uniform2f(U.size,w,h);gl.uniform1f(U.persp,Math.max(2400,w*6));gl.uniform1i(U.page,0);
        gl.useProgram(shade);gl.uniform2f(S.size,w,h);gl.uniform1f(S.scale,scale);
      },
      end(){pinned=new Set()},
      // Draw a stack of sheets, bottom first: each one's shadow falls on what is
      // already drawn, then the sheet itself (depth-tested only against itself,
      // so its roll lies over its own face but never behind the sheet below).
      draw(stack){
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0);
        for(const s of stack){
          const f=s.fold,R=f.R;
          if(R>0){
            gl.useProgram(shade);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
            gl.uniform2f(S.axisPoint,f.P.x,f.P.y);gl.uniform2f(S.axisNormal,f.n.x,f.n.y);gl.uniform1f(S.radius,R);
            gl.uniform1f(S.strength,.24*Math.min(1,s.D/60));
            gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(cornerLoc);gl.vertexAttribPointer(cornerLoc,2,gl.FLOAT,false,0,0);
            gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disableVertexAttribArray(cornerLoc);
          }
          gl.clear(gl.DEPTH_BUFFER_BIT);
          gl.useProgram(sheet);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
          gl.bindTexture(gl.TEXTURE_2D,cacheImage(s.image));gl.uniform3fv(U.paper,s.paper);
          gl.uniform2f(U.axisPoint,f.P.x,f.P.y);gl.uniform2f(U.axisNormal,f.n.x,f.n.y);gl.uniform1f(U.radius,R);
          gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.enableVertexAttribArray(uvLoc);gl.vertexAttribPointer(uvLoc,2,gl.FLOAT,false,0,0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
          gl.drawElements(gl.TRIANGLES,index.length,gl.UNSIGNED_SHORT,0);
          gl.disableVertexAttribArray(uvLoc);
        }
      }
    };
  }
  function renderer(){return curlRenderer||(curlRenderer=createCurlRenderer())}
  function paperOf(el){
    const m=getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return m&&m.length>=3?m.slice(0,3).map(n=>Number(n)/255):[0.98,0.99,0.99];
  }
  // A turn: one sheet per page between here and the destination, so a jump of
  // several pages riffles through them. Going forward the sheets are this page
  // and the ones after it, each lifting in turn off the live destination; going
  // back they are the pages before it, arriving one on top of the other, the
  // destination last. This page (forward) and the destination (back) are drawn
  // from device-resolution snapshots — they are the ones seen at rest; the
  // pages in between are seen in passing and use 1x copies. opts.C / opts.n:
  // the lifted point and the fold's direction (the bottom corner leads).
  function beginCurl(target,opts={}){
    const from=core.current,forward=target>from;
    const w=book.clientWidth,h=book.clientHeight,rMax=Math.max(26,Math.min(60,w*.13));
    const C=opts.C||{x:w,y:h*.8},n=opts.n||norm(1,TILT),gone=goneAt(C,n,rMax,h);
    const indices=[];
    if(forward)for(let i=from;i<target;i++)indices.push(i);else for(let i=from-1;i>=target;i--)indices.push(i);
    const key=forward?from:target;
    // Stack, bottom first; `order` is when each one moves (0 = first).
    const sheets=indices.map((index,order)=>({index,order,D:forward?0:gone})).sort((a,b)=>b.index-a.index);
    const state={curl:true,from,target,destination:target,forward,w,h,C,n,rMax,gone,sheets,ready:false,
      fold(D){return foldFor(C,n,D,rMax)},
      draw(){
        // A sheet lying flat hides everything below it; a gone one shows nothing.
        let first=0;
        for(let i=sheets.length-1;i>=0;i--)if(sheets[i].D<=0){first=i;break}
        state.r.draw(sheets.slice(first).filter(s=>s.D<gone).map(s=>({image:s.image,paper:s.paper,D:s.D,fold:foldFor(C,n,s.D,rMax)})));
      }};
    // Going forward the destination is live beneath: show it now, under the
    // current page, so its first layout is done before the sheet lifts.
    const incoming=core.pages[target],outgoing=core.pages[from];
    if(forward){incoming.hidden=false;incoming.scrollTop=core.scrollPositions[target];incoming.style.zIndex='1';outgoing.style.zIndex='2'}
    incoming.inert=true;outgoing.inert=true;
    // A live Home is drawn with moving water, so its snapshot is taken afresh —
    // unless a finger on the menu or the guide has just taken it (holdHome).
    if(key===core.current&&core.ids[key]==='hero'&&!heldRecently())cache.delete(key);
    (async()=>{
      // The key page's pictures, and (forward) the destination's, decoded first:
      // the destination is uncovered live, and a picture decoding under the
      // turning sheet would hold up its frames.
      await Promise.all([preparePageImages(key),forward?preparePageImages(target):null]);
      if(core.active!==state)return;
      await Promise.all(sheets.map(async s=>{s.image=await texture(s.index,false,s.index!==key);s.paper=paperOf(core.pages[s.index])}));
      if(core.active!==state)return;
      const r=renderer();state.r=r;
      r.begin(sheets.map(s=>s.image),w,h);
      state.draw();
      // The overlay covers the book only (the room guide below it stays live).
      const overlay=document.createElement('div');overlay.className='paper-turn';
      overlay.inert=true;overlay.setAttribute('aria-hidden','true');
      const box=book.getBoundingClientRect();
      Object.assign(overlay.style,{top:box.top+'px',height:box.height+'px',bottom:'auto'});
      overlay.append(r.canvas);document.body.append(overlay);state.overlay=overlay;
      if(forward){outgoing.style.visibility='hidden';updateHeader(target);syncGuide(target)}
      book.classList.add('is-page-turning');
      state.ready=true;
      state.onReady?.();
    })().catch(error=>{
      if(core.active!==state)return;
      console.warn('Page curl unavailable; using the slide.',error);
      curlBroken=true;
      state.target=state.destination=state.from;finish(true);
      if(state.peek)peekSlide();else slideTo(target);
    });
    state.cleanup=()=>state.r?.end();
    return state;
  }
  // Moves the single sheet of a one-page turn (the first-visit dog-ear).
  function animateD(state,to,ms,ease,done){
    const s=state.sheets[0],from=s.D;let start;
    cancelAnimationFrame(core.raf);
    function step(ts){
      if(core.active!==state)return;
      if(start===undefined)start=ts;
      const k=ms>0?Math.min(1,(ts-start)/ms):1;
      s.D=from+(to-from)*ease(k);state.draw();
      if(k<1)core.raf=requestAnimationFrame(step);else done();
    }
    core.raf=requestAnimationFrame(step);
  }
  function endCurl(state,commit){
    if(core.active!==state)return;
    if(commit)book.dataset.lastTurn=JSON.stringify({mode:'curl',from:core.ids[state.from],to:core.ids[state.target],sheets:state.sheets.length});
    else state.target=state.destination=state.from;
    finish();
  }
  // A whole turn. One page: 950 ms. A jump: each sheet takes 760 ms and the
  // next starts 230 ms after the one before, so the pages fan through.
  const RIFFLE_MS=760,RIFFLE_GAP=230;
  function curlTo(target){
    const state=beginCurl(target);core.active=state;syncOcean();
    book.setAttribute('aria-busy','true');
    state.onReady=()=>{
      const count=state.sheets.length,dur=count===1?CURL_MS:RIFFLE_MS,total=dur+(count-1)*RIFFLE_GAP;
      let start;
      cancelAnimationFrame(core.raf);
      function step(ts){
        if(core.active!==state)return;
        if(start===undefined)start=ts;
        const t=ts-start;
        for(const s of state.sheets){
          const e=easeInOut(Math.max(0,Math.min(1,(t-s.order*RIFFLE_GAP)/dur)));
          s.D=state.forward?e*state.gone:(1-e)*state.gone;
        }
        state.draw();
        if(t<total)core.raf=requestAnimationFrame(step);else endCurl(state,true);
      }
      core.raf=requestAnimationFrame(step);
    };
  }

  // ---- Home's snapshot, taken at the touch ------------------------------------
  // A tap on the menu or the room guide turns the page a moment later. On Home
  // the page is drawn with moving water, so the touch itself stops the water and
  // takes the snapshot, and hands it to the GPU, while the finger is still down;
  // the turn then has nothing left to wait for. The water runs on again shortly
  // after the finger lifts if no turn started.
  let heldAt=-1e9,releaseTimer=0;
  function holdHome(on){
    if(on){
      if(!narrow()||core.active||detailOpen()||curlBroken||reduced.matches||core.ids[core.current]!=='hero')return;
      clearTimeout(releaseTimer);
      if(core.holdingHome&&performance.now()-heldAt<1000)return;
      core.holdingHome=true;heldAt=performance.now();syncOcean();cache.delete(core.current);
      texture(core.current).then(cacheImage).catch(()=>{});
    }else if(core.holdingHome){
      clearTimeout(releaseTimer);
      releaseTimer=setTimeout(()=>{if(core.holdingHome){core.holdingHome=false;syncOcean()}},400);
    }
  }
  const heldRecently=()=>core.holdingHome&&performance.now()-heldAt<1500;
  const TAPS='.room-menu a, .room-step';
  document.addEventListener('touchstart',e=>{if(e.target.closest?.(TAPS))holdHome(true)},{passive:true});
  document.addEventListener('touchend',e=>{if(e.target.closest?.(TAPS))holdHome(false)},{passive:true});
  document.addEventListener('touchcancel',()=>holdHome(false),{passive:true});

  // ---- Rooms: names and numbers ----------------------------------------------
  // The pages are numbered as their own headings number them (Work is 01,
  // Method 02 ...); Home is the entrance, 00.
  const roomName=i=>{const a=document.querySelector('#nav-links a[href="#'+core.ids[i]+'"], #nav-brand[href="#'+core.ids[i]+'"]');return (a&&a.textContent.trim())||core.ids[i]||''};
  const roomNumber=i=>String(i).padStart(2,'0');
  const chevron=d=>'<svg class="room-chevron" viewBox="0 0 8 16" aria-hidden="true"><path d="'+d+'"/></svg>';

  // ---- The menu: three lines at the top left ---------------------------------
  // On a phone the menu row is folded away behind a button, and opens as a
  // directory of rooms over the top of the page. It sits over the page rather
  // than pushing it down, so opening it moves nothing. Choosing a room closes
  // it and turns the page; so does a tap anywhere else, or Escape.
  const nav=header.querySelector('.nav');
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='menu-toggle';
  toggle.setAttribute('aria-label','Menu');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','room-menu');
  toggle.innerHTML='<svg viewBox="0 0 20 14" aria-hidden="true"><path class="menu-line menu-line--1" d="M1 1h18"/><path class="menu-line menu-line--2" d="M1 7h18"/><path class="menu-line menu-line--3" d="M1 13h18"/></svg>';
  const menu=document.createElement('div');
  menu.className='room-menu';menu.id='room-menu';menu.hidden=true;
  nav.prepend(toggle);header.append(menu);
  function setMenu(open){
    if(open&&!narrow())return;
    header.classList.toggle('menu-open',open);menu.hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close menu':'Menu');
    if(open){menu.querySelector('[aria-current]')?.focus({preventScroll:true});warmLow()}
  }
  function buildMenu(){
    menu.replaceChildren(...core.ids.map((id,i)=>{
      const a=document.createElement('a');a.href='#'+id;
      a.innerHTML='<span class="room-menu-no"></span><span class="room-menu-name"></span>';
      a.firstChild.textContent=roomNumber(i);a.lastChild.textContent=roomName(i);
      if(i===core.current)a.setAttribute('aria-current','page');
      return a;
    }));
  }
  toggle.addEventListener('click',()=>setMenu(menu.hidden));
  menu.addEventListener('click',e=>{if(e.target.closest('a'))setMenu(false)},true);
  document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!header.contains(e.target))setMenu(false)},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){setMenu(false);toggle.focus()}});
  narrowMqListen(()=>{if(!narrow())setMenu(false)});

  // ---- The room guide: a line at the foot of the page ------------------------
  //   ‹ Work            02 / 05            About ›
  // The neighbouring rooms by name, and where you are. A tap turns the page with
  // the curl above. Hidden in a case study, whose only exit is "All work".
  const guide=document.createElement('nav');
  guide.className='room-guide';guide.setAttribute('aria-label','Rooms');
  guide.innerHTML='<button type="button" class="room-step room-step--prev"><span class="room-step-light" aria-hidden="true"></span>'+chevron('M6 2 2 8l4 6')+'<span class="room-step-name"></span></button>'
    +'<span class="room-count"></span>'
    +'<button type="button" class="room-step room-step--next"><span class="room-step-light" aria-hidden="true"></span><span class="room-step-name"></span>'+chevron('M2 2l4 6-4 6')+'</button>';
  document.body.append(guide);
  const [prev,next]=guide.querySelectorAll('.room-step'),count=guide.querySelector('.room-count');
  function press(b){b.classList.remove('is-pressed');void b.offsetWidth;b.classList.add('is-pressed');setTimeout(()=>b.classList.remove('is-pressed'),420)}
  prev.addEventListener('click',()=>{press(prev);navigate(core.current-1)});
  next.addEventListener('click',()=>{press(next);navigate(core.current+1)});
  // i: the page the guide should describe — the current one, or the one a
  // forward turn is uncovering (it is live beneath the sheet from the start).
  function syncGuide(i=core.current){
    const last=core.ids.length-1;
    guide.dataset.page=core.ids[i]||'';
    prev.hidden=i<=0;next.hidden=i>=last;
    if(!prev.hidden){const n=roomName(i-1);prev.querySelector('.room-step-name').textContent=n;prev.setAttribute('aria-label','Previous room: '+n)}
    if(!next.hidden){const n=roomName(i+1);next.querySelector('.room-step-name').textContent=n;next.setAttribute('aria-label','Next room: '+n)}
    count.textContent=roomNumber(i)+' / '+roomNumber(last);
    count.setAttribute('aria-label','Room '+i+' of '+last);
  }

  // ---- First visit: a dog-ear on Home ----------------------------------------
  // Once per device, 1.5 s after Home appears, Home's bottom corner lifts and
  // settles back while the guide's next room lights up — the page turns, and
  // this is where to tap.
  const KEY='jm.swipeHint.seen';
  let peeked=false,peekTimer=0;
  const seen=()=>{if(peeked)return true;try{return localStorage.getItem(KEY)==='1'}catch{return false}};
  function peekCurl(){
    if(core.active||document.hidden||reduced.matches||!narrow()||core.ids[core.current]!=='hero'||detailOpen())return;
    peeked=true;try{localStorage.setItem(KEY,'1')}catch{}
    next.classList.add('is-lit');setTimeout(()=>next.classList.remove('is-lit'),2200);
    if(curlBroken){peekSlide();return}
    const w=book.clientWidth,h=book.clientHeight;
    const s=beginCurl(core.current+1,{C:{x:w,y:h*.92},n:norm(1,.6)});s.peek=true;core.active=s;syncOcean();
    s.onReady=()=>animateD(s,Math.min(64,w*.16),560,easeOut,()=>setTimeout(()=>{
      if(core.active===s)animateD(s,0,620,easeInOut,()=>endCurl(s,false));
    },380));
  }
  function peekSlide(){
    if(core.active)return;
    const s=beginSlide(core.current+1);s.peek=true;core.active=s;syncOcean();
    s.paint(0);
    animateSlide(s,.08,460,easeOut,()=>setTimeout(()=>{
      if(core.active===s)animateSlide(s,0,560,easeInOut,()=>endSlide(s,false));
    },420));
  }

  function turn(target){setMenu(false);if(curlBroken)slideTo(target);else curlTo(target)}
  // warm() hands idle snapshots here so the GPU already has them at a turn.
  function cacheImage(image){
    if(curlBroken)return;
    try{renderer().cacheImage(image)}catch(error){curlBroken=true;console.warn('Page curl unavailable; using the slide.',error)}
  }
  function sync(){
    buildMenu();syncGuide();setMenu(false);
    clearTimeout(peekTimer);
    if(narrow()&&core.ids[core.current]==='hero'&&core.ids.length>1&&!detailOpen()&&!seen()&&!reduced.matches)peekTimer=setTimeout(peekCurl,1500);
  }
  return {turn,cacheImage,sync,
    // For tests: the fold geometry, shared with the vertex shader.
    geometry:{foldFor,foldPoint,crestOf,goneAt}};
};
