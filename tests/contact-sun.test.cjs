/* Contact sunrise/sunset block — structure and wiring, no browser required.

   What this pins down:
   - the grid is corner + 2 cities + (event label + 2 numerals) x 2 rows
   - the columns follow the same city order sun-times.js returns, which is the
     order the footer note prints, since nothing on screen names the columns
   - every numeral carries an aria-label, because at rest the block is wordless
   - a redraw fires sun:changed, which book.js listens for to drop the Contact
     page's cached texture after midnight
   - the "Let's talk." heading and its element are gone from all three files  */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const read = f => fs.readFileSync(path.join(DIST, f), 'utf8');

// ---- a DOM small enough to run the file against -------------------------------
function makeElement(tag) {
  const node = {
    tagName: tag.toUpperCase(), className: '', textContent: '', children: [], dataset: {},
    attributes: {}, listeners: {}, tabIndex: -1,
    append(...kids) { kids.forEach(k => { if (k && k.tagName) this.children.push(k); }); },
    replaceChildren(...kids) { this.children = []; this.append(...kids); },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    closest() { return null; },
  };
  return node;
}
function walk(node, out = []) { out.push(node); node.children.forEach(c => walk(c, out)); return out; }

const host = makeElement('div');
const fired = [];
const docListeners = {};
global.document = {
  createElement: makeElement,
  getElementById: id => (id === 'contact-sun' ? host : null),
  addEventListener: (n, fn) => { (docListeners[n] = docListeners[n] || []).push(fn); },
  dispatchEvent: e => { fired.push(e.type); return true; },
};
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };

const winListeners = {};
const A = require(path.join(DIST, 'astronomy.browser.min.js'));
const CitySunTimes = require(path.join(DIST, 'sun-times.js'))(A);
global.window = {
  CitySunTimes,
  addEventListener: (n, fn) => { (winListeners[n] = winListeners[n] || []).push(fn); },
};

require(path.join(DIST, 'contact-sun.js'));

// ---- structure ----------------------------------------------------------------
assert.strictEqual(host.children.length, 1, 'one block is mounted');
const block = host.children[0];
assert.strictEqual(block.className, 'sun');
assert.strictEqual(block.tabIndex, 0, 'focusable, so the words are reachable without a pointer');

const grid = block.children[0];
assert.strictEqual(grid.className, 'sun-grid');
assert.strictEqual(grid.children.length, 9, 'corner + 2 cities + 2 x (label + 2 numerals)');

const keys = grid.children.filter(c => c.className === 'sun-key');
const cells = grid.children.filter(c => c.className === 'sun-cell');
assert.strictEqual(keys.length, 5, 'corner, two cities, two events');
assert.strictEqual(cells.length, 4);
assert.deepStrictEqual(keys.filter(k => k.dataset.row).map(k => k.textContent), ['sunrise', 'sunset']);
keys.forEach(k => assert.strictEqual(k.getAttribute('aria-hidden'), 'true', 'labels are decoration; the numerals carry the names'));

// ---- column order matches the data, and the footer note ------------------------
const cities = CitySunTimes.getSnapshot(new Date()).cities.map(c => c.name);
assert.deepStrictEqual(keys.filter(k => k.dataset.col).map(k => k.textContent), cities);
const footerNote = JSON.parse(read('content.json')).contact.footerNote.join(' ');
cities.forEach(name => assert.ok(footerNote.includes(name), name + ' is named in the footer note, which is the only key to the columns'));
assert.ok(footerNote.indexOf(cities[0]) < footerNote.indexOf(cities[1]), 'the note lists the cities in column order');

// ---- every numeral is labelled, and sits at its own coordinates ----------------
assert.deepStrictEqual(cells.map(c => c.dataset.col + ',' + c.dataset.row), ['0,0', '1,0', '0,1', '1,1']);
const times = walk(block).filter(n => n.tagName === 'TIME');
assert.strictEqual(times.length, 4);
times.forEach(t => {
  assert.ok(/^\d{2}:\d{2}$/.test(t.textContent), 'HH:mm, no words');
  assert.ok(/(sunrise|sunset)/.test(t.getAttribute('aria-label')), 'a screen reader is told what it is');
  assert.ok(t.dateTime, 'machine-readable instant');
});
cities.forEach(name => assert.ok(times.some(t => t.getAttribute('aria-label').startsWith(name))));

// ---- the cache hook ------------------------------------------------------------
assert.ok(fired.includes('sun:changed'), 'a redraw tells book.js the Contact sheet is stale');
assert.ok(read('book.js').includes("document.addEventListener('sun:changed'"), 'book.js listens for it');
assert.ok(/sun:changed.*cache\.delete\(ids\.indexOf\('contact'\)\)/.test(read('book.js')), 'and drops the Contact texture');

// ---- it redraws on the events sun-times.js actually fires -----------------------
['sun-times:update', 'pageshow'].forEach(n => assert.ok(winListeners[n] && winListeners[n].length, 'redraws on ' + n));

// ---- "Let's talk." is gone everywhere ------------------------------------------
['index.html', 'content.js', 'content.json'].forEach(f => {
  assert.ok(!read(f).includes('contact-heading'), 'no contact-heading left in ' + f);
  assert.ok(!read(f).includes("Let's talk"), 'no heading string left in ' + f);
});
assert.ok(read('index.html').includes('id="contact-sun"'), 'the block has a mount point');
assert.ok(read('index.html').includes('contact-sun.js'), 'and the page loads the script');

console.log('PASS: grid shape, column order vs footer note, aria labels, sun:changed cache hook, heading removed');
