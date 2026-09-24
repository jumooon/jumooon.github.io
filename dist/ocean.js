/* Hero sky and water. One bounded WebGL surface displaces the horizon photo and
   grades it into the real sky of the chosen city at the real time: the Sun's
   position drives the golden light and its glitter path, the side of the sky
   opposite the Sun carries Earth's shadow and the pink belt at dusk, and at
   night 2,061 Hipparcos stars (to magnitude 5.2), the Moon (phase, limb) and
   five planets are drawn where they actually are. Requires astronomy.browser.min.js
   (window.Astronomy) and stars.js (window.STARS) loaded first.
   Integrated with the book's freeze/capture lifecycle (setRunning / snapshot). */
window.createOcean = function(scene) {
  const inert = {setCity(){},setRunning(){},snapshot(){return null},describe(){return null},describeCity(){return null},get city(){return 'sandiego'},get skyKey(){return 'none'}};
  if(!scene||!window.Astronomy||!window.STARS)return inert;
  const A=window.Astronomy, STARS=window.STARS;
  const canvas=document.createElement('canvas');canvas.className='ocean-art ocean-surface';canvas.setAttribute('aria-hidden','true');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
  if(!gl)return inert;

  // Each city looks out over its own sea: San Diego west (toward Busan across
  // the Pacific), Busan south-east. The view spans 110 degrees of azimuth and
  // 42 degrees of altitude.
  const CITIES={
    busan:{name:'Busan',lat:35.18,lon:129.08,tz:'Asia/Seoul',viewAz:135},
    sandiego:{name:'San Diego',lat:32.72,lon:-117.16,tz:'America/Los_Angeles',viewAz:270}
  };
  const FOV_AZ=110,ALT_MAX=42,TRANSITION=2200,RECOMPUTE_MS=30000;
  const AMBER={stars:0,sky:[[231,197,151],[207,145,94]],glow:[252,204,129],glowWeight:.38,reflect:[255,191,87],seaTint:[1.05,.98,.85],haze:0,skyReflect:0,header:[[239,224,198],[231,197,151]],ink:[23,51,68],muted:[83,107,121],faint:[140,125,105],exposure:1};
  const ROSE={stars:0,sky:[[224,188,185],[232,178,179]],glow:[249,205,181],glowWeight:.58,reflect:[244,188,170],seaTint:[1.03,.96,.99],haze:.45,skyReflect:.4,header:[[233,207,204],[224,188,185]],ink:[23,51,68],muted:[96,98,112],faint:[150,130,134],exposure:1};
  const NIGHT={stars:1,sky:[[12,22,38],[34,48,66]],glow:[70,84,104],glowWeight:.30,reflect:[168,190,214],seaTint:[.82,.9,1.0],haze:.10,skyReflect:.22,header:[[24,36,52],[22,34,50]],ink:[233,238,241],muted:[160,178,194],faint:[104,124,144],exposure:.5};
  const DAYHDR=[251,253,253],DAYINK=[23,51,68],DAYMUTED=[83,107,121],DAYFAINT=[159,176,184];
  const lerp=(a,b,t)=>a+(b-a)*t, smooth=t=>t*t*(3-2*t);
  const lerpArr=(a,b,t)=>a.map((v,i)=>Array.isArray(v)?lerpArr(v,b[i],t):lerp(v,b[i],t));
  const lerpPal=(P,Q,t)=>{const o={};for(const k in P)o[k]=Array.isArray(P[k])?lerpArr(P[k],Q[k],t):lerp(P[k],Q[k],t);return o};
  // The Sun's side of the sky follows AMBER, the opposite side ROSE; both sink into NIGHT.
  function skyFor(elev){
    const dusk=elev>=-3?0:elev>=-9?smooth((-3-elev)/6):1;
    const sunset=elev>=10?0:elev>=2?smooth((10-elev)/8):1;
    const label=elev>=10?'day':elev>=2?'golden hour':elev>=-3?'sunset':elev>=-9?'dusk':'night';
    // Three coarse tones the music follows: the warm hours collapse into one.
    const tone=elev>=10?'day':elev>=-3?'sunset':'night';
    return {sunset,pal:lerpPal(AMBER,NIGHT,dusk),anti:lerpPal(ROSE,NIGHT,dusk),label,tone};
  }
  const fmt=(date,tz)=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz}).format(date);
  const DIRS=['N','NE','E','SE','S','SW','W','NW'];
  const dir=a=>DIRS[Math.round(a/45)%8];
  function skyState(city,date){
    const obs=new A.Observer(city.lat,city.lon,10);
    const body=name=>{const eq=A.Equator(name,date,obs,true,true);const hz=A.Horizon(date,obs,eq.ra,eq.dec,'normal');return {ra:eq.ra*15,dec:eq.dec,alt:hz.altitude,az:hz.azimuth}};
    const sun=body('Sun'),moon=body('Moon');
    const planets=['Venus','Jupiter','Mars','Saturn','Mercury'].map(n=>Object.assign(body(n),{mag:A.Illumination(n,date).mag}));
    const lst=((A.SiderealTime(date)*15+city.lon)%360+360)%360;
    return {sun,moon,moonFrac:A.Illumination('Moon',date).phase_fraction,planets,lst};
  }

  let loaded=false,running=false,raf=0,last=null,clock=0,lost=false,timer=0;
  let cityId='sandiego',cur={sunset:0,pal:AMBER,anti:ROSE},from=null,target=null,t0=0,swapT0=-1e9;
  let astro=null,moonlight=0,limbAngle=0,skyKey='sandiego@0',lastDescribe=null;

  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
  function link(vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
  try {
    const water=link('attribute vec2 point;varying vec2 uv;void main(){uv=point*.5+.5;gl_Position=vec4(point,0.,1.);}',`
      precision highp float;varying vec2 uv;uniform sampler2D photo;uniform vec2 view;uniform float time;uniform float sunset;
      uniform vec3 skyA;uniform vec3 skyB;uniform vec3 antiA;uniform vec3 antiB;uniform vec3 glowColor;uniform vec3 reflectColor;uniform vec3 seaTint;
      uniform float glowWeight;uniform float haze;uniform float skyReflect;uniform float exposure;uniform float moonlight;
      uniform vec2 sunUv;uniform float sunAlt;uniform float sunAzRel;uniform float fovAz;uniform float altMax;uniform vec2 moonUv;uniform float horizonUv;uniform float band;
      void main(){
        float aspect=view.x/view.y;
        // The water keeps the height it had as a strip under the intro (see
        // geometry()); everything above the horizon is sky. q maps the screen
        // onto the 3:1 source: the sky band onto its upper half, the water band
        // onto its lower half, so the horizon lands at 1-horizonUv from the top.
        float t=1.-uv.y,hz=1.-horizonUv,spanX=min(1.,aspect/3.);
        float qy=t<hz?t/hz*.505:.505+(t-hz)/(1.-hz)*.495;
        vec2 q=vec2((1.-spanX)*.5+uv.x*spanX,qy);
        float depth=smoothstep(.505,.99,q.y);
        float phase=pow(max(0.,(q.y-.505)/.495),.72)*34.-time*.72;
        float a=sin(phase+sin(q.x*8.+time*.08)*.36);
        float b=sin(phase*1.61-q.x*5.-time*.19);
        vec2 delta=vec2((a*.65+b*.35)*.00042,(a+b*.24)*.00105)*depth*.8;
        vec3 color=texture2D(photo,clamp(q+delta,vec2(.001),vec2(.999))).rgb;
        float luminance=dot(color,vec3(.2126,.7152,.0722));
        vec3 daylight=clamp(mix(vec3(luminance),color,1.15)*1.05,0.,1.);
        daylight=mix(vec3(251.,253.,253.)/255.,daylight,.8);
        float sky=1.-smoothstep(.498,.51,q.y);
        float pixAlt=(uv.y-horizonUv)/band*altMax;
        vec2 ac=vec2(uv.x*aspect,uv.y),sunAc=vec2(sunUv.x*aspect,sunUv.y);
        // The real Sun: a soft disc once it is low enough to look at, glare around it.
        float sunNear=smoothstep(12.,3.,sunAlt)*smoothstep(-3.,-.6,sunAlt);
        float dSun=length(ac-sunAc);
        float disc=exp(-dSun*dSun/(2.*.011*.011))*sunNear;
        float glare=exp(-dSun/.11)*sunNear*.45;
        float bright=smoothstep(.28,.74,luminance);
        if(sunset<=0.){
          vec3 day=daylight+vec3(1.,.93,.8)*(disc*.9+glare*.25)*sky;
          float path=exp(-pow((uv.x-sunUv.x)*aspect/(.05+.12*depth),2.))*bright;
          day+=vec3(1.,.95,.85)*path*sunNear*.35*(1.-sky);
          gl_FragColor=vec4(day,1.);return;}
        float atmosphere=smoothstep(0.,.505,q.y);
        // The Sun's side of the sky versus the side opposite it.
        float pixAz=(uv.x-.5)*fovAz;
        float dAz=abs(mod(pixAz-sunAzRel+540.,360.)-180.);
        float sunSide=.5+.5*cos(radians(dAz));
        vec3 A=mix(antiA,skyA,sunSide),B=mix(antiB,skyB,sunSide);
        float softLight=exp(-dSun*dSun/(2.*.19*.19))*(.35+.65*sunSide);
        vec3 skyColor=mix(A,B,atmosphere);
        skyColor=mix(skyColor,glowColor,softLight*atmosphere*glowWeight);
        // Opposite the Sun at dusk: Earth's shadow rises from the waterline, the pink belt above it.
        float twilight=smoothstep(2.,-1.,sunAlt)*smoothstep(-9.,-4.,sunAlt);
        float shadowTop=clamp(-sunAlt*1.1,0.,12.);
        float shadow=(1.-sunSide)*twilight*smoothstep(shadowTop+3.5,shadowTop-2.5,pixAlt);
        float belt=(1.-sunSide)*twilight*exp(-pow((pixAlt-(shadowTop+3.2))/3.,2.));
        skyColor=mix(skyColor,vec3(96.,110.,136.)/255.,shadow*.65);
        skyColor=mix(skyColor,vec3(236.,176.,176.)/255.,belt*.55);
        vec3 duskSky=skyColor+((color-vec3(luminance))*.04+vec3((luminance-.95)*.018))*atmosphere*exposure;
        duskSky+=vec3(.07,.09,.13)*moonlight;
        duskSky+=vec3(1.,.9,.72)*(disc*.9+glare*.4);
        float seaLuminance=dot(daylight,vec3(.2126,.7152,.0722));
        vec3 duskSea=mix(daylight,vec3(seaLuminance)*seaTint,.25)*.88;
        // Glitter paths under the real Sun and the real Moon.
        float sunPath=exp(-pow((uv.x-sunUv.x)*aspect/(.05+.12*depth),2.))*bright*smoothstep(-6.,0.,sunAlt)*step(0.,sunUv.x)*step(sunUv.x,1.);
        float moonPath=exp(-pow((uv.x-moonUv.x)*aspect/(.035+.09*depth),2.))*bright*moonlight*step(0.,moonUv.x)*step(moonUv.x,1.);
        duskSea=mix(duskSea,reflectColor*(.55+.45*seaLuminance),sunPath*.68*(1.-depth*.18));
        duskSea=mix(duskSea,vec3(.85,.9,1.)*(.6+.4*seaLuminance),moonPath*.55*(1.-depth*.2));
        duskSea*=exposure*(1.+.35*moonlight);
        vec3 dusk=mix(duskSea,duskSky,sky);
        vec3 sheen=mix(B,glowColor,.35*sunSide);
        float nearHorizon=1.-smoothstep(.505,.78,q.y);
        dusk=mix(dusk,sheen*(.72+.28*seaLuminance),(1.-sky)*nearHorizon*skyReflect);
        dusk=mix(dusk,sheen,exp(-pow((q.y-.505)/.038,2.))*haze);
        float grain=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
        gl_FragColor=vec4(mix(daylight,dusk,sunset)+grain*sunset*sky,1.);
      }`);
    // Points: attribute star = (RA deg, Dec deg, magnitude, B-V). kind 0 star, 1 planet, 2 Moon.
    const points=link(`
      attribute vec4 star;attribute float kind;
      uniform float lst;uniform float lat;uniform float viewAz;uniform float fovAz;uniform float altMax;
      uniform vec2 view;uniform float horizonUv;uniform float band;uniform float dpr;uniform float night;uniform float time;uniform float moonlight;uniform float limitMag;uniform float dayMoon;uniform float swap;
      varying vec3 vColor;varying float vAlpha;varying float vKind;
      const float PI=3.141592653589793;
      void main(){
        float ha=radians(lst-star.x),dec=radians(star.y);
        float sinAlt=sin(dec)*sin(lat)+cos(dec)*cos(lat)*cos(ha);
        float alt=asin(clamp(sinAlt,-1.,1.));
        float cosAz=(sin(dec)-sinAlt*sin(lat))/max(1e-4,cos(alt)*cos(lat));
        float az=acos(clamp(cosAz,-1.,1.));if(sin(ha)>0.)az=2.*PI-az;
        float daz=mod(degrees(az)-viewAz+540.,360.)-180.;
        float altDeg=degrees(alt);vKind=kind;
        if(altDeg<-.5||abs(daz)>fovAz*.5+2.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vAlpha=0.;return;}
        vec2 uv=vec2(.5+daz/fovAz,horizonUv+(altDeg/altMax)*band);
        gl_Position=vec4(uv*2.-1.,0.,1.);
        float b=pow(10.,-.4*(star.z-2.6));
        float airmass=1./max(.06,sin(radians(max(.5,altDeg))));
        float ext=exp(-.21*(airmass-1.));
        float sc=kind==0.?1.-.10*min(airmass,6.)*(.5+.5*sin(time*(1.2+fract(star.x*.37)*2.)+star.x*3.+star.y*7.)):1.;
        float wash=1.-moonlight*.5*smoothstep(2.2,5.,star.z);
        float bright=min(b,3.5);
        // Twilight: the sky's limiting magnitude decides which stars show yet (Venus first).
        float visibleYet=smoothstep(limitMag+.6,limitMag-.6,star.z);
        vAlpha=(kind==2.?(.55+.45*ext)*max(night,.28*dayMoon+.5*(1.-dayMoon)):bright*sc*wash*ext*max(night,.001)*visibleYet)*swap;
        float bv=clamp(star.w,-.3,1.8);
        vColor=bv<.3?mix(vec3(.72,.82,1.),vec3(.93,.96,1.),(bv+.3)/.6):bv<.9?mix(vec3(.93,.96,1.),vec3(1.,.92,.78),(bv-.3)/.6):mix(vec3(1.,.92,.78),vec3(1.,.72,.55),(bv-.9)/.9);
        float core=kind==2.?11.:1.1+.6*min(b,2.5)+.25*max(0.,log2(max(1.,b/2.5)));
        gl_PointSize=(kind==2.?core*3.2:core*4.2)*dpr;
      }`,`
      precision mediump float;
      varying vec3 vColor;varying float vAlpha;varying float vKind;
      uniform float moonFrac;uniform float limbAngle;
      void main(){
        vec2 d=(gl_PointCoord-.5)*2.;
        if(vKind==2.){
          float r=length(d)*3.2;
          vec2 p=vec2(d.x*cos(limbAngle)+d.y*sin(limbAngle),-d.x*sin(limbAngle)+d.y*cos(limbAngle))*3.2;
          float disc=1.-smoothstep(.92,1.05,r);
          float lit=disc*step((1.-2.*moonFrac)*sqrt(max(0.,1.-p.y*p.y)),p.x);
          float glow=exp(-max(0.,r-1.)*1.6)*.35*moonFrac*smoothstep(1.,.6,length(d));
          vec3 col=vec3(.98,.97,.92)*(lit*1.25+disc*.07)+vec3(.9,.93,1.)*glow;
          gl_FragColor=vec4(col*vAlpha,1.);return;
        }
        // Fade to zero before the sprite border (no squares), then soft-saturate.
        float edge=smoothstep(1.,.5,length(d));
        float r2=dot(d,d)*4.2*4.2;
        float core=exp(-r2/2.);
        float glare=exp(-sqrt(r2)/2.4)*.09;
        float I=(core+glare)*vAlpha*edge;
        gl_FragColor=vec4(1.-exp(-vColor*I*1.7),1.);
      }`);
    const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const aPoint=gl.getAttribLocation(water,'point');
    const uw={};for(const n of ['view','time','sunset','skyA','skyB','antiA','antiB','glowColor','reflectColor','seaTint','glowWeight','haze','skyReflect','exposure','moonlight','sunUv','sunAlt','sunAzRel','fovAz','altMax','moonUv','horizonUv','band'])uw[n]=gl.getUniformLocation(water,n);
    const up={};for(const n of ['lst','lat','viewAz','fovAz','altMax','view','horizonUv','band','dpr','night','time','moonlight','moonFrac','limbAngle','limitMag','dayMoon','swap'])up[n]=gl.getUniformLocation(points,n);
    const aStar=gl.getAttribLocation(points,'star'),aKind=gl.getAttribLocation(points,'kind');
    const starBuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,starBuf);gl.bufferData(gl.ARRAY_BUFFER,STARS,gl.STATIC_DRAW);
    const starCount=STARS.length/4;
    const kindZero=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,kindZero);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(starCount),gl.STATIC_DRAW);
    const bodyBuf=gl.createBuffer(),bodyKind=gl.createBuffer();let bodyCount=0;

    // Horizon placement. The water keeps the size it had when the surface was a
    // strip below the intro (49.5% of the space left under intro + 56px margin);
    // the sky takes everything above it, up to the top of the screen.
    let geo={w:0,h:0};
    function geometry(w,h){
      if(geo.w!==w||geo.h!==h){
        const intro=scene.parentElement.querySelector('.hero-introduction');
        const stripTop=intro?intro.offsetTop+intro.offsetHeight+56:h*.45;
        const water=Math.min(.5*h,Math.max(.16*h,.495*(h-stripTop)));
        geo={w,h,horizonUv:water/h,band:1-water/h};
      }
      return geo;
    }
    // Text over the sky. It used to be interpolated with the sky itself, dark
    // ink to night ink across dusk, so between Sun -4 and -7 degrees the text went
    // grey exactly while the sky went grey: contrast fell to 1.5:1 (the name
    // rgb(128,145,155) on a sky of rgb(122,110,95)) for about a quarter of an
    // hour every evening and morning. Now the text is always one of two sets,
    // dark or light, whichever reads better on the sky behind it, with a short
    // cross-fade when the sky crosses over (and a little hysteresis so it never
    // flickers at the boundary).
    const relLum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
    let textLight=null,textMix=0,textAt=0;
    function paintHeader(state){
      const p=state.pal,face=astro?astro.sunSide:1,root=document.documentElement.style;
      const hp=i=>p.header[i].map((v,c)=>lerp(state.anti.header[i][c],v,face));
      const base=hp(1).map((v,c)=>lerp(DAYHDR[c],v,state.sunset));
      root.setProperty('--sky-base','rgb('+base.map(Math.round).join(',')+')');
      // Equal contrast for the two ink sets falls near luminance 0.22.
      const lum=relLum(base);
      textLight=textLight===null?lum<.22:textLight?lum<.25:lum<.19;
      const now=performance.now(),goal=textLight?1:0;
      if(!running||!textAt)textMix=goal;
      else{const step=Math.min(120,now-textAt)/600;textMix=goal>textMix?Math.min(goal,textMix+step):Math.max(goal,textMix-step)}
      textAt=running?now:0;
      const k=smooth(textMix);
      const set=(day,warm,night)=>day.map((d,c)=>lerp(lerp(d,warm[c],state.sunset),night[c],k));
      const main=set(DAYINK,AMBER.ink,NIGHT.ink);
      // A mid-tone sky leaves no room for the lighter tiers, so near the
      // crossover they are drawn toward the main ink (menu links, the cities).
      const lift=Math.max(0,1-Math.abs(lum-.22)/.16)*.75;
      const toward=(v,t)=>v.map((x,c)=>lerp(x,main[c],t));
      const rgb=v=>'rgb('+v.map(Math.round).join(',')+')';
      root.setProperty('--sky-ink',rgb(main));
      // Two ink sets on a mid-tone sky can meet at best about 3.3:1, so near the
      // crossover the text also gets a soft halo of the opposite tone; it is
      // fully transparent the rest of the day and night.
      root.setProperty('--sky-halo',(k>.5?'rgba(8,16,28,':'rgba(255,248,236,')+(lift*.6).toFixed(3)+')');
      // The page arrows' lamp on Hero: moonlight on a dark sky, warm paper-light on a bright one.
      root.setProperty('--sky-glow',k>.5?'rgba(233,238,241,.16)':'rgba(255,250,240,.55)');
      root.setProperty('--sky-muted',rgb(toward(set(DAYMUTED,AMBER.muted,NIGHT.muted),lift)));
      root.setProperty('--sky-faint',rgb(toward(set(DAYFAINT,AMBER.faint,NIGHT.faint),lift)));
      scene.dataset.skyDark=state.sunset*p.stars>.5?'true':'false';
    }
    function applyWater(state){
      const p=state.pal;
      gl.uniform1f(uw.sunset,state.sunset);
      gl.uniform3fv(uw.skyA,p.sky[0].map(v=>v/255));gl.uniform3fv(uw.skyB,p.sky[1].map(v=>v/255));
      gl.uniform3fv(uw.antiA,state.anti.sky[0].map(v=>v/255));gl.uniform3fv(uw.antiB,state.anti.sky[1].map(v=>v/255));
      gl.uniform3fv(uw.glowColor,p.glow.map(v=>v/255));gl.uniform3fv(uw.reflectColor,p.reflect.map(v=>v/255));
      gl.uniform3fv(uw.seaTint,p.seaTint);gl.uniform1f(uw.glowWeight,p.glowWeight);gl.uniform1f(uw.haze,p.haze);gl.uniform1f(uw.skyReflect,p.skyReflect);gl.uniform1f(uw.exposure,p.exposure);
      gl.uniform1f(uw.moonlight,moonlight*state.sunset*p.stars);
    }
    const mixState=(a,b,t)=>({sunset:lerp(a.sunset,b.sunset,t),pal:lerpPal(a.pal,b.pal,t),anti:lerpPal(a.anti,b.anti,t)});
    function draw(){
      paintHeader(cur);
      if(!loaded||lost)return;
      const w=scene.clientWidth,h=scene.clientHeight;if(!w||!h)return;
      const dpr=Math.min(devicePixelRatio,1.5,Math.sqrt(4000000/(w*h)));
      const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
      if(canvas.width!==cw)canvas.width=cw;if(canvas.height!==ch)canvas.height=ch;
      gl.viewport(0,0,cw,ch);gl.disable(gl.BLEND);
      gl.useProgram(water);
      gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(aPoint);gl.vertexAttribPointer(aPoint,2,gl.FLOAT,false,0,0);
      gl.uniform2f(uw.view,w,h);gl.uniform1f(uw.time,clock);
      const g=geometry(w,h);
      gl.uniform1f(uw.fovAz,FOV_AZ);gl.uniform1f(uw.altMax,ALT_MAX);gl.uniform1f(uw.horizonUv,g.horizonUv);gl.uniform1f(uw.band,g.band);
      if(astro){
        const toUv=o=>[.5+o.daz/FOV_AZ,g.horizonUv+(o.alt/ALT_MAX)*g.band];
        const su=toUv(astro.sun),mu=toUv(astro.moon);
        gl.uniform2f(uw.sunUv,su[0],su[1]);gl.uniform1f(uw.sunAlt,astro.sun.alt);gl.uniform1f(uw.sunAzRel,astro.sun.daz);
        gl.uniform2f(uw.moonUv,astro.moon.alt>-2?mu[0]:-9,mu[1]);
      } else {gl.uniform2f(uw.sunUv,-9,0);gl.uniform1f(uw.sunAlt,45);gl.uniform1f(uw.sunAzRel,180);gl.uniform2f(uw.moonUv,-9,0)}
      applyWater(cur);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      gl.disableVertexAttribArray(aPoint);
      const night=cur.sunset*cur.pal.stars;
      if(astro&&(night>.001||astro.moon.alt>-2)){
        // While the city changes, the star field fades out and back in.
        const k=Math.min(1,(performance.now()-swapT0)/TRANSITION),swap=Math.abs(1-2*k);
        gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
        gl.useProgram(points);
        gl.uniform1f(up.lst,astro.lst);gl.uniform1f(up.lat,astro.latRad);gl.uniform1f(up.viewAz,astro.viewAz);
        gl.uniform1f(up.fovAz,FOV_AZ);gl.uniform1f(up.altMax,ALT_MAX);gl.uniform2f(up.view,w,h);
        gl.uniform1f(up.horizonUv,g.horizonUv);gl.uniform1f(up.band,g.band);gl.uniform1f(up.dpr,dpr);
        gl.uniform1f(up.night,night);gl.uniform1f(up.time,clock);gl.uniform1f(up.moonlight,moonlight);
        gl.uniform1f(up.limitMag,astro.limitMag);gl.uniform1f(up.dayMoon,1-cur.sunset);gl.uniform1f(up.swap,swap);
        gl.uniform1f(up.moonFrac,astro.moonFrac);gl.uniform1f(up.limbAngle,limbAngle);
        gl.enableVertexAttribArray(aStar);gl.enableVertexAttribArray(aKind);
        gl.bindBuffer(gl.ARRAY_BUFFER,starBuf);gl.vertexAttribPointer(aStar,4,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,kindZero);gl.vertexAttribPointer(aKind,1,gl.FLOAT,false,0,0);
        gl.drawArrays(gl.POINTS,0,starCount);
        if(bodyCount){
          gl.bindBuffer(gl.ARRAY_BUFFER,bodyBuf);gl.vertexAttribPointer(aStar,4,gl.FLOAT,false,0,0);
          gl.bindBuffer(gl.ARRAY_BUFFER,bodyKind);gl.vertexAttribPointer(aKind,1,gl.FLOAT,false,0,0);
          gl.drawArrays(gl.POINTS,0,bodyCount);
        }
        gl.disableVertexAttribArray(aStar);gl.disableVertexAttribArray(aKind);
        gl.disable(gl.BLEND);
      }
    }
    function frame(ts){
      raf=0;if(!running||lost)return;
      const ms=last===null?0:Math.min(50,Math.max(0,ts-last));last=ts;clock+=ms/1000;
      if(target){const k=Math.min(1,(ts-t0)/TRANSITION);cur=mixState(from,target,smooth(k));if(k>=1)target=null}
      draw();raf=requestAnimationFrame(frame);
    }
    // Recompute the real sky for the chosen city at the current instant.
    function compute(instant){
      const city=CITIES[cityId],date=new Date(),s=skyState(city,date);
      const daz=a=>((a-city.viewAz+540)%360)-180;
      const e=s.sun.alt;
      const limitMag=e>-1?-5:e>-6?lerp(-4.5,1.2,(-1-e)/5):e>-12?lerp(1.2,5.5,(-6-e)/6):e>-16?lerp(5.5,6.5,(-12-e)/4):6.5;
      astro={lst:s.lst,latRad:city.lat*Math.PI/180,viewAz:city.viewAz,moonFrac:s.moonFrac,
        sun:{alt:s.sun.alt,daz:daz(s.sun.az)},moon:{alt:s.moon.alt,daz:daz(s.moon.az)},limitMag,
        sunSide:.5+.5*Math.cos(daz(s.sun.az)*Math.PI/180)};
      const moonUp=Math.max(0,Math.min(1,(s.moon.alt+2)/12));
      moonlight=moonUp*Math.pow(s.moonFrac,1.4);
      const sx=daz(s.sun.az)-daz(s.moon.az),sy=(s.sun.alt-s.moon.alt)*(FOV_AZ/ALT_MAX)*(geometry(scene.clientWidth,scene.clientHeight).band*scene.clientHeight/Math.max(1,scene.clientWidth));
      limbAngle=Math.atan2(sy,sx);
      const rows=[],kinds=[];
      for(const p of s.planets){rows.push(p.ra,p.dec,p.mag,.6);kinds.push(1)}
      rows.push(s.moon.ra,s.moon.dec,-12.7,.5);kinds.push(2);
      gl.bindBuffer(gl.ARRAY_BUFFER,bodyBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(rows),gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,bodyKind);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(kinds),gl.DYNAMIC_DRAW);
      bodyCount=kinds.length;
      const sky=skyFor(e);
      if(instant||!running){cur=sky;target=null}else{from=cur;target=sky;t0=performance.now()}
      // The hero snapshot cache follows this key: city plus the minute.
      skyKey=cityId+'@'+Math.floor(date.getTime()/60000);
      const sunDaz=daz(s.sun.az);
      lastDescribe={city:city.name,time:fmt(date,city.tz),sunAlt:s.sun.alt,sunDir:dir(s.sun.az),viewDir:dir(city.viewAz),label:sky.label,tone:sky.tone,
        sunWhere:Math.abs(sunDaz)<FOV_AZ/2?'in view':Math.abs(sunDaz)>120?'behind':'out of view',moonAlt:s.moon.alt,moonFrac:s.moonFrac,
        times:Object.fromEntries(Object.entries(CITIES).map(([id,c])=>[id,fmt(date,c.tz)]))};
      scene.dataset.skyKey=skyKey;scene.dataset.city=cityId;
      scene.dispatchEvent(new CustomEvent('sky:update',{bubbles:true,detail:lastDescribe}));
      if(!running)draw();
    }
    function schedule(){clearInterval(timer);timer=setInterval(()=>{if(running&&!lost)compute(false)},RECOMPUTE_MS)}

    const image=new Image();
    image.onload=()=>{
      if(lost)return;
      gl.useProgram(water);
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);loaded=true;
      compute(true);
      if(running){draw();scene.dataset.oceanReady='true';raf=requestAnimationFrame(frame);schedule()}
    };
    image.src='pacific-horizon-1920.jpg';scene.append(canvas);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;cancelAnimationFrame(raf);clearInterval(timer);delete scene.dataset.oceanReady});
    compute(true);
    return {
      get city(){return cityId},
      get skyKey(){return skyKey},
      setCity(id){
        if(!CITIES[id]||id===cityId)return;
        cityId=id;swapT0=performance.now();compute(false);
      },
      setRunning(value){
        running=value;scene.dataset.oceanRunning=String(value&&!lost);
        cancelAnimationFrame(raf);raf=0;last=null;clearInterval(timer);
        if(loaded&&!lost){draw();scene.dataset.oceanReady='true';if(running){raf=requestAnimationFrame(frame);schedule()}}
      },
      // JPEG, not PNG: this frame is embedded in the page-turn snapshot, and at a
      // full-screen sky the PNG was ~1.6MB and ~50ms to encode on a 2560x1440 Mac,
      // which blocked the turn. Quality .92 is ~212KB and ~33ms, and the context is
      // opaque (alpha:false) so nothing needs transparency.
      snapshot(){if(!loaded||lost)return null;draw();scene.dataset.oceanReady='true';return canvas.toDataURL('image/jpeg',.92)},
      describe(){return lastDescribe},
      // On-demand facts for either city (the hover detail): time, Sun, view, phase of day.
      describeCity(id){
        const city=CITIES[id];if(!city)return null;
        const date=new Date(),s=skyState(city,date),f=skyFor(s.sun.alt),sunDaz=((s.sun.az-city.viewAz+540)%360)-180;
        return {city:city.name,time:fmt(date,city.tz),sunAlt:s.sun.alt,sunDir:dir(s.sun.az),viewDir:dir(city.viewAz),label:f.label,tone:f.tone,
          sunWhere:Math.abs(sunDaz)<FOV_AZ/2?'in view':Math.abs(sunDaz)>120?'behind':'out of view',moonAlt:s.moon.alt,moonFrac:s.moonFrac};
      }
    };
  }catch(error){console.warn('Ocean effect unavailable; using static photo.',error);return inert}
};
