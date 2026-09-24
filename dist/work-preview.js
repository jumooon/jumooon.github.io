(() => {
  'use strict';
  // Builds the Work sheet: the overview, and the case-study reading mode inside
  // the same sheet. (The standalone work-preview.html that also used this was
  // retired to _unused/, so only the in-book path remains.)
  function mountExhibition(data) {
  const scrollRoot = document.getElementById('work');
  const overview = document.getElementById('overview');
  const collection = document.getElementById('work-collection');
  const detail = document.getElementById('detail');
  const cases = new Map();
  const exhibits = window.workExhibits || {};
  let listScroll = 0, activeCase = null;
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const backLink = () => {
    const a = node('a', 'detail-back', '← All work');
    a.href = '#work';
    return a;
  };
  // WebP copies of the pictures sit beside them under the same name (for the
  // widest, also a 1000px copy — enough for a phone at 3x, or a 1000px column at
  // 1x). A <picture> offers them first; the original JPEG/PNG stays the <img>
  // src, for any browser without WebP. A third to a fifth of the bytes.
  const WEBP = {
    'exhibits/mediroute-presentation.jpg': [], 'exhibits/mediroute-event.jpg': [],
    'exhibits/investment.png': [], 'exhibits/marketing.png': [],
    'exhibits/carbon-sankey.jpg': [1000], 'exhibits/research-map.jpg': [1000],
    'exhibits/satellite.jpg': [1000], 'exhibits/apple-country-user.png': [1000]
  };
  // Wraps img (not yet given a src) in a <picture> when WebP copies exist.
  function withWebp(img, asset) {
    const sizes = WEBP[asset.src];
    if (!sizes) return img;
    const base = asset.src.replace(/\.(jpe?g|png)$/i, '');
    const source = document.createElement('source');
    source.type = 'image/webp';
    source.srcset = [...sizes.map(w => base + '-' + w + '.webp ' + w + 'w'), base + '.webp ' + asset.width + 'w'].join(', ');
    source.sizes = '(max-width: 760px) 84vw, 1000px';
    const picture = document.createElement('picture');
    picture.append(source, img);
    return picture;
  }
  function artwork(asset, destination, eager = false) {
    const figure = node('figure', 'exhibit-figure');
    if (asset.type === 'video') {
      const video = node('video', 'exhibit-video');
      video.src = asset.src;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', asset.alt);
      const fallback = node('a', '', 'Open demonstration video');
      fallback.href = asset.src;
      video.append(fallback);
      figure.append(video, node('figcaption', '', asset.caption));
      return figure;
    }
    const link = node('a', 'exhibit-image-link');
    link.href = destination;
    const img = node('img', 'exhibit-image');
    // loading before src: an <img> starts downloading the moment it has a src,
    // so set the other way round every picture on the Work page was fetched at
    // first load even while the page was hidden (measured: 2.4 MB on a phone).
    img.loading = eager ? 'eager' : 'lazy';
    img.decoding = 'async';
    if (eager) img.fetchPriority = 'high';
    img.width = asset.width;
    img.height = asset.height;
    img.alt = asset.alt;
    // Into its <picture> before it has a src, so only the chosen file loads.
    link.append(withWebp(img, asset));
    img.src = asset.src;
    if (!destination.startsWith('#')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    figure.append(link, node('figcaption', '', asset.caption));
    return figure;
  }
  // A raw iframe to public.tableau.com is refused ("refused to connect", seen in
  // Chrome), so the <tableau-viz> component is the supported route for Tableau
  // Public and builds its own frame. Its runtime is ~330 KB of script from a
  // third party, so it is fetched only once someone is actually on the Work page
  // (see the sheet observer at the bottom), never for a visit that stays on Home.
  const TABLEAU_API = 'https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js';
  function loadTableauApi() {
    if (document.getElementById('tableau-embedding-api')) return;
    const script = node('script');
    script.id = 'tableau-embedding-api';
    script.type = 'module';
    script.src = TABLEAU_API;
    script.addEventListener('error', () => script.remove(), { once: true });
    document.head.append(script);
  }

  // A Tableau dashboard is authored at a fixed size — Dashboard1 reports
  // {behavior:'exactly', 1000x800} — and the component renders it at exactly that,
  // so in a narrower column the right edge and the bottom are simply cut off.
  // Once the viz is interactive we read its real size, give the stage that shape
  // and scale the viz down to fit, which removes the clipping and leaves equal
  // margins on both sides. A dashboard sized 'automatic' reports no fixed size;
  // then nothing is scaled and it lays itself out.
  function fitTableau(viz, stage) {
    const apply = () => {
      const sheet = viz.workbook && viz.workbook.activeSheet;
      const size = sheet && sheet.size;
      const w = size && size.minSize && size.minSize.width;
      const h = size && size.minSize && size.minSize.height;
      if (!w || !h || size.behavior !== 'exactly') return;
      viz.style.width = w + 'px';
      viz.style.height = h + 'px';
      // The stage keeps the column's full width so its mat matches the other
      // exhibits; only its height is set, to whichever of the two limits binds
      // first — the column width, or the max-height that keeps the dashboard on
      // screen without scrolling. The viz is then centred in that width, so the
      // two side margins stay equal whichever limit won.
      const fit = () => {
        if (!stage.isConnected) { observer && observer.disconnect(); return; }
        const avail = stage.parentElement.clientWidth;
        const limit = parseFloat(getComputedStyle(stage).maxHeight);
        const factor = Math.min(avail / w, (limit > 0 ? limit : Infinity) / h);
        if (!isFinite(factor) || factor <= 0) return;
        stage.style.aspectRatio = 'auto';
        stage.style.height = (h * factor) + 'px';
        viz.style.transform = 'translateX(' + ((avail - w * factor) / 2) + 'px) scale(' + factor + ')';
      };
      // Disconnected once the case is closed (All work empties the detail), so
      // an observer does not outlive every dashboard that was ever opened.
      const observer = 'ResizeObserver' in window ? new ResizeObserver(fit) : null;
      fit();
      if (observer) observer.observe(stage.parentElement);
    };
    viz.addEventListener('firstinteractive', apply, { once: true });
  }

  // Below this width a dashboard or a slide deck is not usable, and the page is
  // better served by the screenshot. Decided when the case opens: a narrow
  // screen then never loads the live frame at all (before, it loaded it and
  // hid it with CSS), and a wide one never downloads a poster it cannot show.
  const narrow = matchMedia('(max-width: 760px)');

  // A live embed, shown only on the detail page. Case studies are a separate
  // reading mode that never turns (book.js), so the frame is never rasterised
  // and needs no stand-in picture; the screenshot is used only on narrow screens.
  function embedFigure(asset) {
    const figure = node('figure', 'exhibit-figure exhibit-embed');
    const stage = node('div', 'embed-stage');
    stage.style.aspectRatio = asset.width + ' / ' + asset.height;
    if (narrow.matches) {
      const poster = node('img', 'embed-poster');
      poster.loading = 'lazy';
      poster.decoding = 'async';
      poster.width = asset.width;
      poster.height = asset.height;
      poster.alt = asset.alt;
      stage.append(withWebp(poster, asset));
      poster.src = asset.src;
      figure.append(stage, node('figcaption', '', asset.caption));
      return figure;
    }

    let frame;
    if (asset.embedType === 'tableau') {
      frame = node('tableau-viz', 'embed-frame');
      frame.setAttribute('src', asset.embed);
      // 'hidden', not 'bottom': the dashboard is authored at exactly 1000x800 and
      // the toolbar is drawn BELOW it inside Tableau's own document, so the frame
      // overflowed by the toolbar's height. That raised a vertical scrollbar, which
      // narrowed the usable width and raised a horizontal one under the dashboard.
      // With no toolbar the content is exactly the frame and neither bar appears.
      frame.setAttribute('toolbar', 'hidden');
      frame.setAttribute('hide-tabs', '');
      frame.setAttribute('width', '100%');
      frame.setAttribute('height', '100%');
      loadTableauApi();
      fitTableau(frame, stage);
    } else {
      // shinyapps.io serves inside a frame (verified in Chrome), so the plain
      // element is enough.
      frame = node('iframe', 'embed-frame');
      // Reveal's source deck is 1050x800 with a 10% margin. Give Shiny a
      // stable, near-1:1 internal viewport, then scale the entire iframe once.
      // Scaling the deck internally can make Shiny's plot measurement too small.
      const deckWidth = 1167, deckHeight = 889;
      // Only change the outer presentation window; keep Shiny's viewport stable.
      stage.style.aspectRatio = '16 / 9';
      stage.style.maxHeight = 'none';
      frame.style.width = deckWidth + 'px';
      frame.style.height = deckHeight + 'px';
      frame.style.transformOrigin = 'top left';
      const fitDeck = () => {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        if (width <= 0 || height <= 0) return;
        const scale = Math.min(width / deckWidth, height / deckHeight);
        const x = (width - deckWidth * scale) / 2;
        const y = (height - deckHeight * scale) / 2;
        frame.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      };
      // Start only after the stage has been attached and its width measured.
      requestAnimationFrame(() => {
        if (!stage.isConnected) return;
        fitDeck();
        frame.src = asset.embed;
        const observer = new ResizeObserver(() => {
          if (!stage.isConnected) { observer.disconnect(); return; }
          fitDeck();
        });
        observer.observe(stage);
      });
      frame.allowFullscreen = true;
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      frame.title = asset.embedTitle || asset.alt;
    }
    frame.setAttribute('aria-label', asset.embedTitle || asset.alt);
    stage.append(frame);
    figure.append(stage, node('figcaption', '', asset.caption));
    return figure;
  }

  // For a live embed (Tableau, Shiny) the link is a phone's way in: a phone
  // shows the screenshot, not the live dashboard, so there the link is shown
  // (class phone-only; book-phone.css hides it above 760px, where the live
  // dashboard is right there and the link would only send people away).
  function originalLink(asset) {
    const a = node('a', 'original-link' + (asset.embed ? ' phone-only' : ''), asset.label + ' ↗');
    a.href = asset.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function displayArtwork(asset, destination, eager = false) {
    if (asset.layout !== 'pair' || !asset.secondary) return artwork(asset, destination, eager);
    const pair = node('div', 'exhibit-pair');
    pair.append(artwork(asset, destination, eager), artwork(asset.secondary,
      destination.startsWith('#') ? destination : asset.secondary.src));
    return pair;
  }
  function renderDetail(c) {
    detail.replaceChildren(backLink());
    const heading = node('div', 'detail-heading');
    heading.tabIndex = -1;
    heading.append(node('p', 'detail-meta', c.org + ' · ' + c.role + ' · ' + c.period), node('h1', '', c.title), node('p', 'detail-summary', c.summary));
    const result = node('div', 'detail-result');
    result.append(node('strong', '', c.highlight), node('span', '', c.highlightLabel));
    const body = node('div', 'detail-body');
    const context = node('div', 'detail-context');
    const section = (key, label) => {
      const block = node('section', 'reading-section detail-' + key);
      block.append(node('h2', '', label));
      if (key === 'contribution') {
        const list = node('ul');
        // Preserve the original wording; separate complete contribution sentences.
        (c.sections[key].match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [c.sections[key]])
          .forEach(sentence => list.append(node('li', '', sentence.trim())));
        block.append(list);
      } else block.append(node('p', '', c.sections[key]));
      return block;
    };
    context.append(section('context', '01 / Context'), section('challenge', '02 / Challenge'));
    body.append(context, section('contribution', '03 / Contribution'), section('outcome', '04 / Outcome'), section('reflection', '05 / Reflection'), node('p', 'detail-tools', c.tags.join(' · ')), backLink());
    detail.append(heading);
    const asset = exhibits[c.id];
    if (asset) {
      const gallery = node('div', 'detail-gallery');
      gallery.append(asset.embed ? embedFigure(asset) : displayArtwork(asset, asset.src, true));
      // Beside a live embed the link is for phones only (see originalLink).
      if (asset.link) gallery.append(originalLink(asset));
      if (asset.note) gallery.append(node('p', 'artifact-note', asset.note));
      if (asset.secondary && asset.layout !== 'pair') gallery.append(artwork(asset.secondary, asset.secondary.src));
      detail.append(gallery);
    }
    detail.append(result, body);
    return heading;
  }
  function route(requestedId) {
    document.querySelectorAll('video').forEach(video => video.pause());
    const id = typeof requestedId === 'string' ? requestedId : location.hash.slice(1);
    const c = cases.get(id);
    {
      // A case study is its own reading mode: no menu and no page turn (book.js
      // checks this class); its "All work" link is the only way back.
      document.body.classList.toggle('work-detail-open', Boolean(c));
      const menu = document.querySelector('.site-header');
      if (menu) menu.inert = Boolean(c);
    }
    if (c) {
      if (!overview.hidden) listScroll = scrollRoot.scrollTop;
      overview.hidden = true;
      detail.hidden = false;
      activeCase = id;
      const heading = renderDetail(c);
      scrollRoot.scrollTo(0, 0);
      heading.focus({ preventScroll: true });
    } else {
      detail.hidden = true;
      // Leaving via All work releases live embeds; no hidden sessions to reuse.
      detail.replaceChildren();
      overview.hidden = false;
      scrollRoot.scrollTo(0, listScroll);
      const prior = [...collection.querySelectorAll('a')].find(a => a.hash === '#' + activeCase);
      if (prior) prior.focus({ preventScroll: true });
      const target = id.startsWith('exhibit-') ? document.getElementById(id) : null;
      if (target && collection.contains(target)) {
        const index = collection.querySelector('.work-index');
        if (index) index.open = false;
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        target.focus({ preventScroll: true });
      }
    }
    document.dispatchEvent(new CustomEvent('work:changed'));
  }
    collection.replaceChildren();
    const index = node('details', 'work-index');
    const toggle = node('summary', 'work-index-toggle');
    const total = data.work.groups.reduce((sum, group) => sum + group.cases.length, 0);
    toggle.append(node('span', '', 'Work index'), node('span', 'work-index-count', String(total)));
    index.append(toggle);
    const contents = node('nav', 'work-contents');
    contents.setAttribute('aria-label', 'Work index');
    data.work.groups.forEach(group => {
      const list = node('ul', 'work-contents-list');
      group.cases.forEach(c => {
        const item = node('li');
        const link = node('a', '', c.title);
        link.href = '#exhibit-' + c.id;
        item.append(link);
        list.append(item);
      });
      const row = node('div', 'work-contents-group');
      row.append(node('span', 'work-contents-label', group.title), list);
      contents.append(row);
    });
    index.append(contents);
    collection.append(index);
    data.work.groups.forEach(group => {
      const section = node('section', 'collection-group');
      const title = node('h2', 'collection-label', group.title);
      title.append(node('span', '', String(group.cases.length).padStart(2, '0')));
      section.append(title);
      group.cases.forEach((original, index) => {
        const asset = exhibits[original.id];
        const c = asset?.override ? { ...original, ...asset.override } : original;
        cases.set(c.id, c);
        if (asset) {
          const exhibit = node('article', 'exhibit exhibit-' + c.id + (asset.layout === 'pair' ? ' exhibit-wide' : ''));
          exhibit.id = 'exhibit-' + c.id;
          exhibit.tabIndex = -1;
          const caption = node('div', 'exhibit-caption');
          const label = node('div', 'exhibit-label');
          label.append(node('p', 'row-meta', String(index + 1).padStart(2, '0') + ' / ' + c.org + ' · ' + c.period));
          const title = node('h3', 'row-title');
          const titleLink = node('a', '', c.title);
          titleLink.href = '#' + c.id;
          title.append(titleLink);
          label.append(title, node('p', 'exhibit-role', c.role));
          const copy = node('div', 'exhibit-copy');
          copy.append(node('p', 'row-summary', c.summary));
          const actions = node('div', 'exhibit-actions');
          const story = node('a', '', 'Read the story');
          story.href = '#' + c.id;
          actions.append(story);
          if (asset.link) actions.append(originalLink(asset));
          copy.append(actions);
          caption.append(copy);
          exhibit.append(label, displayArtwork(asset, '#' + c.id, c.id === 'investment'), caption);
          section.append(exhibit);
          return;
        }
        const row = node('a', 'collection-row');
        row.id = 'exhibit-' + c.id;
        row.href = '#' + c.id;
        const text = node('div');
        text.append(node('p', 'row-meta', c.org + ' · ' + c.period), node('h3', 'row-title', c.title), node('p', 'row-summary', c.summary));
        const metric = node('div', 'row-result');
        metric.append(node('strong', '', c.highlight), node('span', '', c.highlightLabel));
        const arrow = node('span', 'row-open', '→');
        arrow.setAttribute('aria-hidden', 'true');
        row.append(text, metric, arrow);
        section.append(row);
      });
      collection.append(section);
    });
    collection.setAttribute('aria-busy', 'false');
    {
      scrollRoot.addEventListener('click', event => {
        const link = event.target.closest('a[href^="#"]');
        if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const id = link.hash.slice(1);
        if (id !== 'work' && !cases.has(id) && !id.startsWith('exhibit-')) return;
        event.preventDefault();
        event.stopPropagation();
        // History: opening a case study is an entry (#work/<id>), and its "All
        // work" link steps back to the entry it came from rather than piling a
        // new one on top, so Back and "All work" always agree.
        if (cases.has(id)) {
          route(id);
          history.pushState({ page: 'work', case: id }, '', '#work/' + id);
          return;
        }
        // Every case entry sits on top of the overview entry it was opened
        // from, except a case the visitor landed on by link (marked landing by
        // book.js): stepping back from that one would leave the site.
        if (id === 'work' && history.state && history.state.case && !history.state.landing) { history.back(); return; }
        route(id);
        if (id === 'work' && history.state && history.state.case) history.replaceState({ page: 'work' }, '', '#work');
      });
      // Back/Forward (book.js relays popstate before it turns): close a case
      // study the history has left, open the one it has arrived at. When the
      // arrival also changes page, the case opens once the Work sheet settles.
      let pendingCase = null;
      document.addEventListener('book:history', event => {
        const want = event.detail.page === 'work' && cases.has(event.detail.case) ? event.detail.case : null;
        if (!detail.hidden && activeCase !== want) route('work');
        pendingCase = null;
        if (!want) return;
        if (scrollRoot.getAttribute('aria-hidden') === 'false') route(want);
        else pendingCase = want;
      });
      new MutationObserver(() => {
        if (pendingCase && scrollRoot.getAttribute('aria-hidden') === 'false') { const id = pendingCase; pendingCase = null; route(id); }
      }).observe(scrollRoot, { attributes: true, attributeFilter: ['aria-hidden'] });
      scrollRoot.addEventListener('toggle', () => document.dispatchEvent(new CustomEvent('work:changed')), true);
      // Fetch the Tableau runtime in idle time once the Work sheet has become
      // the current page, so it is usually ready by the time a case is opened.
      // Watched through aria-hidden, which book.js settles only after a turn has
      // finished: 'hidden' flips when the turn starts, and parsing ~330 KB of
      // script then would land in the middle of the animation.
      const warmTableau = () => {
        if (scrollRoot.getAttribute('aria-hidden') !== 'false') return;
        sheetWatch.disconnect();
        if (narrow.matches) return;   // narrow screens show screenshots, never a live viz
        if ('requestIdleCallback' in window) window.requestIdleCallback(loadTableauApi, { timeout: 3000 });
        else window.setTimeout(loadTableauApi, 1500);
      };
      const sheetWatch = new MutationObserver(warmTableau);
      sheetWatch.observe(scrollRoot, { attributes: true, attributeFilter: ['aria-hidden'] });
      warmTableau();
      // A link straight to a case study (#work/<id>) opens it.
      const deep = (location.hash.match(/^#work\/([\w-]+)$/) || [])[1];
      route(deep && cases.has(deep) ? deep : 'work');
    }
  }
  window.mountWorkExhibition = mountExhibition;
})();
