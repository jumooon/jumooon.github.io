/* Collection: a drawn scroll indicator for the horizontal wall.
   The native scrollbar is hidden (notebook.css) because the page-turn snapshot
   cannot reproduce its thumb position; this bar is plain DOM, so it can. It
   mirrors the wall's scroll position, can be dragged, and a press on the track
   jumps there. Keyboard and trackpad scrolling stay on the wall itself. */
(() => {
  const wall = document.querySelector('.collection-wall');
  const bar = document.querySelector('.collection-bar');
  const thumb = bar && bar.querySelector('.collection-thumb');
  if (!wall || !thumb) return;
  const range = () => wall.scrollWidth - wall.clientWidth;
  function update() {
    // Only while the wall is laid out. When its page is hidden (display:none)
    // every size reads 0; updating then hid the bar, so it vanished for the
    // next page turn and reappeared a frame after the page was shown again.
    if (!wall.clientWidth || !bar.clientWidth) return;
    const max = range(), track = bar.clientWidth;
    bar.hidden = max <= 1;
    if (max <= 1 || !track) return;
    const len = Math.max(32, track * wall.clientWidth / wall.scrollWidth);
    thumb.style.width = len + 'px';
    thumb.style.transform = 'translateX(' + ((track - len) * wall.scrollLeft / max) + 'px)';
  }
  wall.addEventListener('scroll', update, { passive: true });
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(update); ro.observe(wall); ro.observe(bar); }
  else window.addEventListener('resize', update);
  wall.querySelectorAll('img').forEach(img => img.addEventListener('load', update));
  thumb.addEventListener('pointerdown', event => {
    event.preventDefault(); event.stopPropagation();
    thumb.setPointerCapture(event.pointerId);
    const x0 = event.clientX, s0 = wall.scrollLeft, room = Math.max(1, bar.clientWidth - thumb.offsetWidth), max = range();
    const move = e => { wall.scrollLeft = s0 + (e.clientX - x0) * max / room; };
    const up = () => { thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); thumb.removeEventListener('pointercancel', up); };
    thumb.addEventListener('pointermove', move); thumb.addEventListener('pointerup', up); thumb.addEventListener('pointercancel', up);
  });
  bar.addEventListener('pointerdown', event => {
    if (event.target === thumb) return;
    const r = bar.getBoundingClientRect(), len = thumb.offsetWidth;
    const f = Math.min(1, Math.max(0, (event.clientX - r.left - len / 2) / Math.max(1, r.width - len)));
    wall.scrollTo({ left: f * range(), behavior: 'smooth' });
  });
  // book.js calls this while it has the Collection sheet un-hidden for one
  // synchronous snapshot, so a sheet that was never shown still gets a thumb.
  window.syncCollectionBar = update;
  update();
})();
