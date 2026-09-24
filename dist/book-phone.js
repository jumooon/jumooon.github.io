/* Phones (≤760px): the book one page at a time.

   The desktop shows the book as a two-page spread and turns its right half over
   the spine in the middle (book.js). A phone is one page, so it turns the way a
   single sheet of paper does: the part under the finger is lifted and carried
   with it, and the page rolls over a fold between the two. The page is held by
   the finger rather than played as a set animation. What lives in this file:

     beginCurl / foldFor / curlTo       the page curl (its own WebGL renderer)
     beginSlide / slideTo               the live slide, if the curl is unavailable
     hint                               Home's swipe hint and first-visit dog-ear
     touch handlers, holdHome           gestures below 760px

   book.js hands in `core`: its snapshot, settle/finish and history functions,
   and accessors for the values it reassigns (pages, ids, current, active, raf).
   book.js calls turn() for a menu tap / Back on a phone, sync() after every
   settle, and cacheImage() with idle snapshots. Load this file before book.js. */
window.createBookPhone = function(core) {
  'use strict';
  const {book,header,cache,reduced,narrow,detailOpen,finish,syncOcean,updateHeader,texture,preparePageImages,navigate,pushPage}=core;
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
      update(x,y,dx){state.paint(Math.max(0,Math.min(1,(forward?-dx:dx)/w)))},
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

  // ---- The page curl --------------------------------------------------------
  //
  // A phone page turns the way paper does: the part under the finger is lifted
  // and carried to the finger, and the page rolls over a fold between the two.
  // The fold is a cylinder of radius R lying across the page, perpendicular to
  // the drag; everything past its axis wraps round it and, beyond half a turn,
  // lies back over the page face down, showing the paper's back. Drag straight
  // left and the fold runs straight down the page; start low (or high) and the
  // bottom (or top) corner leads, so the fold runs slightly on the diagonal.
  //
  // Forward, the current page is the sheet and the next page is live beneath.
  // Back, the previous page is the sheet: it unrolls in from the left over the
  // live current page, the roll staying under the finger, and lands flat where
  // the live page takes over. One snapshot per turn, uploaded while idle by
  // warm() (cacheImage below), so a swipe starts without waiting for pixels.
  //
  // The geometry runs on the GPU: a fixed mesh, and per frame only four numbers
  // (fold point, direction, radius). foldPoint() is its JavaScript twin, used by
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
    // Uploaded snapshots, newest last. The one in use is never evicted.
    const textures=new Map();let bound=null,scale=1,W=0,H=0;
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
      textures.set(image,t);
      while(textures.size>4){const [old,tex]=[...textures].find(([img])=>img!==bound)||[];if(!old)break;gl.deleteTexture(tex);textures.delete(old)}
      return t;
    }
    return {
      canvas,cacheImage,
      // Bind a page, size the canvas to the book, and set the paper colour.
      prepare(image,w,h,paper){
        bound=image;W=w;H=h;scale=Math.min(devicePixelRatio||1,2);
        const cw=Math.round(w*scale),ch=Math.round(h*scale);
        if(canvas.width!==cw)canvas.width=cw;if(canvas.height!==ch)canvas.height=ch;
        gl.viewport(0,0,cw,ch);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,cacheImage(image));
        gl.useProgram(sheet);gl.uniform2f(U.size,w,h);gl.uniform1f(U.persp,Math.max(2400,w*6));gl.uniform1i(U.page,0);gl.uniform3fv(U.paper,paper);
        gl.useProgram(shade);gl.uniform2f(S.size,w,h);gl.uniform1f(S.scale,scale);
      },
      draw(f,D){
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const R=f.R;
        if(R>0){
          gl.useProgram(shade);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform2f(S.axisPoint,f.P.x,f.P.y);gl.uniform2f(S.axisNormal,f.n.x,f.n.y);gl.uniform1f(S.radius,R);
          gl.uniform1f(S.strength,.24*Math.min(1,D/60));
          gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(cornerLoc);gl.vertexAttribPointer(cornerLoc,2,gl.FLOAT,false,0,0);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disableVertexAttribArray(cornerLoc);
        }
        gl.useProgram(sheet);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
        gl.uniform2f(U.axisPoint,f.P.x,f.P.y);gl.uniform2f(U.axisNormal,f.n.x,f.n.y);gl.uniform1f(U.radius,R);
        gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.enableVertexAttribArray(uvLoc);gl.vertexAttribPointer(uvLoc,2,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
        gl.drawElements(gl.TRIANGLES,index.length,gl.UNSIGNED_SHORT,0);
        gl.disableVertexAttribArray(uvLoc);
      }
    };
  }
  function renderer(){return curlRenderer||(curlRenderer=createCurlRenderer())}
  function paperOf(el){
    const m=getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return m&&m.length>=3?m.slice(0,3).map(n=>Number(n)/255):[0.98,0.99,0.99];
  }
  // opts: {x, y} where the finger went down (a drag), or {C, n} for a set turn.
  function beginCurl(target,opts={}){
    const from=core.current,forward=target>from,sheetIndex=forward?from:target;
    const w=book.clientWidth,h=book.clientHeight,rMax=Math.max(26,Math.min(60,w*.13));
    const y0=opts.y??h*.78,lean=y0>h/2?1:-1;
    const C=opts.C||{x:w,y:Math.max(0,Math.min(h,y0))};
    const state={curl:true,from,target,destination:target,forward,w,h,C,rMax,ready:false,
      n:opts.n||norm(1,lean*TILT),D:0,
      fold(){return foldFor(C,state.n,state.D,rMax)},
      gone(){return goneAt(C,state.n,rMax,h)},
      progress(){const c=crestOf(C,state.n,state.D,rMax)/w;return Math.max(0,Math.min(1,forward?1-c:c))},
      update(x,y,dx,dy){
        if(forward){
          // The grabbed point follows the finger; the corner on the finger's side leads.
          const vx=Math.max(0,-dx),vy=Math.max(-.6*vx,Math.min(.6*vx,-dy+lean*Math.min(vx,w)*TILT));
          if(vx>0.5)state.n=norm(vx,vy);
          state.D=Math.hypot(vx,vy);
        }else{
          // The roll stays under the finger: it enters at the left edge and the
          // page lies flat as the finger reaches the right side.
          const gain=Math.min(2.5,w/Math.max(1,w-opts.x));
          const crest=Math.max(0,Math.min(w,(x-opts.x)*gain)),n=state.n;
          let D=2*((C.x+rMax*n.x-crest)*n.x)-PI*rMax;
          if(D<PI*rMax)D=Math.max(0,(C.x-crest)/(1/n.x-n.x/PI));
          state.D=Math.min(state.gone(),D);
        }
        requestPaint(state);
      },
      release(commit){
        if(!state.ready){state.pendingRelease=commit;return}
        const to=forward===commit?state.gone():0;
        animateD(state,to,Math.max(200,Math.min(650,Math.abs(to-state.D)/state.gone()*900)),easeOut,()=>endCurl(state,commit));
      }};
    state.D=forward?0:state.gone();
    // Going forward the next page is live beneath: show it now, under the
    // current page, so its first layout is done before the sheet lifts.
    const incoming=core.pages[target],outgoing=core.pages[from];
    if(forward){incoming.hidden=false;incoming.scrollTop=core.scrollPositions[target];incoming.style.zIndex='1';outgoing.style.zIndex='2'}
    incoming.inert=true;outgoing.inert=true;
    // A live Home is drawn with moving water, so its snapshot is taken afresh, as
    // on the desktop — for a finger, already at touchstart (see holdHome).
    if(!opts.touch&&sheetIndex===core.current&&core.ids[sheetIndex]==='hero'&&!heldRecently())cache.delete(sheetIndex);
    (async()=>{
      await preparePageImages(sheetIndex);
      if(core.active!==state)return;
      const image=await texture(sheetIndex);
      if(core.active!==state)return;
      const r=renderer();
      r.prepare(image,w,h,paperOf(core.pages[sheetIndex]));
      r.draw(state.fold(),state.D);
      const overlay=document.createElement('div');overlay.className='paper-turn';
      overlay.inert=true;overlay.setAttribute('aria-hidden','true');
      overlay.append(r.canvas);document.body.append(overlay);state.overlay=overlay;state.r=r;
      if(forward){outgoing.style.visibility='hidden';updateHeader(target)}
      book.classList.add('is-page-turning');
      state.ready=true;
      if(state.onReady)state.onReady();
      else if(state.pendingRelease!==undefined)state.release(state.pendingRelease);
    })().catch(error=>{
      if(core.active!==state)return;
      console.warn('Page curl unavailable; using the slide.',error);
      curlBroken=true;
      const pending=state.pendingRelease,touchRef=opts.touch;
      state.target=state.destination=state.from;finish(true);
      if(state.peek){hint.peekSlide();return}
      if(state.onReady)slideTo(target);                         // a set turn
      else if(touchRef&&!touchRef.ended){                       // the finger is still down
        const s=beginSlide(target);core.active=s;touchRef.state=s;s.update(touchRef.lastX,touchRef.lastY,touchRef.lastDx||0,0);
      }else if(pending)slideTo(target);
    });
    return state;
  }
  function requestPaint(state){
    if(!state.ready||state.painting)return;
    state.painting=true;
    core.raf=requestAnimationFrame(()=>{state.painting=false;if(core.active===state)state.r.draw(state.fold(),state.D)});
  }
  function animateD(state,to,ms,ease,done){
    const from=state.D;let start;
    cancelAnimationFrame(core.raf);state.painting=false;
    function step(ts){
      if(core.active!==state)return;
      if(start===undefined)start=ts;
      const k=ms>0?Math.min(1,(ts-start)/ms):1;
      state.D=from+(to-from)*ease(k);
      state.r.draw(state.fold(),state.D);
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
  // A whole turn from the menu, Back/Forward or the hint's tap: the bottom
  // corner leads, as a right hand turning a page would.
  function curlTo(target){
    const h=book.clientHeight,w=book.clientWidth;
    const state=beginCurl(target,{C:{x:w,y:h*.8},n:norm(1,TILT)});core.active=state;syncOcean();
    book.setAttribute('aria-busy','true');
    hint?.away();
    state.onReady=()=>animateD(state,state.forward?state.gone():0,CURL_MS,easeInOut,()=>endCurl(state,true));
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
      // Home's bottom corner lifts like a dog-ear and settles back.
      const w=book.clientWidth,h=book.clientHeight;
      const s=beginCurl(core.current+1,{C:{x:w,y:h*.92},n:norm(1,.6)});s.peek=true;core.active=s;syncOcean();
      s.onReady=()=>animateD(s,Math.min(64,w*.16),560,easeOut,()=>setTimeout(()=>{
        if(core.active===s)animateD(s,0,620,easeInOut,()=>endCurl(s,false));
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
  // The same for a finger on the menu or the hint: the tap turns the page
  // a moment later, and the snapshot is ready by then. The water waits a
  // little after the finger lifts, so the tap's turn starts on this very frame.
  let heldAt=-1e9,releaseTimer=0;
  function holdHome(on){
    if(on){
      if(!narrow()||core.active||detailOpen()||curlBroken||reduced.matches||core.ids[core.current]!=='hero')return;
      clearTimeout(releaseTimer);
      if(core.holdingHome&&performance.now()-heldAt<1000)return;
      // The snapshot goes to the GPU straight away, while the finger is still
      // deciding, so the curl has nothing left to wait for.
      core.holdingHome=true;heldAt=performance.now();syncOcean();cache.delete(core.current);
      texture(core.current).then(cacheImage).catch(()=>{});
    }else if(core.holdingHome){
      clearTimeout(releaseTimer);
      releaseTimer=setTimeout(()=>{if(core.holdingHome&&!touch){core.holdingHome=false;syncOcean()}},400);
    }
  }
  const heldRecently=()=>core.holdingHome&&performance.now()-heldAt<1500;
  document.addEventListener('touchstart',e=>{if(e.target.closest?.('.site-header a, .swipe-hint'))holdHome(true)},{passive:true});
  document.addEventListener('touchend',e=>{if(e.target.closest?.('.site-header a, .swipe-hint'))holdHome(false)},{passive:true});
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
      else{touch.state=curlBroken||reduced.matches?beginSlide(target):beginCurl(target,{x:touch.x,y:touch.y,touch});core.active=touch.state;syncOcean();hint?.away()}
    }
    if(e.cancelable)e.preventDefault();
    const now=performance.now();
    touch.trail.push({x:t.clientX,at:now});
    while(touch.trail.length>2&&now-touch.trail[0].at>100)touch.trail.shift();
    touch.lastX=t.clientX;touch.lastY=t.clientY;touch.lastDx=dx;
    if(touch.edge){stretch(dx);return}
    const s=touch.state;if(core.active!==s){touch=null;return}
    s.update(t.clientX,t.clientY,dx,dy);
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
  // warm() hands idle snapshots here so the GPU already has them at a swipe.
  function cacheImage(image){
    if(curlBroken)return;
    try{renderer().cacheImage(image)}catch(error){curlBroken=true;console.warn('Page curl unavailable; using the slide.',error)}
  }
  return {turn,cacheImage,sync(){if(hint)hint.sync()},
    // For tests: the fold geometry, shared with the vertex shader.
    geometry:{foldFor,foldPoint,crestOf,goneAt}};
};
