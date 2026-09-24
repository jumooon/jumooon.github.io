/* Contact: today's sunrise and sunset for the two cities.

   Reads window.CitySunTimes, which sun-times.js publishes and refreshes at each
   city's own local midnight (it also re-checks on visibilitychange and pageshow,
   so a machine that slept through midnight catches up on waking). This file adds
   no timer of its own; it only redraws when sun-times:update says the data moved.

   The block is four numerals and nothing else at rest. Its meaning is carried by
   position: the columns are the cities in the order sun-times.js returns them,
   which is the order the hero's two buttons and the footer note below already
   use, and the rows are sunrise then sunset. Pointing at a numeral brings it
   forward and fades in the city and the event that name it. Nothing is shown by
   default, so every numeral also carries an aria-label for screen readers, and
   the block is focusable so the words are reachable without a pointer.

   After each redraw it fires sun:changed, which book.js uses to drop the Contact
   page's cached texture — otherwise a page turn after midnight would show
   yesterday's times painted into the snapshot. */
(() => {
  const HOST = 'contact-sun';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function key(text, kind, index) {
    const n = el('span', 'sun-key', text);
    n.dataset[kind] = String(index);
    n.setAttribute('aria-hidden', 'true');   // the numerals carry the real labels
    return n;
  }

  // A missing rise or set can only happen inside the polar circles, which neither
  // city is near; the dash keeps the cell from collapsing if it ever returns null.
  function cell(city, kind, col, row) {
    const event = kind === 'rise' ? city.sunrise : city.sunset;
    const box = el('div', 'sun-cell');
    box.dataset.col = String(col);
    box.dataset.row = String(row);
    if (!event) { box.append(el('span', null, '—')); return box; }
    const time = el('time', null, event.localTime);
    time.dateTime = event.utc;
    time.setAttribute('aria-label', city.name + ' ' + (kind === 'rise' ? 'sunrise' : 'sunset') + ' ' + event.localTime);
    box.append(time);
    return box;
  }

  function build(cities) {
    const box = el('div', 'sun');
    box.tabIndex = 0;
    box.setAttribute('aria-label', 'Today’s sunrise and sunset');

    // Empty corner, then the cities across the top; the events run down the left.
    // Each column is centred so a time sits under the middle of its city name.
    const grid = el('div', 'sun-grid');
    const corner = el('span', 'sun-key');    // holds the label column open
    corner.setAttribute('aria-hidden', 'true');
    grid.append(corner);
    cities.forEach((c, i) => grid.append(key(c.name, 'col', i)));
    ['rise', 'set'].forEach((kind, row) => {
      grid.append(key(kind === 'rise' ? 'sunrise' : 'sunset', 'row', row));
      cities.forEach((c, col) => grid.append(cell(c, kind, col, row)));
    });
    box.append(grid);

    // Light only the city, the event and the numeral being pointed at.
    const set = target => {
      const c = target && target.closest ? target.closest('.sun-cell') : null;
      if (c) { box.dataset.col = c.dataset.col; box.dataset.row = c.dataset.row; }
      else { delete box.dataset.col; delete box.dataset.row; }
    };
    grid.addEventListener('mouseover', event => set(event.target));
    grid.addEventListener('mouseleave', () => set(null));
    box.addEventListener('focus', () => { box.dataset.col = '0'; box.dataset.row = '0'; });
    box.addEventListener('blur', () => set(null));
    return box;
  }

  function render() {
    const host = document.getElementById(HOST);
    if (!host) return;
    // No CitySunTimes means astronomy.browser.min.js or sun-times.js did not load.
    // Leave the corner of the footer empty rather than printing an apology.
    const snapshot = window.CitySunTimes && window.CitySunTimes.getSnapshot(new Date());
    if (!snapshot || !snapshot.cities.length) { host.replaceChildren(); return; }
    host.replaceChildren(build(snapshot.cities));
    document.dispatchEvent(new CustomEvent('sun:changed'));
  }

  window.addEventListener('sun-times:update', render);
  window.addEventListener('pageshow', render);
  // sun-times.js runs on the same defer queue and may or may not have published
  // window.CitySunTimes by the time this file executes; take it either way.
  if (window.CitySunTimes) render(); else window.addEventListener('load', render);
})();
