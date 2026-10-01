/* Google Analytics 4 (gtag.js), Measurement ID below.

   What is sent (and what each answers):
   - page_view per room: /, /work, /work/<case>, /method, /about, /contact.
     Which rooms and projects are looked at. GA's default page_location drops
     the #fragment, so the room is given as the path, and the config's
     page_location is updated with it, so engagement time and the events below
     are credited to the room the visitor is in. The query string is kept, so
     UTM-tagged links (e.g. ?utm_source=resume) are attributed.
   - open_original {case_id, original_type, method}: an original was opened
     (PDF / Tableau / Shiny / video), by its link or, on a phone, by tapping the
     dashboard picture (method "picture"). Interest past the summary.
   - contact_click {method: email | linkedin | github | other}: the visitor went
     to make contact. The one to mark as a key event.
   - room_scroll {percent: 25 | 50 | 75 | 100}: how far each room or case study
     was read, once per threshold per visit to that room. (GA's own scroll
     event cannot see this: each room scrolls inside itself, not the window.)

   In GA:
   - Admin > Data streams > (stream) > Enhanced measurement: turn OFF "Page
     changes based on browser history events" (otherwise each room change is
     counted twice).
   - Admin > Data display > Custom definitions: register case_id,
     original_type, method and percent as event-scoped custom dimensions, or
     they are collected but not shown in reports.
   - Mark contact_click as a key event.

   Not sent from localhost / 127.0.0.1 / file:, nor from a browser that opened
   the site once with ?notrack (kept in this browser; ?track undoes it). */
(() => {
  const GA_ID = 'G-QZ79QK31YY';
  if (!GA_ID) return;
  const host = location.hostname;
  if (location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return;
  let query = new URLSearchParams(location.search);
  try {
    if (query.has('notrack')) localStorage.setItem('ga-notrack', '1');
    if (query.has('track')) localStorage.removeItem('ga-notrack');
    if (localStorage.getItem('ga-notrack') === '1') return;
  } catch (e) {}
  query.delete('notrack'); query.delete('track');
  const search = query.toString() ? '?' + query.toString() : '';

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.append(tag);
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());

  const NAMES = { '': 'Home', work: 'Work', method: 'Method', about: 'About', contact: 'Contact' };
  function current() {
    const route = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (route[0] === 'hero') route.shift();
    // #exhibit-<id> is a jump within the Work list, not a room of its own.
    if (route[0] && route[0].startsWith('exhibit-')) route.splice(0, 1, 'work');
    return { route, path: '/' + route.map(encodeURIComponent).join('/') };
  }

  let configured = false, lastPath = null, reached = new Set(), settleUntil = 0;
  function track() {
    const { route, path } = current();
    if (path === lastPath) return;
    lastPath = path;
    reached = new Set();
    // The page's own scroll on arrival (the Work list's restored position)
    // lands within this window and is not counted as reading.
    settleUntil = performance.now() + 250;
    const room = NAMES[route[0] || ''] || route[0];
    const page = {
      page_location: location.origin + path + search,
      page_title: room + (route[1] ? ' — ' + route[1] : '') + ' · Jiung Moon'
    };
    gtag('config', GA_ID, configured ? { ...page, update: true } : { ...page, send_page_view: false });
    configured = true;
    gtag('event', 'page_view', page);
  }
  // pushState/replaceState fire no event of their own; popstate covers back/forward.
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function () {
      const result = original.apply(this, arguments);
      queueMicrotask(track);
      return result;
    };
  }
  addEventListener('popstate', track);
  addEventListener('hashchange', track);
  track();

  // The case a click belongs to: the open case study, or the Work-list entry.
  function caseOf(el) {
    const { route } = current();
    if (route[0] === 'work' && route[1]) return route[1];
    const entry = el.closest('[id^="exhibit-"]');
    return entry ? entry.id.slice('exhibit-'.length) : '(none)';
  }
  function originalType(href) {
    const h = (href || '').toLowerCase();
    if (/\.pdf($|[?#])/.test(h)) return 'pdf';
    if (h.includes('tableau.com')) return 'tableau';
    if (h.includes('shinyapps.io')) return 'shiny';
    if (/\.(mp4|mov|webm)($|[?#])/.test(h) || h.includes('youtube.') || h.includes('youtu.be')) return 'video';
    return 'link';
  }
  function contactMethod(href) {
    const h = (href || '').toLowerCase();
    if (h.startsWith('mailto:')) return 'email';
    if (h.includes('linkedin.com')) return 'linkedin';
    if (h.includes('github.com')) return 'github';
    return 'other';
  }
  // Capture phase: some of these clicks are handled (and stopped) by the page.
  document.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const original = t.closest('a.original-link');
    if (original) {
      gtag('event', 'open_original', { case_id: caseOf(original), original_type: originalType(original.getAttribute('href')), method: 'link' });
      return;
    }
    const picture = t.closest('.embed-stage.is-zoomable');
    if (picture) {
      gtag('event', 'open_original', { case_id: caseOf(picture), original_type: 'tableau', method: 'picture' });
      return;
    }
    const link = t.closest('#contact a[href], a[href^="mailto:"]');
    if (link) gtag('event', 'contact_click', { method: contactMethod(link.getAttribute('href')) });
  }, true);

  // How far each room is read. Rooms scroll inside themselves; scroll events do
  // not bubble, so this listens in the capture phase, at most once a frame.
  // Only downward scrolling by the visitor counts: the jumps the page makes
  // itself (arriving at a room's end when going back up, restoring the Work
  // list's position) happen during a slide, right after a room change, or move
  // upward, and are skipped.
  const book = document.getElementById('book');
  const lastTop = new WeakMap();
  let pending = 0;
  document.addEventListener('scroll', e => {
    const box = e.target;
    if (pending || !(box instanceof Element) || !box.matches('#book > section, #book > footer')) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const top = box.scrollTop, before = lastTop.has(box) ? lastTop.get(box) : 0;
      lastTop.set(box, top);
      if (box.hidden || (book && book.classList.contains('is-sliding')) || performance.now() < settleUntil || top <= before) return;
      const range = box.scrollHeight - box.clientHeight;
      if (range < 40) return;
      const seen = (top + box.clientHeight) / box.scrollHeight;
      for (const percent of [25, 50, 75, 100]) {
        if (reached.has(percent)) continue;
        if (percent === 100 ? top >= range - 4 : seen >= percent / 100) {
          reached.add(percent);
          gtag('event', 'room_scroll', { percent });
        }
      }
    });
  }, { capture: true, passive: true });
})();
