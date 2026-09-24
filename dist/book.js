/* A cached page texture on one GPU mesh. Live pages retain semantics/scroll. */
(() => {
  'use strict';
  const book = document.getElementById('book');
  const header=document.querySelector('.site-header');
  function measureHeader(){document.documentElement.style.setProperty('--book-header-height',header.offsetHeight+'px')}
  let pages = [], ids = [], scrollPositions = [];
  // Elapsed-time based; follows native display refresh. 1850 (was 1650): the
  // owner asked for a slightly more unhurried turn.
  const TURN_DURATION = 1850;
  book.dataset.rendererVersion = '20260924-split';
  function rasterScale(w,h,dpr) {
    // Native device pixels, so the raster lines up with the live page it hands
    // over to. The old 4.8-megapixel cap dropped a 1920x895 window at 2x to
    // 1.67x: the snapshot was upscaled by 1.2, so the landing half of every turn
    // was soft and its lines sat about 1 device pixel off the live half across
    // the spine (measured on the owner's screenshots, 3840x1790) — the "rises
    // then settles" / "words grow then shrink" at arrival. Only the texture size
    // limit still applies.
    return Math.min(dpr,2,4096/Math.max(w,h));
  }
  function turnSchedule(count) {
    const turns=[];
    for(let i=0;i<count;i++){
      // Keep neighboring velocities close: no fast, flick-like middle sheets.
      // Riffle sheets keep their old proportions to the single turn.
      const k=TURN_DURATION/1650;
      const duration=count===1?TURN_DURATION-165:Math.round((i===0?1500:i===count-1?1650:1400)*k);
      const prior=turns[i-1];
      const start=prior?prior.start+prior.duration-Math.min(prior.duration,duration)*0.42:0;
      turns.push({start,duration});
    }
    return {turns,duration:turns[count-1].start+turns[count-1].duration+165};
  }
  // The turn's eased progress for a pose t in [0,1]: a broader, quieter velocity
  // curve than quintic-only (less mid-turn rush).
  function poseProgress(t){return 0.35*t*t*t*(t*(t*6-15)+10)+0.65*(1-Math.cos(Math.PI*t))/2}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Phones: the same 760px line the stylesheets use (see book-phone.js).
  const narrowMq = matchMedia('(max-width: 760px)'), narrow = () => narrowMq.matches;
  // Snapshots. `cache` holds them at device resolution; `lowCache` at 1x, for
  // the pages a phone's riffle only shows in passing. Invalidating a page
  // (cache.delete / clear, used throughout) drops both.
  const lowCache = new Map();
  const cache = new (class extends Map {
    delete(key) { lowCache.delete(key); return super.delete(key); }
    clear() { lowCache.clear(); super.clear(); }
  })();
  const images = new Map();
  const dropFrom = (store, key) => Map.prototype.delete.call(store, key);
  let current = 0, queued = null, active = null, raf = 0, revision = 0, warmTimer;
  let renderer, warming = false, rewarm = false, arrowsApi = null, holdingHome = false;
  // Every browser on an iPhone, and Safari on a Mac (Chrome on iOS says CriOS).
  const WEBKIT_SVG_RACE = /AppleWebKit/.test(navigator.userAgent) && !/(Chrome|Chromium|Edg)\//.test(navigator.userAgent);
  const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const ocean=window.createOcean(document.querySelector('.ocean-scene'));
  // The two cities under the hero title. A click makes the hero show that city's
  // real sky; snapshots are invalidated because the sky (and header colours) change.
  const place=document.getElementById('hero-place');
  const cityClocks=Object.fromEntries(Object.entries({busan:'Asia/Seoul',sandiego:'America/Los_Angeles'}).map(([id,timeZone])=>[
    id,new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone})
  ]));
  let cityClockTimer;
  function syncPlaces(){
    // Read wall time, never the cached timestamp from the 30-second sky update.
    const now=new Date();
    place.querySelectorAll('[data-place]').forEach(b=>{
      b.setAttribute('aria-pressed',String(b.dataset.place===ocean.city));
      const time=cityClocks[b.dataset.place]?.format(now);
      const label=b.querySelector('.place-time');
      if(time&&label.textContent!==time)label.textContent=time;
      const name=b.querySelector('.place-name').textContent;
      b.setAttribute('aria-label',name+(time?', now '+time:'')+' — show the sky over '+name);
    });
  }
  function tickCityClock(){
    clearTimeout(cityClockTimer);
    syncPlaces();
    // Align to the next real minute; delayed callbacks never accumulate drift.
    if(!document.hidden)cityClockTimer=setTimeout(tickCityClock,60000-Date.now()%60000);
  }
  document.addEventListener('visibilitychange',tickCityClock);
  window.addEventListener('pageshow',tickCityClock);
  tickCityClock();
  place.addEventListener('click',event=>{
    const b=event.target.closest('[data-place]');if(!b||active)return;
    // No cache.clear(): skyKey carries the city, so only the hero's entry expires.
    ocean.setCity(b.dataset.place);const d=ocean.describe();syncPlaces(d);player.sync(d);
  });
  // Hover/focus: the city's local time replaces its name; beneath, Sun altitude,
  // the sea it faces, and the phase of day.
  function showDetail(target){
    const b=target&&target.closest?target.closest('[data-place]'):null,detail=document.getElementById('place-detail');
    if(!detail)return;
    if(!b){detail.textContent='';detail.classList.remove('is-on');return}
    const d=ocean.describeCity(b.dataset.place);if(!d)return;
    detail.textContent='Sun '+(d.sunAlt>=0?'+':'−')+Math.abs(d.sunAlt).toFixed(0)+'° · facing '+d.viewDir+' · '+d.label;
    detail.classList.add('is-on');
  }
  place.addEventListener('mouseover',e=>showDetail(e.target));
  place.addEventListener('mouseleave',()=>showDetail(null));
  place.addEventListener('focusin',e=>showDetail(e.target));
  place.addEventListener('focusout',e=>{if(!place.contains(e.relatedTarget))showDetail(null)});
  document.querySelector('.ocean-scene').addEventListener('sky:update',e=>{syncPlaces(e.detail);player.sync(e.detail)});
  // Music. The hero holds a Spotify Embed, but collapsed: the circular control in
  // the menu opens it and starts the track, and closing it pauses. The player is
  // only built on that first press, so a visitor who never asks for music costs
  // Spotify nothing and the hero stays clean. Which track plays follows the sky —
  // each phase of day names its own, and a change of phase or city swaps the
  // entity while it is open. Spotify's terms forbid altering or obscuring the
  // player, so once open the card is shown exactly as Spotify renders it; only
  // whether it is open at all is ours. Visitors who are not signed in hear a
  // preview. The card sits inside the hero, which a page turn sets to
  // display:none — that neither stops playback nor reloads the iframe.
  const player=(()=>{
    const host=document.getElementById('hero-music'),slot=document.getElementById('spotify-embed');
    const button=document.getElementById('player-toggle'),wrap=document.getElementById('player');
    if(!host||!slot||!button||!wrap)return {configure(){},sync(){}};
    const WIDTH='100%',HEIGHT=80;
    let tracks={},tone=null,api=null,controller=null,loadedUrl=null;
    let playing=false,open=false,pendingOpen=false,resumeOnLoad=false;
    // An unknown phase still resolves to a track, so the control is never dead
    // while content.json has something configured.
    const trackFor=t=>{
      const hit=tracks[t];
      if(hit&&hit.uri)return hit;
      return tracks.night&&tracks.night.uri?tracks.night:Object.values(tracks).find(x=>x&&x.uri)||null;
    };
    // The URL form, because createController takes a url; the dark card comes from
    // the documented theme option instead of a query string, and Spotify carries it
    // over to whatever loadEntity is given afterwards (verified).
    const urlFor=t=>{const hit=trackFor(t);return hit?'https://open.spotify.com/track/'+String(hit.uri).split(':').pop():null};
    function label(){
      const track=trackFor(tone);
      // With no playable track the whole control goes away rather than sitting
      // there greyed out — that is also how the feature is switched off.
      wrap.hidden=!track;
      button.disabled=!track;
      button.classList.toggle('is-playing',playing);
      button.setAttribute('aria-expanded',String(open));
      button.setAttribute('aria-pressed',String(playing));
      button.setAttribute('aria-label',track?(open?'Stop ':'Play ')+track.title:'Music (no track yet)');
      if(track)button.title=track.title;else button.removeAttribute('title');
      host.hidden=!track;
      host.classList.toggle('is-open',open&&!!track);
    }
    // Injected on demand, so nothing reaches Spotify until the control is pressed.
    function loadApi(){
      if(api||document.getElementById('spotify-iframe-api'))return;
      const s=document.createElement('script');
      s.id='spotify-iframe-api';s.async=true;
      s.src='https://open.spotify.com/embed/iframe-api/v1';
      document.head.appendChild(s);
    }
    function build(){
      const url=urlFor(tone);
      if(controller||!api||!url)return;
      loadedUrl=url;resumeOnLoad=true;
      api.createController(slot,{url,width:WIDTH,height:HEIGHT,theme:'dark'},c=>{
        controller=c;
        const maybeResume=()=>{if(resumeOnLoad){resumeOnLoad=false;c.resume()}};
        c.addListener('ready',maybeResume);
        c.addListener('playback_started',()=>{playing=true;label()});
        c.addListener('playback_update',e=>{
          const d=e&&e.data;if(!d)return;
          playing=!d.isPaused;
          if(d.isPaused)maybeResume();
          label();
        });
      });
    }
    function openCard(){
      const url=urlFor(tone);if(!url)return;
      open=true;label();
      if(!controller){
        if(!api){pendingOpen=true;loadApi();return}
        build();return;
      }
      if(url!==loadedUrl){loadedUrl=url;resumeOnLoad=true;controller.loadEntity(url)}
      else controller.resume();
    }
    function closeCard(){
      open=false;resumeOnLoad=false;
      if(controller)controller.pause();
      playing=false;label();
    }
    button.addEventListener('click',()=>{if(!trackFor(tone))return;open?closeCard():openCard()});
    // index.html parks the API because its script is async; take it either way.
    if(window.spotifyIframeApi)api=window.spotifyIframeApi;
    else window.onSpotifyApiCollected=a=>{api=a;if(pendingOpen){pendingOpen=false;build()}};
    return {
      configure(music){tracks=(music&&music.tracks)||{};label()},
      sync(detail){
        const next=detail&&detail.tone;
        if(!next)return;
        const changed=next!==tone;
        tone=next;label();
        if(!changed||!controller||!open)return;
        const url=urlFor(next);
        if(!url||url===loadedUrl)return;
        // A city click is a user gesture, so resuming after the swap is allowed;
        // an unattended phase change may be blocked, and the track waits loaded.
        loadedUrl=url;resumeOnLoad=playing;controller.loadEntity(url);
      }
    };
  })();
  function updateHeader(index){
    header.dataset.page=ids[index];
    header.querySelectorAll('.nav-links a, .brand').forEach(a=>{
      const on=a.hash==='#'+ids[index];a.classList.toggle('is-active',on);
      if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
  }
  function syncOcean(){
    const running=!active&&!holdingHome&&!reduced.matches&&!document.hidden&&ids[current]==='hero';
    ocean.setRunning(running);
  }

  function refreshPages() {
    if (active) finish(true);
    const currentId = ids[current];
    const saved = new Map(ids.map((id,i)=>[id,scrollPositions[i]]));
    const candidates = [...book.children].filter(p=>p.id && p.matches('section, footer, [data-page]'));
    const menuIds = [...document.querySelectorAll('#nav-brand, #nav-links a')].map(a=>a.hash.slice(1));
    ids = [...new Set([...menuIds,...candidates.map(p=>p.id)])].filter(id=>candidates.some(p=>p.id===id));
    pages = ids.map(id=>candidates.find(p=>p.id===id));
    scrollPositions = ids.map(id=>saved.get(id)||0);
    pages.forEach(p=>p.classList.add('book-sheet'));
    current = Math.max(0,ids.indexOf(currentId || pageFromHash()));
    measureHeader();revision++;cache.clear();settle(current);
  }

  function settle(index) {
    pages.forEach((p, i) => {
      if (!p.hidden) scrollPositions[i] = p.scrollTop;
      p.hidden = i !== index; p.inert = i !== index;
      if (!p.hidden) p.scrollTop = scrollPositions[i];
      p.setAttribute('aria-hidden', String(i !== index));
      p.style.removeProperty('clip-path'); p.style.removeProperty('z-index');
      p.style.removeProperty('visibility');
    });
    current = index;
    syncPlaces();
    syncOcean();
    updateHeader(index);header.style.removeProperty('visibility');
    if (pages.some(p => p.hidden && p.contains(document.activeElement))) {
      pages[index].tabIndex = -1; pages[index].focus({preventScroll:true});
    }
    clearTimeout(warmTimer);
    scheduleWarm();
    syncArrows();
  }

  let warmGeneration = 0;
  function scheduleWarm() {
    const generation = ++warmGeneration;
    clearTimeout(warmTimer);
    // Do not start image encoding / GPU uploads just as the destination arrives.
    warmTimer=setTimeout(()=>{
      if('requestIdleCallback' in window)window.requestIdleCallback(()=>{if(!active && generation===warmGeneration && !document.hidden)warm()});
      else if(!active && generation===warmGeneration && !document.hidden)warm();
    },900);
  }

  async function preparePageImages(index) {
    const page=pages[index],images=[...page.querySelectorAll('img')];
    // Wait only for the images in the sheet's visible window. decode() waits on
    // every image it is given, and Chrome drops the decoded pixels of images that
    // are off screen, so asking for all of them held the turn on pictures nobody
    // would see: measured 88 ms with the Work sheet holding eight images out of
    // view, all of it spent re-decoding them. The sheet may itself be hidden (the
    // destination), so it is shown at its saved scroll for one synchronous
    // measurement and hidden again before anything can paint.
    let shown=images;
    if(page.getBoundingClientRect){
      const hidden=page.hidden;page.hidden=false;
      if(hidden)page.scrollTop=scrollPositions[index];
      const view=page.getBoundingClientRect();
      shown=images.filter(img=>inView(img.getBoundingClientRect(),view));
      page.hidden=hidden;
    }
    // Capped: decode() only settles when the browser renders, so in a tab that is
    // not being painted it can wait indefinitely, and the click would then never
    // turn the page. Past the cap an image may pop in; the page still turns.
    const cap=typeof setTimeout==='function'?new Promise(resolve=>setTimeout(resolve,400)):null;
    const decoded=Promise.all(shown.map(async img=>{
      img.loading='eager';
      try { await img.decode(); } catch { /* A failed image must not block navigation. */ }
    }));
    await (cap?Promise.race([decoded,cap]):decoded);
  }
  function inView(r,view){
    return r.width>0&&r.height>0&&r.bottom>view.top&&r.top<view.bottom&&r.right>view.left&&r.left<view.right;
  }

  function readAsDataURL(blob) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject; reader.readAsDataURL(blob);
    });
  }
  // Embed images at their displayed size times the raster scale, not at the
  // original file size: the 2433px portrait otherwise becomes a 1.6 MB data URL
  // inside every About snapshot (serialize + decode on each rasterization).
  // The srcset candidates of an <img>, as [{url, w}], smallest first.
  function srcsetOf(img) {
    // In a <picture> the files on offer are the WebP <source>'s.
    const source = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement.querySelector('source[srcset]') : null;
    return ((source || img).getAttribute('srcset') || '').split(',').map(part => part.trim().split(/\s+/))
      .filter(([url, d]) => url && /^\d+w$/.test(d || '')).map(([url, d]) => ({ url, w: parseInt(d, 10) }))
      .sort((a, b) => a.w - b.w);
  }
  async function embeddedImage(img, displayedWidth, displayedHeight, scale = rasterScale(book.clientWidth, book.clientHeight, devicePixelRatio)) {
    let src = img.currentSrc || img.src;
    let natural = img.naturalWidth || 0;
    // The picture's shape, from the loaded image or, before it has loaded (a
    // phone leaves pictures on hidden pages unloaded), from its width/height.
    const aw = +img.getAttribute('width') || 0, ah = +img.getAttribute('height') || 0;
    const ratio = natural && img.naturalHeight ? natural / img.naturalHeight : (aw && ah ? aw / ah : 0);
    // object-fit: cover scales the image to the larger of the box's two demands,
    // so size by the rendered image, not the box width (the 4:5 portrait box shows
    // a landscape photo scaled to its height and cropped at the sides).
    const rendered = Math.max(displayedWidth || 0, ratio ? (displayedHeight || 0) * ratio : 0) || natural;
    // Not loaded yet: take the smallest srcset file that is big enough, instead of
    // the src (the About portrait inlined its 650 KB 2100px file on a phone).
    if (!img.currentSrc) {
      const want = Math.ceil(Math.max(1, rendered) * scale), list = srcsetOf(img);
      const pick = list.find(c => c.w >= want) || list[list.length - 1];
      if (pick) { src = new URL(pick.url, location.href).href; natural = pick.w; }
    }
    const targetWidth = Math.min(natural || Infinity, Math.ceil(Math.max(1, rendered) * scale));
    const key = src + '@' + targetWidth;
    if (images.has(key)) { const hit = images.get(key); images.delete(key); images.set(key, hit); return hit; }
    // Each entry is a data URL of up to a few MB, and a resize makes a new width
    // for every picture, so the oldest are dropped past a bound instead of
    // accumulating for the life of the tab.
    while (images.size >= 24) images.delete(images.keys().next().value);
    const pending = (async () => {
      const response = await fetch(src);
      if (!response.ok) throw new Error('Page image unavailable');
      const blob = await response.blob();
      if (typeof createImageBitmap !== 'function') return readAsDataURL(blob);
      // A picture that has not loaded has no known size: read it from the file.
      let height0 = img.naturalHeight || 0;
      if (!natural || !height0) {
        const probe = await createImageBitmap(blob);
        natural = natural || probe.width; height0 = probe.height * natural / probe.width; probe.close();
      }
      const fit = Math.min(natural, targetWidth);
      // Within 2x of the displayed size the original file is inlined as is, so the
      // browser scales the same pixels it scales on the live page; a re-encoded
      // copy left faint differences that flickered at the handoff (Collection).
      if (natural <= fit * 2) return readAsDataURL(blob);
      const type = /\.png(\?|$)/i.test(src) ? 'image/png' : 'image/jpeg';
      // Resize and encode off the main thread where the browser can: a canvas
      // toDataURL() here was a synchronous encode inside every warm-up pass.
      if (typeof OffscreenCanvas === 'function') {
        const height = Math.max(1, Math.round(height0 * fit / natural));
        const scaled = await createImageBitmap(blob, { resizeWidth: fit, resizeHeight: height, resizeQuality: 'high' });
        const surface = new OffscreenCanvas(fit, height);
        surface.getContext('2d').drawImage(scaled, 0, 0); scaled.close();
        return readAsDataURL(await surface.convertToBlob({ type, quality: 0.92 }));
      }
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = fit; canvas.height = Math.max(1, Math.round(bitmap.height * fit / bitmap.width));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      return canvas.toDataURL(type, 0.92);
    })();
    images.set(key, pending);
    // A failed fetch is not remembered, so the next snapshot tries again.
    pending.catch(() => { if (images.get(key) === pending) images.delete(key); });
    return pending;
  }

  // Every stylesheet's text goes into each snapshot. The sheets do not change
  // while the page is open, so the text is built once and rebuilt only when a
  // sheet is added or removed, instead of walking every rule on every snapshot.
  //
  // The snapshot is laid out at device resolution (see the zoom in texture()),
  // so its SVG viewport is the page size times the raster scale. Two things
  // would then resolve against the wrong size, and both are fixed here, from the
  // live page's own state: @media blocks are kept or dropped by matchMedia()
  // on this document, and viewport units are written out as px.
  let cssText = null, cssKey = '';
  function flattenRules(rules) {
    let out = '';
    for (const rule of rules) {
      if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
        if (matchMedia(rule.media.mediaText).matches) out += flattenRules(rule.cssRules);
      } else if (rule.cssRules && rule.cssRules.length && !(typeof CSSKeyframesRule !== 'undefined' && rule instanceof CSSKeyframesRule)) {
        out += rule.cssText.slice(0, rule.cssText.indexOf('{')) + '{' + flattenRules(rule.cssRules) + '}\n';
      } else out += rule.cssText + '\n';
    }
    return out;
  }
  function snapshotCss() {
    const sheets = document.styleSheets, vw = innerWidth / 100, vh = innerHeight / 100;
    const key = [sheets.length, innerWidth, innerHeight, reduced.matches].join(':');
    if (cssText === null || cssKey !== key) {
      cssKey = key;
      cssText = [...sheets].map(sheet=>{try{return flattenRules(sheet.cssRules)}catch{return ''}}).join('\n')
        .replace(/(-?\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/g, (m, n, unit) => {
          const base = unit.endsWith('h') ? vh : unit.endsWith('w') ? vw : unit === 'vmin' ? Math.min(vw, vh) : Math.max(vw, vh);
          return (parseFloat(n) * base) + 'px';
        });
    }
    return cssText;
  }

  function texture(index, fresh = false, low = false) {
    const source = pages[index], w = book.clientWidth, h = book.clientHeight;
    const hasSky=Boolean(source.querySelector('.ocean-surface'));
    if(hasSky)syncPlaces();
    const scroll = source.hidden ? scrollPositions[index] : source.scrollTop;
    const headerHeight=header.offsetHeight;
    // The hero sheet runs under the transparent menu bar; other sheets start below it.
    const sheetTop=source.classList.contains('hero')?0:headerHeight,contentHeight=h-sheetTop;
    const scale=low?1:rasterScale(w,h,devicePixelRatio), store=low?lowCache:cache;
    // skyKey changes every minute; folding it into every page's key threw the whole
    // cache away that often and made the next turn re-rasterise. Only the page that
    // actually draws the sky depends on it.
    const sky = hasSky ? ocean.skyKey+':clock:'+Math.floor(Date.now()/60000) : '';
    const key = [w,h,scale,headerHeight,scroll,revision,sky].join(':');
    const hit = store.get(index);
    if (!fresh && hit && hit.key === key) {
      dropFrom(store,index);store.set(index,hit);return hit.promise;
    }
    // Capture layout synchronously, restoring hidden state before browser paint.
    const hidden = source.hidden;
    source.hidden = false;
    source.scrollTop = scroll;
    if (source.querySelector('.collection-bar')) window.syncCollectionBar?.();
    const contentWidth = source.clientWidth;
    const scrollHeight=source.scrollHeight,sourceHeight=source.clientHeight,scrollbarWidth=source.offsetWidth-contentWidth;
    // Capture GPU pixels synchronously at the frozen clock; canvases themselves
    // cannot be serialized into foreignObject snapshots. The water is copied as
    // pixels (a canvas-to-canvas copy) and later drawn beneath the rest of the
    // page, which is rasterised with a see-through sky. Before, the frame was
    // JPEG-encoded and embedded in the SVG as a data URL — the encode, the URL
    // escaping and the larger SVG decode made Home the slowest page to capture.
    const liveWater=source.querySelector('.ocean-surface')?ocean.frame():null;
    let water=null;
    if(liveWater){
      const copy=document.createElement('canvas');copy.width=liveWater.width;copy.height=liveWater.height;
      copy.getContext('2d').drawImage(liveWater,0,0);
      const box=liveWater.getBoundingClientRect(),origin=book.getBoundingClientRect();
      water={copy,x:box.left-origin.left,y:box.top-origin.top,w:box.width,h:box.height};
    }
    const skyStyle=getComputedStyle(source);
    const pageBackground=skyStyle.background;
    const skyBase=skyStyle.getPropertyValue('--sky-base');
    const skyText=['--sky-ink','--sky-muted','--sky-faint','--sky-halo'].map(n=>[n,skyStyle.getPropertyValue(n)]);
    const clone = source.cloneNode(true);
    const gallery = source.querySelector('.collection-wall');
    if (gallery) {
      const track = clone.querySelector('.collection-track');
      if (track) track.style.transform = `translateX(${-gallery.scrollLeft}px)`;
    }
    // What is inside the sheet's visible window; only that is captured in full.
    const sheetView = source.getBoundingClientRect();
    // A video element cannot paint its live frame inside a foreignObject.
    // Freeze the current frame for the turning sheet without starting playback —
    // but only for a video that is actually in view, and only at the size it is
    // shown. Measured before: the Work demo video was copied at its full
    // 1920x1019 and JPEG-encoded on every Work snapshot, 28.5 ms of synchronous
    // work, even while it sat far below the visible part of the page.
    const liveVideos = [...source.querySelectorAll('video')];
    clone.querySelectorAll('video').forEach((copy, i) => {
      const video = liveVideos[i];
      const still = document.createElement('div');
      still.className = copy.className;
      still.style.width = video.clientWidth + 'px';
      still.style.height = video.clientHeight + 'px';
      still.style.backgroundColor = '#101820';
      if (video.readyState >= 2 && video.videoWidth && inView(video.getBoundingClientRect(), sheetView)) {
        try {
          const frame = document.createElement('canvas');
          frame.width = Math.min(video.videoWidth, Math.ceil(video.clientWidth * scale));
          frame.height = Math.max(1, Math.round(video.videoHeight * frame.width / video.videoWidth));
          frame.getContext('2d').drawImage(video, 0, 0, frame.width, frame.height);
          still.style.backgroundImage = 'url("' + frame.toDataURL('image/jpeg', 0.85) + '")';
          still.style.backgroundSize = 'contain';
          still.style.backgroundPosition = 'center';
          still.style.backgroundRepeat = 'no-repeat';
        } catch (_) { /* Keep the same dark media surface if capture is unavailable. */ }
      }
      copy.replaceWith(still);
    });
    const originals = [...source.querySelectorAll('img')];
    const originalSizes = originals.map(img => [img.clientWidth || img.width, img.clientHeight || img.height]);
    // Each picture's laid-out size, given to its copy: the copy then keeps that
    // size whether or not its inlined file has decoded when the snapshot is
    // drawn (Safari could lay a not-yet-decoded picture out smaller — the
    // Collection works shrank for a moment at a turn).
    const originalCss = originals.map(img => { const cs = getComputedStyle(img); return [cs.width, cs.height]; });
    // Only images inside the sheet's visible window are inlined. The rest become
    // a 1px placeholder held at their exact laid-out box, so everything below
    // them sits where it does on the live page. Inlining all of them made the
    // Work snapshot a 3.68 MB SVG (56 ms to decode) and fetched, resized and
    // re-encoded pictures that were off screen or in a hidden subtree.
    const originalBoxes = originals.map(img => { const r = img.getBoundingClientRect(); return inView(r, sheetView) ? null : [r.width, r.height]; });
    source.hidden = hidden;
    clone.removeAttribute('hidden'); clone.removeAttribute('id'); clone.removeAttribute('style');
    clone.classList.remove('book-sheet'); clone.classList.add('paper-snapshot');
    Object.assign(clone.style,{width:contentWidth+'px',height:contentHeight+'px',top:(-scroll)+'px',left:'0'});
    clone.style.setProperty('--sky-base',skyBase);
    skyText.forEach(([n,v])=>clone.style.setProperty(n,v));
    clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    const headerClone=header.cloneNode(true);
    headerClone.removeAttribute('style');headerClone.dataset.page=ids[index];
    headerClone.querySelectorAll('.nav-links a, .brand').forEach(a=>{
      const on=a.hash==='#'+ids[index];a.classList.toggle('is-active',on);
      if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
    headerClone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    // A page is always pictured with the phone menu closed: the snapshot may be
    // taken while it is open (the tap on a room, or 1x copies made as it opens).
    headerClone.classList.remove('menu-open');
    headerClone.querySelector('.room-menu')?.setAttribute('hidden','');
    skyText.forEach(([n,v])=>headerClone.style.setProperty(n,v));
    const css = snapshotCss();
    // A copied <picture> would pick its <source> file over the inlined picture.
    clone.querySelectorAll('picture source').forEach(n=>n.remove());
    let embedded = 0;
    const promise = (async () => {
      await Promise.all([...clone.querySelectorAll('img')].map(async (img,i)=>{
        // The copy's own src goes first: a copy of a lazy picture that is not
        // loaded yet starts fetching the full file the moment it stops being
        // lazy, and every snapshot downloaded every picture on its page.
        img.src = BLANK_IMAGE;
        img.removeAttribute('srcset'); img.removeAttribute('sizes');
        img.removeAttribute('loading');
        const box = originalBoxes[i];
        // Home's fallback picture sits under the water, which is drawn in
        // separately: nothing of it would show, so it is not fetched or inlined.
        if (box || (water && originals[i].closest('.ocean-scene'))) {
          if (box) Object.assign(img.style, { boxSizing: 'border-box', width: box[0] + 'px', height: box[1] + 'px' });
          img.src = BLANK_IMAGE; return;
        }
        const [cssW, cssH] = originalCss[i];
        if (/px$/.test(cssW) && /px$/.test(cssH)) Object.assign(img.style, { width: cssW, height: cssH });
        img.src = await embeddedImage(originals[i], originalSizes[i][0], originalSizes[i][1], scale);
        embedded++;
      }));
      const embed=clone.querySelector('#spotify-embed, .hero-music');
      if(embed){const box=clone.querySelector('.hero-music');if(box)box.remove()}
      const surface=clone.querySelector('.ocean-surface');
      if(surface){
        surface.remove();
        // With the water drawn underneath, the sky must let it through: the
        // sheet's own background and the ocean scene's fallback picture stay
        // out. Without live water the fallback picture is the sky, as before.
        if(water)clone.style.background='transparent';
        else delete clone.querySelector('.ocean-scene').dataset.oceanReady;
      }
      const wrapper = document.createElement('div');
      wrapper.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
      // zoom = raster scale: the snapshot is laid out and pixel-snapped on the
      // same device-pixel grid as the live page. Drawn instead at 1x and scaled
      // up, every box snapped to whole CSS pixels, so anything sitting at a
      // fractional position landed up to one device pixel off the live page —
      // measured: the Work dashboard, live at y 642.461, was raster at 642, one
      // device pixel high, so the turning sheet sat slightly above the page it
      // replaced and dropped back when the turn handed over.
      wrapper.style.cssText = 'position:relative;width:'+w+'px;height:'+h+'px;overflow:hidden;font:16px/1.6 Arial,sans-serif;color:#173344;background:'+(water?'transparent':'#fbfdfd')+';-webkit-font-smoothing:antialiased;zoom:'+scale;
      wrapper.style.setProperty('--book-header-height', headerHeight+'px');
      const style = document.createElement('style');
      style.textContent = css + '\n.paper-snapshot *,.site-header *{animation:none!important;transition:none!important}';
      const pageViewport=document.createElement('div');
      Object.assign(pageViewport.style,{position:'absolute',top:sheetTop+'px',left:'0',width:contentWidth+'px',height:contentHeight+'px',overflow:'hidden',background:water?'transparent':pageBackground});
      pageViewport.append(clone);wrapper.append(style,pageViewport,headerClone);
      // Native scrollbars are outside the cloned content box. Reproduce the
      // same explicitly styled track/thumb so they do not pop in at settle.
      if(scrollbarWidth>0&&scrollHeight>sourceHeight){
        const track=document.createElement('div');track.className='book-scroll-track';
        Object.assign(track.style,{top:sheetTop+'px',height:contentHeight+'px',width:scrollbarWidth+'px'});
        const thumb=document.createElement('div');thumb.className='book-scroll-thumb';
        const thumbHeight=Math.max(24,contentHeight*contentHeight/scrollHeight);
        Object.assign(thumb.style,{height:thumbHeight+'px',top:(contentHeight-thumbHeight)*scroll/Math.max(1,scrollHeight-contentHeight)+'px'});
        track.append(thumb);wrapper.append(track);
      }
      const cw = Math.round(w*scale), ch = Math.round(h*scale);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+cw+'" height="'+ch+'"><foreignObject width="100%" height="100%">'+new XMLSerializer().serializeToString(wrapper)+'</foreignObject></svg>';
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await image.decode();
      const canvas = document.createElement('canvas');
      // Match device pixels instead of CSS pixels. NPOT textures avoid the
      // unequal horizontal/vertical resampling of power-of-two snapshots.
      canvas.width = cw; canvas.height = ch;
      const ctx=canvas.getContext('2d');
      if(water){
        // The sheet's colour, then the water where the live canvas sits (fitted
        // as its object-fit: cover is), then the page on top.
        ctx.fillStyle=pageBackground.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0]||skyBase||'#000';ctx.fillRect(0,0,cw,ch);
        const k=Math.max(water.w/water.copy.width,water.h/water.copy.height);
        const sw=water.w/k,sh=water.h/k,sx=(water.copy.width-sw)/2,sy=(water.copy.height-sh)/2;
        ctx.drawImage(water.copy,sx,sy,sw,sh,water.x*scale,water.y*scale,water.w*scale,water.h*scale);
      }
      // WebKit can draw an SVG before the pictures inlined in it have decoded,
      // leaving them blank on the first draw (WebKit bug 39059, open since
      // 2010). A throwaway draw starts their decoding; the real one follows.
      if (embedded && WEBKIT_SVG_RACE) {
        const prime = document.createElement('canvas'); prime.width = prime.height = 1;
        prime.getContext('2d').drawImage(image, 0, 0);
        await new Promise(resolve => setTimeout(resolve, 120));
        prime.getContext('2d').drawImage(image, 0, 0);
      }
      ctx.drawImage(image,0,0);
      if(!low&&new URLSearchParams(location.search).has('book-debug')){
        document.querySelector('[data-book-snapshot="'+ids[index]+'"]')?.remove();
        const diagnostic=new Image();diagnostic.src=canvas.toDataURL();
        diagnostic.dataset.bookSnapshot=ids[index];diagnostic.hidden=true;document.body.append(diagnostic);
      }
      return canvas;
    })();
    store.set(index,{key,promise});
    while(store.size>(low?6:narrow()?3:6))dropFrom(store,store.keys().next().value);
    promise.catch(()=>{if(store.get(index)?.promise===promise)dropFrom(store,index)});
    return promise;
  }

  // A phone's riffle (a jump of several pages, from the menu) turns one sheet
  // per page, and the ones in between are only seen in passing: 1x copies, a
  // quarter of the pixels. They are made when the menu opens — the only way to
  // ask for a jump — one at a time, rather than on every visit.
  let warmingLow = false;
  async function warmLow() {
    if (warmingLow || !narrow() || !phone) return;
    warmingLow = true;
    try {
      for (let index = 0; index < pages.length; index++) {
        if (index === current) continue;
        if (active || detailOpen() || document.hidden) return;
        try { phone.cacheImage(await texture(index, false, true)); } catch { /* The riffle makes it on the tap. */ }
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    } finally { warmingLow = false; }
  }
  // Phones: a touch stops a warm-up pass (it restarts once things are quiet), so
  // snapshot work never sits between a finger and its response.
  document.addEventListener('pointerdown', () => { if (narrow()) scheduleWarm(); }, { capture: true, passive: true });
  // Phones leave pictures on hidden pages unloaded until needed. Once the book
  // is quiet, the rest are fetched in the background — nearest pages first,
  // low priority, two at a time — so a page's pictures are there when it opens.
  let preloading = false;
  async function preloadPictures(generation) {
    if (preloading || !narrow()) return;
    preloading = true;
    try {
      const order = pages.map((_, i) => i).sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
      const queue = order.flatMap(i => [...pages[i].querySelectorAll('img')]).filter(img => !img.complete || !img.naturalWidth);
      const one = img => new Promise(resolve => {
        if (img.complete && img.naturalWidth) return resolve();
        const done = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(done, 8000);
        img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true });
        img.fetchPriority = 'low'; img.loading = 'eager';
      });
      const worker = async () => {
        while (queue.length) {
          if (active || document.hidden || generation !== warmGeneration) return;
          await one(queue.shift());
        }
      };
      await Promise.all([worker(), worker()]);
    } finally { preloading = false; }
  }
  async function warm() {
    // A request that arrives mid-pass (the Work sheet changing while an earlier
    // pass is still rasterising) is remembered and run after it, not dropped:
    // dropping it left the changed sheet cold until the next click.
    // A case study is a separate reading mode that never turns (see go()), so
    // nothing is rasterised while one is open — the live dashboard gets the
    // machine to itself. All work sends work:changed, which warms again.
    if (detailOpen() || document.hidden) return;
    if (warming) { rewarm = true; return; }
    if (active || reduced.matches || !book.clientWidth) return;
    warming = true;
    const generation = warmGeneration;
    try {
    // A phone curls with its own renderer (book-phone.js); warm snapshots are
    // uploaded there instead, so a swipe never waits on a texture upload.
    const sink = narrow() && phone && phone.cacheImage ? phone : null;
    if (!sink && !renderer) {
      const front = await texture(current);
      if (active) return;
      renderer = createRenderer();
      renderer.prepare(front, front, book.clientWidth, book.clientHeight, 1);
      renderer.paint(0.3, book.clientWidth, book.clientHeight, 1);
    }
    // A phone turns one sheet at a time and only ever needs the current page and
    // its neighbours; the desktop riffle may need up to six.
    const order = pages.map((_,i)=>i).sort((a,b)=>Math.abs(a-current)-Math.abs(b-current)).slice(0,narrow()?3:6);
    for (const index of order) {
      if(active || detailOpen() || document.hidden || generation!==warmGeneration) return;
      try {
        // A phone leaves pictures on hidden pages unloaded. The neighbours' first
        // screen is loaded and decoded here, while nothing is happening, so the
        // first turn to them neither waits for a download nor decodes mid-turn.
        if (sink && index !== current) await preparePageImages(index);
        if (active || detailOpen() || document.hidden || generation!==warmGeneration) return;
        const image = await texture(index);
        if (active || detailOpen() || document.hidden || generation!==warmGeneration) return;
        (sink || renderer).cacheImage(image);
        // Yield between snapshots/uploads so initial rendering stays responsive.
        await new Promise(resolve=>setTimeout(resolve,50));
      } catch { /* Retry on actual navigation. */ }
    }
    if (sink) {
      // Two pages away: 1x copies, the in-between sheet of a quick double tap
      // on the room guide, so the second turn does not stop to draw it.
      for (const index of [current - 2, current + 2]) {
        if (index < 0 || index >= pages.length) continue;
        if (active || detailOpen() || document.hidden || generation!==warmGeneration) return;
        try { sink.cacheImage(await texture(index, false, true)); await new Promise(resolve=>setTimeout(resolve,50)); } catch { /* Drawn on the tap instead. */ }
      }
      preloadPictures(generation);
    }
    } catch { /* Navigation has a no-animation fallback. */ }
    finally { warming = false; if (rewarm) { rewarm = false; scheduleWarm(); } }
  }

  function createRenderer() {
    const canvas = document.createElement('canvas');
    canvas.className = 'paper-mesh';
    // WebGL2 first: it allows mipmaps on the NPOT native-resolution snapshots, so
    // text on a steeply angled sheet is filtered instead of aliasing (shimmer).
    // WebGL1 keeps plain LINEAR sampling. No preserveDrawingBuffer: every frame
    // is drawn, so the browser may swap buffers instead of copying them.
    const attributes={alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'high-performance'};
    const gl = canvas.getContext('webgl2',attributes) || canvas.getContext('webgl',attributes);
    if (!gl) throw new Error('WebGL unavailable');
    const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    const maxAnisotropy = anisotropic ? Math.min(8, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
    book.dataset.rendererContext = webgl2 ? 'webgl2' : 'webgl';
    function shader(type, source) {
      const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`
      attribute vec3 position; attribute vec2 uv; attribute float light;
      uniform vec2 viewport; uniform float perspective;
      varying vec2 texcoord; varying float shade;
      void main(){
        float depth=1.0-position.z/perspective;
        // Perspective acts on x only: y is pre-multiplied by depth so the divide
        // leaves it unchanged. With a full perspective divide a lifted sheet was
        // drawn taller than the page and shrank back as it landed — measured on the
        // Work sheet at 1440x860, the dashboard's top border sat 10.6 px low at 61%
        // of the turn and crept back up to its place; on Method the Customers /
        // Frequency row grew and shrank. The sheet still curls, foreshortens and
        // shades; it just never changes height.
        gl_Position=vec4((position.x/viewport.x-0.5)*2.0,(0.5-position.y/viewport.y)*2.0*depth,-position.z/4000.0,depth);
        texcoord=uv; shade=light;
      }`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
#ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
#else
      precision mediump float;
#endif
      uniform sampler2D frontImage; uniform sampler2D backImage;
      uniform float direction;
      varying vec2 texcoord; varying float shade;
      void main(){
        bool front=(gl_FrontFacing == (direction>0.0));
        float u=front ? 0.5+direction*texcoord.x*0.5 : 0.5-direction*texcoord.x*0.5;
        vec4 color=front ? texture2D(frontImage,vec2(u,1.0-texcoord.y)) : texture2D(backImage,vec2(u,1.0-texcoord.y));
        float edge=smoothstep(0.996,1.0,texcoord.x)*0.065;
        gl_FragColor=vec4(color.rgb*(1.0-shade)+edge,color.a);
      }`));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const cols=64, rows=12, data=new Float32Array((cols+1)*(rows+1)*6);
    const edgeShade=new Float32Array(cols+1);
    for(let col=0;col<=cols;col++)edgeShade[col]=Math.pow(1-col/cols,3);
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      const j=(row*(cols+1)+col)*6;data[j+3]=col/cols;data[j+4]=row/rows;
    }
    const indices=[];
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
      const a=y*(cols+1)+x,b=a+cols+1; indices.push(a,b,a+1,a+1,b,b+1);
    }
    const vertices=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
    gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
    for(const [name,size,offset] of [['position',3,0],['uv',2,12],['light',1,20]]){
      const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,24,offset);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    const textures = new Map();
    let pinnedImages=new Set();
    let uploads=0;
    function cacheImage(image) {
      if (textures.has(image)) {
        const entry=textures.get(image);textures.delete(image);textures.set(image,entry);
        return entry.texture;
      }
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      const powerOfTwo=n=>(n&(n-1))===0;
      const mipmapped=webgl2||(powerOfTwo(image.width)&&powerOfTwo(image.height));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmapped?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(anisotropic)gl.texParameterf(gl.TEXTURE_2D,anisotropic.TEXTURE_MAX_ANISOTROPY_EXT,maxAnisotropy);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      uploads++;
      if(mipmapped)gl.generateMipmap(gl.TEXTURE_2D);
      textures.set(image,{texture,bytes:Math.round(image.width*image.height*4*(mipmapped?4/3:1))});
      // Bound VRAM as menus grow, retaining at least the two active faces.
      let bytes=[...textures.values()].reduce((sum,e)=>sum+e.bytes,0);
      while (textures.size>2 && (textures.size>6 || bytes>256*1024*1024)) {
        const evictable=[...textures.entries()].find(([image])=>!pinnedImages.has(image));
        if(!evictable)break;
        const [old,entry]=evictable;
        gl.deleteTexture(entry.texture);textures.delete(old);bytes-=entry.bytes;
      }
      return texture;
    }
    gl.uniform1i(gl.getUniformLocation(program,'frontImage'),0);
    gl.uniform1i(gl.getUniformLocation(program,'backImage'),1);
    const view=gl.getUniformLocation(program,'viewport'),perspective=gl.getUniformLocation(program,'perspective'),dir=gl.getUniformLocation(program,'direction');
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer=null;finish(true)});
    return {
      canvas,
      cacheImage,
      get uploads(){return uploads},
      pinImages(images){pinnedImages=new Set(images)},
      releaseImages(){pinnedImages.clear()},
      bind(front,back) {
        [front,back].forEach((image,i)=>{
          gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,cacheImage(image));
        });
      },
      clear() {
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      },
      // Compile/upload during idle preparation, before the first visible turn.
      prepare(front,back,w,h,direction) {
        canvas.style.opacity='1';
        const dpr=rasterScale(w,h,devicePixelRatio);
        const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
        if(canvas.width!==cw)canvas.width=cw;
        if(canvas.height!==ch)canvas.height=ch;
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.uniform2f(view,w,h);gl.uniform1f(perspective,Math.max(3000,w*2.2));gl.uniform1f(dir,direction);
        [front,back].forEach((image,i)=>{
          gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,cacheImage(image));
        });
      },
      paint(t,w,h,direction,clear=true) {
        const progress=poseProgress(t), phase=Math.PI*progress;
        const lift=t===1?0:Math.sin(phase),half=w/2,step=half/cols;
        const base=phase-lift*0.78*0.48;
        const baseSin=Math.sin(base),baseCos=Math.cos(base);
        // Landing. The sheet's lift toward the viewer (depth, which perspective
        // turns into magnification) and the corner twist are folded out over the
        // second half of the pose, from the moment the sheet stands upright. Without this the landing sheet was still ~100 px
        // off the page at 84% of the turn, so perspective drew it past its own
        // edge and then pulled it back: measured in simulation, the far edge
        // overshot by 8 px at 1440 wide, 10 px at 1728 and 15 px at 2560 (1 px at
        // 736, which is why a narrow window hid it), with the top edge 17 px high —
        // the "arrives, drifts, then settles" at the end of every turn. With the
        // fold the landing edge never passes its final position.
        const fold=Math.min(1,Math.max(0,(t-0.5)/0.5)),land=1-fold*fold*(3-2*fold);
        // Unequal lift from top to bottom introduces a gentle corner-led twist.
        // The bend remains curved through the vertical midpoint and relaxes flat.
        for(let row=0;row<=rows;row++){
          const v=row/rows;let x=0,z=0;
          // Angle is linear across each row. Rotate cached sine/cosine pairs
          // instead of evaluating thousands of trig functions every frame.
          const increment=lift*(0.78+0.10*(v-0.5))/cols;
          const si=Math.sin(increment),ci=Math.cos(increment);
          let sn=baseSin,cn=baseCos,sm=Math.sin(base+increment/2),cm=Math.cos(base+increment/2);
          for(let col=0;col<=cols;col++){
            const u=col/cols;
            if(col){
              x+=step*cm;z+=step*sm;
              const nextSm=sm*ci+cm*si;cm=cm*ci-sm*si;sm=nextSm;
              const nextSn=sn*ci+cn*si;cn=cn*ci-sn*si;sn=nextSn;
            }
            const j=(row*(cols+1)+col)*6;
            // Exact terminal coordinates: no accumulated trig/perspective drift
            // at the frame where the raster hands ownership to the live page.
            data[j]=t===1?half-direction*u*half:half+direction*x;
            data[j+1]=v*h+lift*u*u*(0.5-v)*6*land;
            data[j+2]=t===1?0:z*0.68*land;
            data[j+5]=t===1?0:0.10*Math.abs(sn)+0.025*lift*edgeShade[col];
          }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
        if(clear){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT)}
        gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
        return {lift,progress};
      }
    };
  }

  function finish(skipRemaining = false) {
    if(!active)return;
    const state=active;
    active=null;cancelAnimationFrame(raf);
    state.overlay?.remove();
    state.cleanup?.();
    renderer?.releaseImages();
    book.classList.remove('is-page-turning');book.removeAttribute('aria-busy');
    const destination=queued ?? state.destination;
    queued=null;
    settle(skipRemaining ? destination : state.target);
    if(!skipRemaining && destination!==current)go(destination);
  }

  async function riffle(state,from,direction,w,h,requestedAt) {
    const count=Math.abs(state.target-from), snapshots=[];
    // Prepare a bounded batch before starting. No rasterization, texture upload,
    // page swapping, or awaited work is allowed inside the animation timeline.
    for(let i=0;i<=count;i++){
      await preparePageImages(from+i*direction);
      if(active!==state)return;
      snapshots.push(await texture(from+i*direction));
      if(active!==state)return;
    }
    renderer ||= createRenderer();
    renderer.pinImages(snapshots);
    renderer.prepare(snapshots[0],snapshots[1],w,h,direction);
    snapshots.forEach(image=>renderer.cacheImage(image));
    const overlay=document.createElement('div');overlay.className='paper-turn';
    overlay.inert=true;overlay.setAttribute('aria-hidden','true');
    // The complete turning sheet (including its captured header) sits above
    // the live header, without lifting Hero's opaque background above it.
    overlay.append(renderer.canvas);document.body.append(overlay);state.overlay=overlay;
    const incoming=pages[state.target],outgoing=pages[from];
    incoming.hidden=false;incoming.scrollTop=scrollPositions[state.target];
    incoming.style.zIndex='1';outgoing.style.zIndex='2';
    incoming.inert=true;outgoing.inert=true;
    book.classList.add('is-page-turning');
    const schedule=turnSchedule(count),motionEnd=schedule.duration-165;
    let start,previous,maxMoving=0;
    const gaps=[],preparationMs=Math.round(performance.now()-requestedAt);
    const uploadsBeforeMotion=renderer.uploads;
    function paint(elapsed){
      const poses=schedule.turns.map(turn=>Math.max(0,Math.min(1,(elapsed-turn.start)/turn.duration)));
      const started=poses.reduce((n,t,i)=>t>0?i+1:n,0);
      const completed=poses.filter(t=>t===1).length;
      renderer.clear();
      // Flat halves underneath track actual page order. Forward and reverse use
      // the same texture mapping as the curved sheets, avoiding mirrored text.
      // The destination itself is never drawn as a raster: the live destination
      // page and header are already laid out beneath the transparent canvas, so
      // wherever the destination is flat the viewer sees real text. Rasterized
      // glyphs differ from live glyphs at the edges, so a raster->live crossfade
      // would make every letter shimmer; this way there is nothing to fade.
      if(started<count){renderer.bind(snapshots[started],snapshots[started]);renderer.paint(0,w,h,direction,false)}
      if(completed<count){renderer.bind(snapshots[completed],snapshots[completed]);renderer.paint(1,w,h,direction,false)}
      let moving=0;
      for(let i=0;i<count;i++)if(poses[i]>0&&poses[i]<1){
        renderer.bind(snapshots[i],snapshots[i+1]);
        renderer.paint(poses[i],w,h,direction,false);moving++;
      }
      maxMoving=Math.max(maxMoving,moving);
    }
    paint(0);
    // Commit the destination beneath the opaque canvas before motion begins.
    // Do not change header/content visibility at the start of the final fade.
    // Not header.inert: it takes the menu out of hit-testing, so the link under the
    // cursor loses :hover for the whole turn and regains it at settle — the menu row
    // appeared to refresh on arriving. Clicks during a turn are already handled, by
    // go() queueing them.
    updateHeader(state.target);
    outgoing.style.visibility='hidden';
    // The live destination was just un-hidden beneath the canvas, which at pose 0
    // still shows the whole outgoing sheet flat. Hold that pose for two frames so
    // the browser lays out and rasterises the destination before anything moves:
    // measured at 1728x1000, the first moving frames took 17-25 ms (one or two
    // dropped at 120 Hz) whenever the heavy Work sheet was being shown. The held
    // frames also draw the first moving sheet at pose 0 — pixel-identical to the
    // flat half beneath it — so both of its textures have been sampled by the GPU
    // once before the motion needs them.
    let settleFrames=2;
    function frame(ts){
      if(active!==state)return;
      if(settleFrames>0){
        settleFrames--;paint(0);
        if(count>0){renderer.bind(snapshots[0],snapshots[1]);renderer.paint(0,w,h,direction,false)}
        raf=requestAnimationFrame(frame);return;
      }
      if(start===undefined)start=ts;
      if(previous!==undefined)gaps.push(ts-previous);previous=ts;
      // The last sheet is flat at motionEnd; from that frame the canvas is fully
      // transparent and the live page is what the viewer sees, so settle right away.
      const elapsed=Math.min(motionEnd,ts-start);paint(elapsed);
      if(elapsed<motionEnd)raf=requestAnimationFrame(frame);
      else{
        book.dataset.lastTurn=JSON.stringify({from:ids[from],to:ids[state.target],sheets:count,durationMs:motionEnd,maxMoving,preparationMs,uploadsDuringMotion:renderer.uploads-uploadsBeforeMotion,frames:gaps.length,maxGapMs:Math.round(Math.max(0,...gaps)),over25:gaps.filter(g=>g>25).length});
        raf=requestAnimationFrame(()=>{if(active===state)finish()});
      }
    }
    raf=requestAnimationFrame(frame);
  }

  // Clicking into a case study opens a separate reading mode inside the Work
  // sheet: no menu, no page turn, and its own "All work" link is the only way
  // back (work-preview.js hides the menu and makes it inert).
  function detailOpen(){return document.body.classList.contains('work-detail-open')}
  async function go(target) {
    if(detailOpen())return;
    if(target<0)return;
    if(active){queued=target;return}
    if(target===current)return;
    pages[current]?.querySelectorAll('video').forEach(video => video.pause());
    if(reduced.matches){settle(target);return}
    if(narrow()&&phone){phone.turn(target);return}
    const destination=target;
    // At most four physical sheets / five snapshots per GPU batch, even after
    // adding many menu entries. The remaining distance continues automatically.
    target=current+Math.sign(destination-current)*Math.min(4,Math.abs(destination-current));
    const state={target,destination};active=state;
    clearTimeout(warmTimer);
    syncOcean();
    // A cached hero texture may predate the current moving water pose.
    cache.delete(ids.indexOf('hero'));
    const requestedAt=performance.now();
    const outgoing=pages[current],incoming=pages[target],direction=target>current?1:-1;
    const w=book.clientWidth,h=book.clientHeight;
    book.setAttribute('aria-busy','true');
    try{
      await riffle(state,current,direction,w,h,requestedAt);
    }catch(error){
      // If snapshot capture or GPU rendering is unavailable, navigation still works.
      if(active===state)finish(true);
      console.warn('Page animation unavailable; used immediate navigation.',error);
    }
  }
  // History. Every page the reader asks for becomes a history entry (#method,
  // #about ...), and Back/Forward replay the turn in the matching direction.
  // Before, a turn never touched the URL or the history, so Back left the site.
  // A case study adds #work/<id> (work-preview.js), so Back from one is the same
  // as its "All work" link.
  function pageFromHash(){return location.hash.slice(1).split('/')[0]||'hero'}
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  function pushPage(target){
    const id=ids[target];
    if(!history.state||history.state.page!==id||history.state.case)history.pushState({page:id},'','#'+id);
  }
  function navigate(target){
    if(detailOpen()||target<0||target>=ids.length)return;
    pushPage(target);go(target);
  }
  window.addEventListener('popstate',event=>{
    const state=event.state||{page:pageFromHash()};
    // work-preview.js closes or opens a case study first, so the book is free to turn.
    document.dispatchEvent(new CustomEvent('book:history',{detail:{page:state.page,case:state.case||null}}));
    const target=ids.indexOf(state.page);
    if(target>=0)go(target);
  });
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[href^="#"]');
    if(!a||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const target=ids.indexOf(a.hash.slice(1));if(target<0)return;
    event.preventDefault();navigate(target);
  });

  // Page arrows: a faint chevron at each side edge, raised when the pointer
  // comes within reach of that edge, lit (with the neighbouring page's name)
  // on hover, swelling for a moment on press. The keyboard's left/right keys
  // flash the matching arrow and turn; on wider touch screens a horizontal swipe
  // does the same. Hidden in a case study, whose only exit is "All work".
  arrowsApi=(()=>{
    const nav=document.createElement('nav');
    nav.className='page-arrows';nav.setAttribute('aria-label','Previous and next page');
    const make=side=>{
      const b=document.createElement('button');
      b.type='button';b.className='page-arrow page-arrow--'+side;
      b.innerHTML='<span class="page-arrow-light" aria-hidden="true"></span><svg class="page-arrow-glyph" viewBox="0 0 12 24" aria-hidden="true"><path d="'+(side==='prev'?'M9 3 3 12l6 9':'M3 3l6 9-6 9')+'"/></svg><span class="page-arrow-label"></span>';
      b.addEventListener('click',()=>{press(b);navigate(current+(side==='prev'?-1:1))});
      nav.append(b);return b;
    };
    const prev=make('prev'),next=make('next');
    document.body.append(nav);
    const nameOf=i=>{const a=document.querySelector('#nav-links a[href="#'+ids[i]+'"], #nav-brand[href="#'+ids[i]+'"]');return (a&&a.textContent.trim())||ids[i]};
    function press(b){b.classList.remove('is-pressed');void b.offsetWidth;b.classList.add('is-pressed');setTimeout(()=>b.classList.remove('is-pressed'),420)}
    const REACH=96;
    document.addEventListener('pointermove',e=>{
      if(e.pointerType==='touch')return;
      nav.classList.toggle('near-prev',e.clientX<REACH);
      nav.classList.toggle('near-next',e.clientX>innerWidth-REACH);
    },{passive:true});
    document.documentElement.addEventListener('pointerleave',()=>nav.classList.remove('near-prev','near-next'));
    document.addEventListener('keydown',e=>{
      if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
      if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey||detailOpen())return;
      const el=document.activeElement;
      if(el&&(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .collection-wall, iframe, tableau-viz')))return;
      const b=e.key==='ArrowLeft'?prev:next;if(b.hidden)return;
      e.preventDefault();b.classList.add('is-flash');setTimeout(()=>b.classList.remove('is-flash'),480);
      press(b);navigate(current+(e.key==='ArrowLeft'?-1:1));
    });
    // A quick horizontal swipe on a touch screen turns the page as the arrows
    // would — the same set turn, never one that follows the finger.
    let swipe=null;
    book.addEventListener('touchstart',e=>{
      const t=e.touches[0];
      swipe=e.touches.length===1&&!e.target.closest('.collection-wall, .embed-stage, iframe, input, textarea')?{x:t.clientX,y:t.clientY,at:performance.now()}:null;
    },{passive:true});
    book.addEventListener('touchend',e=>{
      const sw=swipe;swipe=null;if(!sw||detailOpen())return;
      const t=e.changedTouches[0],dx=t.clientX-sw.x,dy=t.clientY-sw.y,dt=performance.now()-sw.at;
      if(Math.abs(dx)>64&&Math.abs(dx)>2*Math.abs(dy)&&dt<700)navigate(current+(dx>0?-1:1));
    },{passive:true});
    return {sync(){
      nav.dataset.page=ids[current]||'';
      prev.hidden=current<=0;next.hidden=current>=ids.length-1;
      if(!prev.hidden){const n=nameOf(current-1);prev.querySelector('.page-arrow-label').textContent=n;prev.setAttribute('aria-label','Previous page: '+n)}
      if(!next.hidden){const n=nameOf(current+1);next.querySelector('.page-arrow-label').textContent=n;next.setAttribute('aria-label','Next page: '+n)}
    }};
  })();

  // Phones (≤760px) read the book one page at a time; that lives in
  // book-phone.js, which is handed this view of the engine. Everything else —
  // snapshots, the mesh, settle/finish, history — is shared. Values the engine
  // reassigns (pages, ids, current, active, raf) are passed as
  // accessors, never copied. Without book-phone.js a phone gets the desktop turn.
  const core={
    book,header,cache,reduced,narrow,warmLow,narrowMqListen:fn=>narrowMq.addEventListener('change',fn),detailOpen,finish,syncOcean,updateHeader,texture,preparePageImages,navigate,pushPage,
    get pages(){return pages},get ids(){return ids},get current(){return current},get scrollPositions(){return scrollPositions},
    get active(){return active},set active(v){active=v},
    get raf(){return raf},set raf(v){raf=v},
    get holdingHome(){return holdingHome},set holdingHome(v){holdingHome=v}
  };
  const phone=window.createBookPhone?window.createBookPhone(core):null;
  function syncArrows(){if(arrowsApi)arrowsApi.sync();if(phone)phone.sync()}
  syncArrows();
  // Phone browsers fire resize whenever their toolbar slides away during a
  // vertical scroll; that must not cut a slide short, so only a width change does.
  let lastWidth=innerWidth;
  window.addEventListener('resize',()=>{
    measureHeader();cache.clear();
    const widthChanged=innerWidth!==lastWidth;lastWidth=innerWidth;
    if(widthChanged||!(active?.slide||active?.curl))finish(true);
    scheduleWarm();
  });
  narrowMq.addEventListener('change',()=>{finish(true);syncArrows();scheduleWarm()});
  reduced.addEventListener('change',()=>{if(reduced.matches)finish(true);syncOcean();cache.delete(ids.indexOf('hero'))});
  document.addEventListener('visibilitychange',syncOcean);
  // Opening or closing a case study changes only the Work sheet: drop that one
  // texture and warm it again. The other pages' snapshots stay valid, so they are
  // kept — clearing them all on every case study made the first turns after
  // "All work" rasterise every page again on the click.
  document.addEventListener('work:changed', () => { cache.delete(ids.indexOf('work')); scheduleWarm(); });
  // Contact prints today's sunrise and sunset. They change at local midnight,
  // and nothing in the texture key tracks the date, so the cached sheet would
  // keep yesterday's numbers until something else invalidated it.
  document.addEventListener('sun:changed', () => cache.delete(ids.indexOf('contact')));
  const invalidateWorkMedia = event => {
    if (event.target.closest?.('.work-exhibition')) { cache.delete(ids.indexOf('work')); if (!active) scheduleWarm(); }
  };
  ['load', 'loadeddata', 'seeked', 'pause'].forEach(name => book.addEventListener(name, invalidateWorkMedia, true));
  book.addEventListener('scroll',event=>{
    if (event.target.matches?.('.collection-wall')) {
      cache.delete(ids.indexOf('collection'));
      if (!active) scheduleWarm();
      return;
    }
    const page=event.target,i=pages.indexOf(page);if(i<0)return;
    // A scrolled sheet no longer matches its snapshot. Re-warm once scrolling has
    // been still for a moment (scheduleWarm restarts its timer on every event);
    // otherwise the first turn after any scroll rasterised on the click — measured
    // 81-101 ms of preparation on Work, against 2-7 ms for the same turn warm.
    if (!page.hidden && !active) { scrollPositions[i]=page.scrollTop; cache.delete(i); scheduleWarm(); }
  },{passive:true,capture:true});
  // content.js finishes whenever content.json comes back, which can be before this
  // file has even downloaded — astronomy.browser.min.js and stars.js are ~163 KB and
  // sit ahead of it in the defer queue, so on a cold cache the event fires with no
  // listener yet and is simply lost. content.js therefore also leaves a flag, and
  // whichever of the two arrives second runs this once.
  let contentApplied=false;
  function applyContent(){
    if(contentApplied)return;
    contentApplied=true;
    player.configure(window.SITE_MUSIC);player.sync(ocean.describe());
    refreshPages();
    syncPlaces(ocean.describe());
    pages.forEach(p=>p.querySelectorAll('img').forEach(img=>{
      // Mobile must not decode every exhibition image on the Home screen.
      if(narrow()){img.loading='lazy';return}
      img.loading='eager';img.decode().then(()=>{cache.delete(pages.indexOf(p));if(!active)scheduleWarm()}).catch(()=>{});
    }));
    settle(current);
    // The entry the visitor landed on becomes the first page of the history.
    if(!history.state){const caseId=/^#work\/[\w-]+$/.test(location.hash)?location.hash.slice(6):null;history.replaceState({page:ids[current],case:caseId,landing:Boolean(caseId)},'',caseId?location.hash:'#'+ids[current])}
  }
  document.addEventListener('content:rendered',applyContent);
  if(window.CONTENT_RENDERED)applyContent();
  refreshPages();
  // New menu links + matching sections automatically participate in page order.
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.target!==book || [...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&n.id)))refreshPages();
  });
  observer.observe(book,{childList:true});
  observer.observe(document.getElementById('nav-links'),{childList:true,subtree:true});
})();
