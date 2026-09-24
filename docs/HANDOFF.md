# Portfolio page-turn handoff — 2026-09-16

## 2026-09-25 — Phone: Tableau dashboards open as a zoomable picture

On a phone, Tableau's own phone layout spilled off the screen (checked in a 390px frame). So on phones, "Explore dashboard" (Work list and case page) and a tap on the dashboard picture now open a full-screen viewer (work-preview.js `zoomView`, styles at the end of book-phone.css). The viewer shows the full-size WebP, falling back to the PNG. It fits the picture to the screen. Pinch, or double-tap for 2.5x, to zoom (5x at most). Drag to pan. "Close" leaves the viewer. It uses `touch-action:none`, so the page underneath never scrolls or zooms. The Shiny deck link ("View presentation") still opens the live deck.
- Checked in headless Chromium with CDP touch: pinch, drag, double-tap and close all work; no popups; no page errors. Desktop Work and the three live-embed cases are pixel-identical to before; the viewer never appears there.
- investment.png is 999px wide (1x), so deep zoom is soft. A 2x export would sharpen it.
- Shiny deck, found but not fixed here: at phone width, Shiny 1.13 reports the plot size after Reveal's scale (351px instead of 1050px). The server then draws a 351px PNG, and Reveal shrinks it by 0.33 again. Fix belongs in the deck source: give renderPlot fixed pixel width and height.
- Versions: work-preview.js?v=20260925-zoom, book-phone.css?v=20260925-zoom.

## 2026-09-25 — Links to live dashboards return on phones

- A phone shows the screenshot of a Tableau / Shiny embed, never the live view,
  so its "Explore dashboard" / "View presentation" link is back on phones —
  in the Work list and on the case page — opening in a new tab. originalLink()
  marks it `phone-only`; book-phone.css hides it at 761px and up, where the
  live view is on the page (desktop screenshots of Work and four cases
  identical before/after).


Follow-up: the phone-only dashboard/presentation links drop the trailing ↗ (label text only). Links to videos and PDFs keep ↗ on every width, so desktop is unchanged. work-preview.js?v=20260925-links3.

## 2026-09-25 — Phone turn pace: capped middle, ?curve and ?fps

- Why the phone turn looked choppy: its cubic ease-in-out peaks at 3x its
  average speed; the fold travels ~1100 px in 1.1 s, so mid-turn it jumped
  ~50 px per frame at 60 Hz (iOS Safari draws pages at 60 fps by default even
  on 120 Hz iPhones; Low Power Mode halves that).
- turnEase (book-phone.js): cubic-shaped lift and landing (a·t³/3, a = 13.15),
  a steady stretch in the middle at TURN_PEAK = 2.2x average (~37 px/frame),
  same 1100 ms (riffle 900 ms/sheet). Within 0.012 of the cubic at t ≤ 0.3 and
  t ≥ 0.7. tests/book-phone-pace.test.cjs checks ends, cap and continuity.
- ?curve=now uses the previous cubic, for comparison on the phone.
- ?fps shows, after each phone turn, fps, the display rate, frames drawn,
  frames missed and the longest gap (also in book.dataset.lastTurn): a clean
  60 Hz cap reads ~60 fps with 0 missed; dropped frames show as missed.

## 2026-09-25 — Phone feedback round (pacing, taps, guide, Contact, images)

- Pacing: one page 1100 ms (was 950); a jump 900 ms per sheet, 300 ms apart
  (was 760 / 230). Two frames are held at the first pose before motion.
- Taps on the room guide that did not register: the guide's buttons (and the
  menu button) act on the finger's pointerup (onTap in book-phone.js), not on
  the browser's click — iOS drops the click of a tap that stops a gliding
  scroll or drifts a few px. The following click is ignored for 700 ms; mouse
  and keyboard still use click. The steps' tap area is unchanged. `html { touch-action: manipulation }` on phones (no double-tap zoom
  holding back a quick second tap). One tap = one page from the page on show;
  a quick double tap turns one page (verified). warm() yields on pointerdown
  and keeps 1x copies of the pages two away.
- Room guide: plain white on every page, no backdrop blur, no per-page colours.
- Snapshot pictures: copies get the live computed width/height (they cannot
  lay out smaller than the live page while their inlined file decodes); on
  WebKit (every iPhone browser, Safari) a throwaway draw + 120 ms wait before
  the real draw — WebKit bug 39059, embedded images blank on first draw. Home's
  fallback picture under the water is no longer fetched/inlined. The WebKit
  path could not be run here (Chromium only); needs a look on the iPhone.
- Pictures: after the first warm pass a phone fetches every remaining picture
  in the background, nearest pages first, low priority, two at a time
  (12/12 loaded 12 s after opening Home, headless).
- Contact (phone only): content from the top; the times' grid has an empty
  column each side, so the numerals are centred; links and note below.
- Desktop pages pixel-identical before/after (1440x900, all five pages).
- Known, pre-existing: in Chromium the Collection snapshot differs from the live
  page by a sub-pixel (1.19% of pixels at text/image edges, same before this
  round).

## 2026-09-25 — WebP pictures, neighbour images, Contact on phones

- WebP copies beside the originals (same name, .webp; for the widest Work
  pictures also a -1000.webp): Work exhibits, the About portrait (all four
  sizes), Kim Whanki and Seurat. Monet stays JPEG (its WebP was larger).
  Made with Pillow, method 6: photos q82, charts q90 or lossless, whichever
  was smaller; compared at 100% crop with the originals. Offered through
  <picture><source type="image/webp"> with the original as <img src>, so a
  browser without WebP still gets a picture. `picture { display: contents }`
  keeps layout on the <img> (About/Collection screenshots identical before and
  after). texture() drops <source> from its copy (it would win over the
  inlined picture); srcsetOf() reads the <source>'s srcset.
  Work page pictures on a phone: 2601 KB -> 481 KB. Desktop total: 4738 KB
  -> 2722 KB. work-preview.js WEBP map lists which files have copies.
- Phones: warm() loads and decodes the neighbours' first-screen pictures
  (preparePageImages) before snapshotting them, so the first turn to a page
  does not wait on its downloads.
- Contact on phones: the same parts in the same order as the desktop (times,
  links, note), stacked in one column; desktop unchanged.
- tests/assets.test.cjs: every local file the site names (index.html src,
  srcset, href; the exhibit manifest; the WebP map) exists with exact case.

## 2026-09-25 — Load weight, snapshot cost, phone riffle

- Startup bytes on a phone (390x844, measured in headless Chromium): 4.73 MB
  -> 0.70 MB. Three causes, all fixed:
  1. Every sheet sat on screen until book.js hid them, so lazy pictures on all
     pages loaded. index.html now marks every sheet but Home `hidden`; a small
     inline script shows a deep-linked page instead (#work, #contact,
     #work/<case> verified from first paint, desktop and phone). notebook.css:
     `.book > [hidden]` guard (footer is display:flex).
  2. work-preview.js set `src` before `loading="lazy"`, so exhibit images
     downloaded at once; now loading first, posters lazy too.
  3. texture() removed `loading` from cloned <img>s while they still held their
     src, so every snapshot re-downloaded every picture on its page (desktop
     too). The copy's src is blanked first.
- embeddedImage(): a picture not loaded yet is embedded from the smallest
  srcset file big enough (srcsetOf) or read for its size and resized; the
  About portrait no longer inlines its 650 KB 2100px file (snapshot SVG
  889 KB before). tests/book-raster updated for the new signature.
- Snapshots never show the phone menu (header clone drops menu-open).
- Phone riffle: a jump turns one sheet per page (Home->Contact: 5), each 760 ms,
  230 ms apart; 950 ms for one page. The page seen at rest (current going
  forward, destination going back) is a device-resolution snapshot; pages in
  between are 1x copies (texture(i, false, true), lowCache), made when the
  menu opens (warmLow) since only the menu can ask for a jump. The renderer
  draws a stack bottom-first, skipping sheets hidden under a flat one; texture
  budget 32 MB / 9 textures, current turn pinned.
- A forward turn also decodes the destination's visible pictures before the
  sheet lifts (they are uncovered live).
- Long tasks at first load (4x CPU throttle): longest 286 -> 182 ms.

## 2026-09-25 — Phones: set turns only, room guide, menu behind three lines

- The page no longer follows the finger. Every phone turn is the same set
  curl (curlTo: bottom corner leads, 950 ms), started by a tap — the room
  guide, the menu, Back/Forward — or a quick horizontal swipe (book.js, now for
  all widths: >64 px, mostly sideways, <700 ms). The drag code, the edge
  stretch and the right-edge Home chevron are gone; the curl geometry,
  renderer and tests are unchanged.
- Room guide (book-phone.js, .room-guide): fixed at the foot of the page,
  "‹ previous room · 02 / 05 · next room ›". Numbers follow the page headings
  (Work 01 … Contact 05, Home 00). A forward turn switches it to the page being
  uncovered as soon as the curl is on screen. Colours follow the page (a veil
  of --sky-base on Home, dark on Contact); hidden in a case study. Pages keep
  --guide-h clear at their end (padding-bottom on .work/.method/.about,
  .art-collection, footer).
- Menu: below 760px the menu row is replaced by a three-line button (top
  left) that opens a directory of rooms (00 Home … 05 Contact) over the top of
  the page; the header height never changes (59 px vs 89 px before), so
  opening it moves nothing. Closes on choosing a room, a tap elsewhere, Escape
  or any page change. Desktop header unchanged (89 px, verified).
- First visit on Home: the bottom-corner dog-ear still plays once, now with the
  guide's next room lit.
- Home snapshot is taken on touchstart of a guide button or menu link
  (holdHome), so a tap from Home turns without waiting.
- Verified (headless Chromium 390x844, touch): guide next/prev, menu open /
  outside-tap close / choose room, quick swipe, Back, detail mode hides guide
  and header, desktop 1280 unaffected. Not verified on a physical phone.

## 2026-09-24 — Phone curl v2 (paper roll) and a faster Home snapshot

- The phone no longer uses the desktop mesh. book-phone.js has its own small
  WebGL renderer: a fixed 48x96 mesh folded in the vertex shader around a
  cylinder (radius R ≤ 13% of the width) whose axis lies across the page,
  perpendicular to the drag. The point under the finger is carried exactly to
  the finger (foldFor: dc = (D + πR)/2); past half a turn the page lies back
  face down (paper colour with the print faintly through). Front darkens as it
  turns, back is lit on top, and a soft shadow falls past the roll's crest.
  Starting low (or high) tilts the fold so that corner leads (TILT .18).
  Back: the previous page unrolls in from the left, crest under the finger.
  Menu/Back: bottom corner leads, 950 ms ease-in-out. First-visit hint: a
  dog-ear at the bottom corner. goneAt() gives the travel at which nothing is
  left on screen. tests/book-phone-curl checks: flat at rest, held point lands
  on the finger, no stretching, fully off screen at goneAt.
- Per frame the CPU sends four numbers; no buffer uploads. warm() hands idle
  snapshots to phone.cacheImage() (uploaded without mipmaps: the page rolls,
  it never recedes), so a swipe starts with its texture already on the GPU.
  Measured in headless Chromium: sheet on screen 11 ms after the swipe is
  recognised on a cached page.
- Home snapshot (shared with the desktop): ocean.frame() returns the live
  water canvas; texture() copies it and draws it beneath a see-through SVG
  raster instead of JPEG-encoding it into the SVG. Hero capture went from
  ~180 ms to 5-20 ms in headless Chromium; desktop turn preparation from Home
  1.5-2.6 s -> 41 ms there (software GL, so absolute numbers are pessimistic).
  Snapshot vs live Home: same text-edge difference as before (0.77% of pixels,
  pre-existing), lower mean error (no JPEG artefacts), water identical.
- A touch on Home (page, menu link or hint) freezes the water and uploads a
  fresh Home snapshot at once; the water resumes 400 ms after the finger lifts
  if no turn started.
- Desktop renderer is back to spread-only (the `single` option was removed).
- Not verified on a physical phone.

## 2026-09-24 — Phone code split out (book-phone.js / book-phone.css)

- Everything that only happens below 760px now lives in dist/book-phone.js
  (curl held by the finger, curlTable, slide fallback, Home hint, holdHome,
  phone touch handlers) and dist/book-phone.css (slide + hint styles,
  touch-action). Page layout at phone widths stays in notebook.css.
- book.js keeps the shared engine (snapshots, renderer incl. `single` mode,
  settle/finish, history, warm, desktop arrows, the tablet quick swipe) and
  hands book-phone.js a `core` object: functions plus accessors for values it
  reassigns (pages, ids, current, active, raf, renderer, holdingHome).
  book.js calls phone.turn() from go() on phones and phone.sync() after each
  settle. index.html loads book-phone.js before book.js; if it is missing,
  phones fall back to the desktop turn.
- tests/book-phone-curl.test.cjs checks the finger mapping (monotonic, tEnd).
- Re-verified after the split (headless Chromium, CDP touch): curl and
  no-WebGL slide both pass forward/back/cancel/ends/nav/Back/peek; desktop
  1280x800 riffles as before; 10/10 tests.

## 2026-09-24 — Phones (≤760px): one-page curl, Home hint, Contact taps

- The phone reads the book one page at a time. book.js keeps the desktop
  curl but in renderer option `single`: the spine is the left edge (x = 0)
  and the sheet is the full width; its back is the page colour with the print
  faintly showing through. Forward, the current page curls away and the next
  page is live beneath; back, the previous page curls in over the live current
  page. Only one snapshot per turn (warm() keeps current ±1 on phones).
- The finger holds the sheet's free edge. curlTable() mirrors the mesh
  geometry to find, for each pose, how far right the sheet reaches on screen;
  tEnd is where it has fully passed the spine. Release: past 1/4 or a flick
  commits, otherwise it falls back. Menu, Back/Forward and the hint run the
  same curl (turnCurl, 1100 ms, 2 held frames).
- Home: a touch stops the water and snapshots Home at once (holdHome), so the
  curl appears as soon as the swipe is recognised (measured 91 ms after
  touchstart in headless Chromium, against ~1.6 s when the snapshot was taken
  at recognition). tests/ocean-state covers the hold.
- Fallback: if a snapshot/WebGL fails, curlBroken switches phones to the live
  slide (beginSlide: next page laid over from the right, shadow + dim), also
  used for reduced motion drags. Ends of the book stretch and spring back.
- Home hint (hintApi): desktop chevron at 30% on Home only; first visit lifts
  Home's edge 34 px with the label lit (localStorage jm.swipeHint.seen);
  hidden after the first turn. Tap turns.
- Contact: sun times are tap-to-reveal on touch (pointerType-aware; mouse
  hover unchanged). Link arrows are an inline SVG (.link-arrow), not "↗".
- Verified in headless Chromium 390x844 with CDP touch: forward/back drags,
  cancel, nav, Back, peek; desktop 1280x800 still riffles (sheets: 2).
  Not verified on a physical iPhone.

## 2026-09-24 — Deployment setup (GitHub Pages)

- This file moved from dist/HANDOFF.md to docs/HANDOFF.md so the public site
  does not serve it. dist/ is exactly what gets published.
- Target: github.com/jumooon/jumooon.github.io -> https://jumooon.github.io/.
  .github/workflows/pages.yml runs tests/*.cjs, then uploads dist/ with
  actions/upload-pages-artifact@v3 and deploy-pages@v5 (versions from the
  current GitHub starter workflow). Pages source must be set to GitHub Actions.
- .gitignore keeps _unused/, .openai/ and .DS_Store local.
- History: the old single commit (626b4e8, 2026-09-16) contained
  dist/jiung-ai-enhanced.png, dist/pacific-horizon.png and .openai/hosting.json.
  It is kept on the local branch `archive-2026-09-16`; `main` starts fresh and
  only `main` is pushed. A stale .git/index.lock dated 2026-09-17 15:18 blocked
  git; it was moved to _unused/git-stale/.
- Final check before deploying: 9/9 tests, all JS parses, content.json valid,
  43 local references resolve with exact filename case (Pages is
  case-sensitive), 28 fetched without 404, six pages and seven case studies
  walked with no site errors, all external links https, largest file 19.9 MB.

## 2026-09-24 — History (Back/Forward) and page arrows

- History (book.js): menu clicks, arrows, keys and swipes go through
  navigate(), which pushes {page} with #<id>; popstate replays the turn (go()).
  book.js relays each popstate as `book:history` first, and work-preview.js
  closes/opens the case study before the book turns (a case study still never
  turns directly). Opening a case pushes {page:'work', case} with #work/<id>;
  "All work" = history.back(), except on a case the visitor landed on by link
  (state.landing, set by book.js's initial replaceState), where it replaces the
  entry with #work instead of leaving the site. #work/<id> links open the case.
  Verified with real clicks: Work->Method->About, Back x2, Forward (turns);
  case open, Back, Forward, All work, Forward, Back; deep link + All work.
  Note: synthetic (script) clicks create entries Chrome skips on Back, and the
  preview tab's history.length is capped at 50 — test with real input.
- Page arrows (book.js builds nav.page-arrows outside the book, so they are not
  in snapshots; CSS in notebook.css): hairline chevrons at the side edges,
  invisible and click-through until the pointer is within 96 px of that edge
  (then 30%), lit on hover/focus with the neighbour's name and a radial light
  (--arrow-light; on Hero --sky-glow from ocean.js: moonlight at night, warm
  paper-light by day). Press swells the light; ArrowLeft/Right flash the side
  and turn (ignored in inputs, the collection wall and embeds); horizontal
  swipe on touch. Hidden in case studies, below 760 px and on hover:none
  screens. Right arrow sits 16 px in to clear the sheet scrollbar.
- Tags: book.js 20260924-arrows2, work-preview.js 20260924-history2,
  notebook.css 20260924-arrows3, ocean.js 20260924-arrows. 9/9 tests pass.

## 2026-09-24 — Hero text no longer goes grey at dusk/dawn

- Checked with a faked clock (San Diego, 2026-09-25 02:10Z, Sun -6.05 deg): the
  name was rgb(131,147,157) on a header base of rgb(124,113,99), nav and cities
  nearly invisible. Cause: ocean.js interpolated the text colours with the sky
  (AMBER.ink -> NIGHT.ink across dusk), so text passed through grey exactly as
  the sky did. Computed contrast bottomed at 1.53:1 (ink), 1.48 (muted), 1.20
  (faint) between Sun -4 and -7 deg, ~12 minutes each evening and morning.
- Now: two ink sets (dark = day->AMBER by sunset, light = NIGHT), chosen by the
  header base luminance (switch at 0.22 with hysteresis 0.19/0.25), cross-faded
  over 600 ms while the hero runs. Near the crossover the muted/faint tiers are
  drawn toward the main ink, and a soft halo of the opposite tone
  (--sky-halo, text-shadow on .hero-introduction and the hero header) fades in;
  it is transparent otherwise. Worst-case contrast over a whole evening now
  3.32 (ink) / 2.33 / 1.66 before the halo, vs 1.53 / 1.48 / 1.20. Day and night
  colours are unchanged (verified: 20:00Z day and 03:30Z night values equal the
  old ones). book.js copies --sky-halo into snapshots.
- Also found: turns do not touch the URL or history (history.length and
  location.hash unchanged after three turns and a case study), and nothing
  listens to popstate/hashchange — why Back/Forward do nothing inside the site.
- Tags: ocean.js 20260924-ink2, notebook.css / book.js 20260924-ink.

## 2026-09-24 — Collection jump fixed; turns a little slower

- Owner confirmed the snapshot-zoom fix solved the "page sits high" glitch. The
  A/B files (index-0135.html and its *-0135 assets) moved to _unused/ab/.
- Collection jump: a difference-blend overlay of the scrolled Collection
  snapshot on the live page showed two things: the wall's native scrollbar
  thumb at the start in the snapshot (it cannot carry a scroll position) versus
  mid-track live, and faint differences on the resized artwork. Fixes:
  the native scrollbar is hidden and replaced by `.collection-bar` /
  `.collection-thumb` (new collection.js: mirrors scroll, drag the thumb, press
  the track to jump; keyboard/trackpad scrolling unchanged), which the snapshot
  copies like any element; embeddedImage() now inlines the original file when it
  is within 2x of the displayed size, so the browser scales the same pixels on
  both sides. After: the overlay is completely black with the wall scrolled.
- Follow-up: the bar vanished during turns into Collection. While a sheet is
  hidden every size reads 0, the ResizeObserver fired, and update() set
  bar.hidden. update() now does nothing unless the wall is laid out, and
  texture() calls window.syncCollectionBar() while it has the sheet un-hidden,
  so a never-shown Collection also gets its thumb. Verified per frame: bar never
  hidden during a turn in, and the difference overlay of the snapshot taken
  while hidden is black (scrolled wall, and first visit from About).
  collection.js 20260924-bar2, book.js 20260924-pace2.
- TURN_DURATION 1650 -> 1850 (single turn 1485 -> 1685 ms of motion); riffle
  sheets scale by the same factor. tests/book-timing expects 1850.
- Tags: book.js 20260924-pace, notebook.css / collection.js 20260924-bar.
  9/9 tests pass.

## 2026-09-24 — ROOT CAUSE of "the turning page sits slightly high": 1x layout snapping

- An SVG <foreignObject> image is laid out and pixel-snapped on a 1x CSS-pixel
  grid, even when drawn at 2x. Measured with probe boxes: top 10.25 / 10.5 /
  30.3 / 50.6 px landed on device rows 20 / 22 / 60 / 102, i.e. snapped to whole
  CSS px, while the live page snaps to device pixels. Anything at a fractional
  y moved up to 1 device px. The Work dashboard is live at y 642.461 (device
  1284.9 -> 1285) but was rastered at 642 (device 1284): the turning sheet sat
  1 px high and dropped back at handoff — the owner's screenshots show exactly
  that (~1-1.5 device px across the spine).
- Fix in texture(): the wrapper gets `zoom: <raster scale>` and the SVG is
  cw x ch device px, drawn 1:1, so the snapshot is laid out on the device grid.
  Because the SVG viewport is now device-sized, snapshotCss() flattens @media
  blocks with this document's matchMedia() and rewrites vw/vh/vmin/vmax (and
  d/s/l variants) as px from innerWidth/innerHeight; the wrapper also carries
  --book-header-height (previously fell back to 89px inside snapshots).
- Verified: a live page with its own snapshot overlaid in mix-blend-mode:
  difference is completely black for Work and Method (before: outlines on every
  text edge and doubled dashboard rules). At 1920x895 the dashboard border moved
  from rows ~1302-1305.5 (old) to 1303-1306, the live device grid.
- A/B files left for the owner: index-0135.html loads the 01:35 book/CSS/preview
  (book-0135.js, notebook-0135.css, work-exhibition-0135.css,
  work-preview-0135.js, content-0135.js). Move them to _unused/ once confirmed.
- book.js 20260924-zoom; 9/9 tests pass.

## 2026-09-24 — The real arrival glitch: snapshot resolution cap

- Owner's screenshots (3840x1790, i.e. a 1920x895 window at 2x), taken during
  forward turns to Work and to Method: the left half (the landing sheet, canvas)
  is soft — 99.5th-percentile edge gradient 48-96 vs 118-171 on the live right
  half — and horizontal lines crossing the spine sit ~1-1.5 device px lower on
  the live side (row-profile fit over the divider, mat edge and dashboard rules).
  At arrival the canvas is removed and the half snaps sharp and shifts: "Work's
  left side rises then settles", "Customers / Frequency grow then shrink".
- Cause: rasterScale() capped snapshots at 4.8 MP. 1920x895 fell to 1.67x, so
  the raster was upscaled 1.2x and its pixel grid no longer matched the live
  page's. Windows under the cap (e.g. 736x900, 1440x800) render at exactly 2x,
  which is why every earlier check in the narrow preview looked aligned, and why
  it appeared "suddenly" in a full-width window.
- Fix: rasterScale = min(dpr, 2, 4096/max side). GPU texture budget 128 -> 256 MB
  (a 1920x895 page is ~37 MB mipmapped). Measured at 1920x895: overlay canvas
  3840x1790; 10 Work<->Method turns, prep 4-12 ms, 7 with maxGap 9 ms, three with
  one 17-42 ms frame, the first turn after load 92 ms (first GPU allocation).
- The two earlier landing changes (depth/twist fold, x-only perspective) stay;
  they removed a real, separate overshoot but were not what the owner was seeing.
- tests/book-raster.test.cjs updated to the new policy. 9/9 pass. book.js tag
  20260924-native.

## 2026-09-24 — Landing overshoot removed ("arrives, drifts, then settles")

- Symptom (owner): on arrival the page moved slightly and then re-aligned, in
  both directions. Checked first and ruled out: the live destination does not
  move (Method title rect logged every frame: constant 221.2 px, scrollTop 0);
  the Work and Method snapshots line up with the live pages (50% overlays of the
  ?book-debug snapshots show no doubled text).
- Cause: the mesh. Near the end of a pose the landing sheet still had depth
  (~100 px toward the viewer at 84%), which perspective renders as magnification,
  so the sheet was drawn past its own final edge and then pulled back, with the
  top edge up to 17 px high. Measured by running the real paint() from book.js
  against a mocked GL context: far-edge overshoot 1.2 px at 736 wide, 8.4 px at
  1440, 10.1 px at 1728, 14.9 px at 2560 — invisible in a narrow window, obvious
  on a laptop screen.
- Fix 1 (landing): in paint(), depth (z) and the corner twist are multiplied by
  `land`, easing 1 -> 0 over poses 0.5-1.0 (smoothstep).
- Fix 2 (reported after fix 1: "Work's left side rises and falls; Method's
  Customers/Frequency grow and shrink"): frames captured from the real turn
  (preserveDrawingBuffer forced via a getContext hook, clock driven by a wrapped
  requestAnimationFrame, 1440x860) showed the landing Work sheet's dashboard
  border 10.6 px low at 61% of the turn, 2-6 px at 74%, correct only from 84%.
  That was perspective enlarging the whole lifted sheet, not the edge overshoot.
  The vertex shader now applies perspective to x only (y pre-multiplied by
  depth), so a sheet never changes height. Same capture after: the border is at
  its final 651.2 px in every frame from 61% to the end.
- book.js tag 20260924-landing2; 9/9 tests pass.

## 2026-09-24 — Unused files moved out; Work/Method turn start smoothed

- Moved (not deleted) to `personal blog/_unused/`, same relative paths: the
  preview pages (contact-preview*, layout-preview.*, sun-preview.*,
  work-preview.html/.css), exhibits/apple.png, exhibits/carbon.png,
  exhibits/research-map.pdf (33 MB), and the root jiung-ai-enhanced.png. None
  was referenced by index.html or any live script/style/json. dist 57 MB -> 29 MB.
  work-preview.js lost its standalone-page path (loader, window scroll, hashchange,
  document.title) since work-preview.html is gone; mountWorkExhibition(data).
- Measured Work<->Method in the Browser pane while it was visible (120 Hz):
  at 736x900 every turn ran 8.3 ms frames (maxGap 9). At 1728x1000 @2x the first
  moving frames sometimes took 17-50 ms with NO main-thread long task, i.e. the
  browser was laying out/rasterising the heavy destination sheet (or sampling a
  fresh texture) as motion began.
  FIX: riffle() holds pose 0 for two frames (settleFrames) after un-hiding the
  destination, drawing the first moving sheet at pose 0 as well so both of its
  textures are sampled once. Pixel-identical to the flat sheet, ~17 ms added
  latency at 120 Hz. After the first half of the change: 4 of 6 turns maxGap 9,
  one 50 ms, one 17 ms; the texture pre-sample was added after that and could not
  be measured — the pane became hidden (visibilityState 'hidden').
- Warm-up passes after a scroll caused 52-57 ms long tasks. Two causes fixed:
  the Work demo video was copied at 1920x1019 and JPEG-encoded synchronously on
  every Work snapshot (28.5 ms) even far off screen — now only when in view and
  at display size; embeddedImage() resizes with createImageBitmap(resize*) and
  encodes with OffscreenCanvas.convertToBlob (async) where available.
- preparePageImages() waits at most 400 ms for decode(): decode only settles
  when the page renders, and an unrendered tab left a click stuck (aria-busy)
  forever in testing.
- tests/book-handoff.test.cjs updated for the two held frames. 9/9 pass.
- Tags: book.js 20260924-smooth3; content.js, work-preview.js 20260924-smooth2.

## 2026-09-24 — Audit: case-study reading mode kept, turn stutter causes, cleanup

- DESIGN (the owner's, do not undo): a case study opened from Work is a separate
  reading mode, not a book page. No menu (`body.work-detail-open` hides
  `.site-header` and makes it inert), no page turn (book.js go() returns while
  detailOpen()), and "← All work" is the only way back. An earlier pass today
  removed this by mistake; it is restored.
- Turn stutter on Work — causes measured and fixed (all apply to the overview):
  1. preparePageImages() decoded every img in the sheet, including off-screen
     ones whose decoded pixels Chrome had dropped: 88-91 ms before the sheet
     moved. Now only images in the sheet's visible window: 6-11 ms.
  2. texture() inlined every img as a data URL: a 3.68 MB SVG, 56 ms to decode,
     70-125 ms long tasks to fetch/resize/re-encode. Off-window images are now a
     1px GIF held at their exact border-box size: ~245-565 KB, 7-8 ms. Checked
     by overlaying the ?book-debug snapshot on the live page (Work scrolled,
     Collection wall scrolled): positions match.
  3. A scroll deleted the sheet's snapshot and never re-warmed: 81-101 ms on the
     next turn. Scroll (sheet and collection wall) now schedules a warm: 4 ms.
     A warm request during a running pass sets `rewarm` instead of being lost.
  4. Opening a case study cleared EVERY page's snapshot, so the first turns after
     All work rasterised on the click. Now only Work's is dropped; measured
     work>method 6 ms right after All work.
- Frame pacing could not be measured: the Browser pane is hidden and throttles
  to ~1 fps (1000 ms rAF gaps on plain pages; img.decode() stalled 40 s until a
  screenshot woke it). Treat maxGapMs from this session as meaningless.
- Embeds: the live frame is created only above 760px; below that only the
  screenshot is created (before: frame loaded and hidden by CSS, poster
  downloaded on desktop and never shown). The page-turn poster machinery
  (.paper-snapshot embed rules, hidden poster) is gone because a case study is
  never rasterised. Tableau toolbar 'hidden' (it raised scrollbars). fitTableau's
  ResizeObserver disconnects after the case closes.
- Tableau runtime (~330 KB third-party JS) now loads when the Work sheet has
  settled as the current page (watched via aria-hidden, so not mid-turn) and not
  on narrow screens; before, every visit fetched it at idle, even on Home.
- Dead code removed: content.js legacy Work renderers (renderCase and the
  pre-exhibition list, ~5.5 KB) and their notebook.css rules (.case*, .work-case*,
  .work-group*, .work-index-heading/link/number, .timeline-step, .metric, .tags;
  ~6.5 KB). content.json is fetched with cache:'no-cache' (revalidated) instead
  of 'no-store'.
- book.js: the snapshot stylesheet text is built once (rebuilt only if the
  number of sheets changes); the data-URL image cache is LRU-bounded to 24 and
  forgets failed fetches.
- Unreferenced files left in place for the owner to decide: exhibits/apple.png,
  exhibits/carbon.png, exhibits/research-map.pdf (33 MB).
- Tags: book.js, content.js, notebook.css, work-exhibition.css 20260924-audit;
  work-preview.js 20260924-audit2. All 9 tests pass.

## 2026-09-24 — Work detail pages embed the live dashboards

- Three embeds, all shown only on a detail page and built only by renderDetail,
  so nothing is requested until that case is opened:
  investment and apple-warranty (Tableau Public), environment (shinyapps.io).
- Tableau Public REFUSES to be framed directly — Chrome shows "public.tableau.com
  refused to connect". The iframe form in Tableau's help is for Server and Cloud;
  carrying it over to Public was wrong. The supported route is the Embedding API
  v3 web component, `<tableau-viz>`, which builds its own frame;
  `tableau.embedding.3.latest.min.js` is injected as type="module" on the first
  embed render (verified: absent on load and on the Work list, exactly one tag
  after opening both Tableau cases).
- shinyapps.io DOES serve inside a frame — verified in Chrome on the real page,
  the deck renders and the URL hash lands straight on slide 9/19. So the
  environment case uses a plain iframe. `embedType` picks the path: 'tableau' or
  'frame'.
- FIT: a Tableau dashboard is authored at a fixed size. Both of these report
  {behavior:'exactly', 1000x800}, so in a 934px column the right edge and the
  bottom were simply cut off. fitTableau() waits for `firstinteractive`, reads
  workbook.activeSheet.size, gives the stage that aspect-ratio, sets the viz to
  its native px size and scales it from the top-left to the stage width, with a
  ResizeObserver keeping it right. Measured after the fix on both Tableau cases:
  left gap 0, right gap 0, bottom gap 0, transform scale(0.934), stage ratio
  1000/800. A dashboard sized 'automatic' reports no fixed size and is left alone.
  Note it can take several seconds after firstinteractive before the viz paints;
  the stage sits empty grey until then, and a shinyapps.io app on the free tier
  may cold-start for ~10s.
- The "Explore dashboard ↗" link is gone wherever the thing itself is embedded
  (`asset.link && !asset.embed`), in both the detail gallery and the overview
  row. Cases whose link is a PDF or video keep theirs.
- MEASURED, and the reason the screenshot is still in the DOM: a frame is not
  captured by the SVG foreignObject rasterisation texture() uses — rasterising a
  clone containing one drops it completely, border and content alike, while
  ordinary DOM beside it comes through. `.embed-stage` stacks the screenshot
  under the embed; `.paper-snapshot` hides the embed and reveals the poster,
  which book.js inlines through embeddedImage() like any other img. The poster is
  `visibility: hidden`, never `display: none`, because embeddedImage() sizes from
  the live element's clientWidth/clientHeight and a display:none poster would
  measure 0.
- Below 760px every embed is hidden and the poster shown: none of these are
  usable at that width.
- NOT verified: the finished turning sheet. Page turns do not run in the headless
  sandbox (is-page-turning never goes true, data-last-turn stays unset), so the
  snapshot swap is confirmed up to the rasterisation step, not as a moving sheet.
- Privacy note: an embedded Tableau Public view connects the visitor to Tableau's
  servers, and that page carries Google Tag Manager.

## 2026-09-24 — Contact: sunrise and sunset replace "Let's talk."

- `contact-sun.js` (new) draws the block into `#contact-sun`, where the
  `<h2 id="contact-heading">` used to be. `contact.heading` is deleted from
  content.json and renderContact no longer looks for the element; the string and
  the id are gone from index.html, content.js and content.json.
- Data comes from `window.CitySunTimes`, already published by sun-times.js, which
  recomputes at each city's own local midnight and re-checks on visibilitychange
  and pageshow. contact-sun.js adds no timer; it redraws on `sun-times:update`
  and `pageshow`. This is the first consumer sun-times.js has had since it landed
  on 2026-09-18.
- The block is four numerals at rest and nothing else. Meaning is carried by
  position: columns are the cities in the order sun-times.js returns them (Busan,
  San Diego) — the same order the hero buttons and the footer note print, and the
  footer note is the only thing on screen that names them — and rows are sunrise
  then sunset. Pointing at a numeral turns it white and fades in the city above
  and the event to its left (.35s ease, matching .place-detail). Label cells hold
  their space while transparent, so revealing the words moves nothing, the same
  reason the nav carries an invisible bold copy of each item.
- Because nothing is named by default: every `<time>` carries an aria-label
  ("San Diego sunset 18:43"), the block is focusable, the labels are
  aria-hidden, and below 760px the words are simply always on, since a touch
  screen has no hover.
- `.paper-snapshot` forces the resting state, so a turn started mid-fade does not
  bake a half-lit label into the texture.
- book.js gains `document.addEventListener('sun:changed', …)` dropping the
  Contact texture, in the same pattern as `work:changed`. Without it the cached
  sheet would keep yesterday's numbers after local midnight, since nothing in the
  texture key tracks the date.
- Regression: `node tests/contact-sun.test.cjs` — grid shape, column order
  checked against the footer note, aria labels on all four numerals, the
  sun:changed hook on both sides, and the heading gone from all three files. All
  nine tests pass. Verified in Chromium on the real page: hovering San Diego's
  sunset sets data-col=1/data-row=1, exactly two labels reach opacity 1 and only
  that numeral turns #fff. No visual QA on other browsers or on real touch
  hardware, and no deployment.
- `sun-preview.html/css/js` are the discarded rounds, kept for reference; nothing
  links to them.

## 2026-09-22 — Portfolio content curation

- Work now uses `content.json > work.groups`: Experience (Aperiohub,
  Associated Students, UCSD Economics) and Projects (Apple Warranty, Marketing
  Mix, Email Auto Generator, MediRoute). Every case has Context, Challenge,
  Contribution, Outcome, Reflection. User explicitly requested all seven items.
- `content.js` renders a two-column index and complete, always-expanded narratives.
  Index/back links scroll within Work and focus their destination; they do not
  register additional book sheets. New CSS uses classes (not IDs), so snapshot
  clones retain styling when book.js strips IDs. No additional page images.
- Investment follow-up: +7.1% simulated price return, Aug 21–Sep 22, 2026,
  $50M to approximately $53.55M. This is based on close prices and chart-estimated
  weights, NOT verified executed holdings. Narrative states assumptions and
  distinguishes résumé's internship-period +1.28% / 31 bps. Do not conflate
  either with the separate historical backtest or claim realized investment gains.
- Reflections use the user's investment delegation story and analytical limits
  elsewhere; remaining personal lessons should be refined with the owner.
  No invented customer wait-time reduction, prediction accuracy, campaign lift,
  or hospital adoption. Apple/marketing are labeled analytics projects, not
  employment at Apple or commissioned client work.
- About connects Business Economics and the Business Analytics minor, followed
  by applied SQL/Python/dashboard work and a short personal-interest sentence.
  Method now includes hypotheses, anomalies, historical tests and uncertainty.
- All existing ocean/turn timing/cache behavior preserved. Mobile nav links use
  block rather than inline-flex, keeping the invisible bold width-reservation
  pseudo-element above the label rather than alongside it.
- Validation: JavaScript syntax, 7 unique cases with all five narrative fields,
  local entrypoint references, diff whitespace, and existing 8 regression tests
  pass. Local server returns HTTP 200. No browser visual/performance QA was run
  in this turn. No deployment performed.

Canonical local source: /Users/moonjiung/Documents/ChatGPT/personal blog/dist/

## Current implementation
- sun-times.js is a data-only daily sunrise/sunset provider, loaded after the
  bundled Astronomy Engine. No UI or external API. window.CitySunTimes.getSnapshot()
  returns each city's own civil date, timezone, UTC/local sunrise/sunset and
  daylightSeconds. SearchRiseSet includes solar-disc/refraction conventions,
  unlike the visual shader's solar-centre thresholds. Assumes 10m elevation,
  ideal horizon; terrain/weather are not modelled. Per-city date caching and
  local-midnight timers (DST-aware) refresh while open, and visibility/pageshow
  refresh after sleep/return. A closed site runs no background job; next load
  calculates current dates. sun-times:update emits changes. No page placement
  chosen. Regression: node tests/sun-times.test.cjs.
- City clocks now format current Date independently of sky:update timestamps.
  Cached Intl formatters use Asia/Seoul and America/Los_Angeles. A lightweight
  timeout aligns each update to the next wall-clock minute; visibility/pageshow
  and page settle refresh immediately. Hidden tabs suspend the timer but recover
  from wall time, not an accumulated counter. Hero snapshot keys include the
  clock minute without invalidating other pages. Sky recompute stays 30 seconds.
  Regression: node tests/city-clock.test.cjs.
- 20260918-about-ready: await image decode for every page in the turn batch
  before snapshot/animation, including the live About portrait. Defer post-settle
  warming from 160ms to 900ms and requestIdleCallback when supported; image-load
  and resize callbacks use the same scheduling. Cancel the timer on navigation.
  Pin the active GPU image batch until finish, so cache misses cannot evict a
  sheet being used by the turn. Raster cap is 4.8M instead of 6M pixels to fit
  five RGBA pages INCLUDING 4/3 mipmap overhead inside 128 MiB. Native DPR 2
  remains unchanged for the tested 854x773 viewport. lastTurn now records
  uploadsDuringMotion for verification. Header layer fix is unchanged. These
  remove known preparation/eviction risks; they do not prove all frame jitter
  on this device has disappeared. Regression: book-image-ready.test.cjs.
- Menu type was raised to 1rem (20260918-nav16) and reverted the same day; the
  stylesheet, index.html and layout-preview.html are byte-identical to their
  pre-nav16 state and the tag stays 20260918-sheet-layer. Recorded so it is not
  retried: 0.875rem is deliberate, because the nav still has items to gain and
  four 16px labels already ran from x=974 to x=1260 at 1440px. The measurements
  taken then are still good — the invisible bold ::before reserves width at 16px
  too (0.00px shift at 1440 and 1024), so size is not what constrains this row.
  Separately, two PRE-EXISTING mobile defects were confirmed against the unchanged
  stylesheet and remain open: at <=760px a weight change shifts the wrapped row by
  9.24px (space-between redistributes), and at 360px the nav overflows
  horizontally (scrollWidth 381 vs 360, Contact clipped). Both matter more once
  the menu grows.
- 20260918-sheet-layer: retain full header+content snapshots and curling motion,
  but mount .paper-turn directly under body as a fixed z-index:10 overlay.
  Remove the book's transition-only z-index:6. Previously the full-bleed live
  Hero inside that elevated book covered the live header (z-index:5), even after
  the destination raster halves were skipped; the header appeared only when
  finish() removed the book class. Now live book < live header < moving sheet
  stays constant for the whole turn. The top rule remains z-index:20. No About
  image, timing, cache, or ocean changes in this revision. Handoff regression
  checks the body-level overlay host in both directions.
- 20260918-curl: 20260918-header is reverted. Lifting the header above the turn
  removed the arrival re-render, but it also froze the top bar: for the whole turn
  the band stood still, empty, while the page slid underneath, and it took the
  destination's styling from the first frame (so turning back to Home the bar went
  transparent immediately and floated over the moving white sheets). The owner
  reported that, and it is the worse of the two.
  So the header is part of each page's image again: z-index 5, under .paper-turn,
  and texture() rebuilds the headerClone. The bar now travels with the sheet and
  skews with it.
  The two cannot both be had. A live DOM header cannot be bent onto the curling
  mesh, so either it is rasterised — and switches from texture back to live text
  when the turn lands, which is the "menu row refreshes once" — or it stands still.
  If the re-render turns out to bother more than the frozen bar, the revert is
  just this entry read backwards.
  Kept from that work, because they are independent: .top-rule stays out of the
  snapshots (the 3px rule is identical on every page, so it loses nothing by being
  live, and it no longer blurs), and header.inert is still gone.
- 20260918-weight: the current page is now marked with bold as well as colour,
  without the row moving. Each menu item (and Home) carries an invisible bold copy
  of its own label in ::before — content: attr(data-label), display:block,
  height:0, overflow:hidden — so the item is always laid out at its bold width and
  switching weight changes nothing but the ink. The visible text is centred inside
  that width so it does not drift either. content.js writes data-label alongside
  the text for both the brand and the links. .brand had to become inline-block:
  inside the old inline-flex the ::before would have sat beside the text instead of
  stacking above it.
  Cost, paid once and constant: every item is a couple of pixels wider than its
  regular-weight text (Home 37.4 -> 38.9, Work 32.4 -> 34.8).
  Verified by recording every item's box on every frame across a turn: Home goes
  400 -> 700 and muted -> ink while its rect stays [180, 22.8, 38.9, 46.4], and
  every item's width is identical between the Home page and the About page.
  This replaces the old rule that selection could only be a colour.
- 20260918-header: the brand is now a Home link, and the menu no longer
  re-renders on arrival.
  (1) content.json nav.brand.label is "Home". .brand takes the menu's typography
  (0.875rem, weight 400, the same 12px padding) instead of the old 1.35rem bold
  wordmark, and it indicates its own page the way the other items do — by colour
  only, never weight, because nothing in that row may change glyph metrics. It is
  muted on every page and darkens on Home: --sky-muted/--sky-ink over the sky,
  #b7ced8/#fff on Contact, --muted/#102d3c on the paper pages.
  (2) The reported "menu row refreshes once when returning home" was real and had
  two layers. Measured by recording every nav element's box, colour and weight on
  every animation frame across a turn: the geometry never moved, but the colours
  did. header.inert during the turn took the menu out of hit-testing, so the link
  under the cursor lost :hover and regained it at settle; and, more fundamentally,
  .book.is-page-turning (z-index 6) covered the header (5), so for the whole turn
  the menu was a GPU texture of itself and became live text again on arrival —
  the same defect class as the 3px rule, measured at up to 107/255 across the
  link row.
  Fix: header.inert is gone (clicks during a turn were never blocked by it
  anyway — go() queues them), the header sits at z-index 12, above .paper-turn,
  and texture() no longer builds or appends a headerClone. This is safe because
  updateHeader(state.target) already commits the destination's header before
  motion begins, so the live header is correct for the entire turn; it was only
  ever hidden. Snapshots are a little cheaper as a result.
  Visual consequence, on purpose: the header no longer curls away with the page.
  The sheet turns beneath a header that is already showing the destination.
  Verified: hover survives a whole turn, the only colour change is Home going
  active at turn start, and a mid-turn frame is pixel-identical to the settled
  one across the header band.
- 20260918-rule: the top strip popped at the start of every turn. The 3px
  signal rule was drawn by .site-header, so it became part of each rasterised
  sheet — and the raster softened it. Measured live against the first turning
  frame, the top three rows read 88,88,88 live and 138,151,163 in the raster at
  every viewport size: the line went pale and blurred for the whole turn, then
  snapped back at settle.
  It is now its own fixed element (.top-rule) at z-index 20, above .paper-turn
  (10), and the header keeps a transparent 3px border so nothing in the layout
  moves. The rule is identical on every page, so keeping it out of the snapshots
  costs nothing. After the change the top three rows differ by 0 and rows 3-20 by
  at most 3/255. What remains at y~52 is nav-link text antialiasing, which the
  design has always rasterised.
- Music switched off at the owner's request. content.json music.tracks now carry
  disabledUri instead of uri; trackFor() finds nothing playable, so the control
  and the card hide themselves and the Spotify API is never fetched. No code was
  removed — renaming disabledUri back to uri turns it on again. Note the measured
  position: the music was not the cost. With it playing the hero held 120 fps with
  zero frames over 20 ms, identical to silence; the stutter was the snapshot PNG
  and the cache key (see 20260918-snapshot).
- 20260918-snapshot (the stutter): reported as occasional jumps and slower
  rendering, suspected to be the music. Measured on the Mac, it was not: the hero
  alone runs 120 fps (median 8.3 ms, zero frames over 20 ms) at both 818x901 and
  2560x1440 with the full 4M pixel budget, and with Spotify playing the numbers
  are identical — the embed costs two frames over 20 ms while it loads and
  nothing afterwards.
  The cost was in the page-turn snapshot, and the full-screen sky is what made it
  bite. ocean.snapshot() encoded the water canvas as PNG; at 2560x1440 that is a
  4M-pixel canvas producing a 1.6 MB data URL in ~50 ms, which then had to be
  URI-encoded and decoded again inside the snapshot SVG. It is now JPEG at
  quality .92 — ~212 KB and ~33 ms — which is safe because the GL context is
  opaque (alpha:false) and nothing in that frame needs transparency.
  Measured A/B in one session at 2560x1440, forcing the PNG path back on:
  preparation 447/246 ms with PNG against 132/89 ms with JPEG, and the worst
  frame gap 100 ms (2 frames over 25 ms) against 18 ms (none). That 100 ms freeze
  at the start of a turn is the reported jump.
  Second cause, same symptom: the texture cache key folded in ocean.skyKey for
  every page, and skyKey is city@minute — so the whole cache expired every minute
  and the next turn paid the cold path. Only the page that draws the sky depends
  on it, so the key now takes skyKey only when the source contains .ocean-surface.
  The city click no longer calls cache.clear() either; skyKey carries the city, so
  the hero's entry expires on its own and the other pages keep theirs.
  Not changed, but worth knowing: at 2560x1440 the sky renders at an effective
  DPR of 1.04 because of the 4M budget, so it is softer on a Retina display than
  it was as a small strip. Raising the budget costs fill rate, not frame rate,
  at least on this machine.
- 20260918-inline: the music control moved out of the menu and into the hero,
  on its own line under the city line and directly above the card it opens, so
  the two read as one thing (pressing top-right to open something bottom-left was
  the awkwardness). The menu is text links again, and the Contact-page override
  for .player-button is gone with it.
  The circle is 28px, matching the 28px line box of the city line (1rem / 1.75)
  instead of the 34px it was; icons 12px, bars 5/9/7. It is smaller than a
  comfortable touch target, so .player-button::after extends the hit area to 44px
  invisibly rather than drawing a bigger button.
  The card is 280x80, which is measured to be Spotify's floor: at 274px wide or
  72px tall the embed's own layout overflows and it draws scrollbars. The mobile
  max-width:100% override is dropped so the card is the same size everywhere (the
  narrowest shell at a 320px viewport is 288px, still clear of 280).
  theme:'dark' is now passed as a createController option, Spotify's documented
  way, instead of appending ?theme=0 to the URL by hand — and it survives
  loadEntity, which appends ?theme=0 to the new embed URL itself (verified).
  There is no transparent theme; a Spotify engineer states on their forum that
  the option takes 'dark' only. Faking one with mix-blend-mode or opacity would
  alter how the player renders, which their terms forbid, so it is not done.
  Verified on the Mac: circle 28x28 against a 28px city line, zero Spotify
  requests before the first press, card 280x80 on open with the phase's track
  playing, control no longer in the nav.
- 20260918-reveal: the Spotify card is a disclosure, not a fixture. The owner
  found a permanently visible card too heavy for the hero, and Spotify's terms
  rule out shrinking or restyling it — so what changed is whether it is shown at
  all, which is ours to decide. The circular control is back in the menu
  (#player-toggle): pressing it opens the card under the city line and starts the
  track, pressing again pauses and collapses it. .hero-music animates max-height
  0 -> 96px with opacity; .is-open is the only state. aria-expanded tracks the
  disclosure, aria-pressed the playback.
  The player is built on that first press, and the iFrame API script is injected
  then too (index.html no longer loads it; it only parks the ready callback). A
  visitor who never asks for music makes zero requests to Spotify — measured:
  no spotify resource entries before the click, three after. The embed uses the
  URL form with ?theme=0, Spotify's dark card, which sits better on the night sky
  than the artwork-tinted default; loadEntity preserves that query string. Width
  is capped at 340 px (240 px was tried and clips, showing a scrollbar).
  Verified on the Mac: closed state has no iframe and the correct track title on
  the control; opening loads the phase's track and plays; a page turn with the
  card open keeps the iframe and playback (Hero -> About 391 frames, back 405,
  no overlay left); closing pauses and collapses. NOTE for future debugging: the
  Claude browser pane runs as a background tab, and Chrome freezes CSS
  transitions there — max-height stays at its start value and the card looks
  stuck shut. Removing the transition proves the cascade is fine; it is not a bug.
- 20260918-boot (race fix, affects every cold load): content.js dispatches
  content:rendered as soon as content.json comes back, but book.js is the last
  deferred script and now sits behind astronomy.browser.min.js and stars.js
  (~163 KB). On a cold cache the fetch wins that race, the event fires before
  book.js has downloaded, and nothing is listening — so player.configure() never
  ran and the Spotify card stayed hidden for good. It was invisible before the
  music work only because book.js also settles the book on its own; the lost
  event cost the music config, the eager image hints and the initial
  refreshPages/settle pass. content.js now sets window.CONTENT_RENDERED = true
  just before dispatching, and book.js wraps that handler in applyContent() with
  a once-guard, registers it, and calls it immediately when the flag is already
  set. Whichever side arrives second runs it, exactly once.
  Found by checking img.loading on a live page: the "handler ran" evidence turned
  out to be from a manual dispatch during debugging, not from load.
  Verified on the Mac (Safari-class network, real Spotify): card visible on a
  cold load with the night track, Hero -> About -> Hero at 403/405 frames,
  max gap 17/9 ms, zero frames over 25 ms, no overlay or snapshot left behind,
  and the embed iframe survives the turn without reloading.
- 20260918-tracks: the three tracks are set and the hero's call-to-action is gone.
  content.json music.tracks now carries real entities — day
  spotify:track:5WN9wAj9Bn8Rf8i4cesLmJ (After All This Time, VIGI), sunset
  spotify:track:0MNNKSUU9OOQ8DSGWduw79 (Mystery of Love, Sufjan Stevens), night
  spotify:track:3AVrVz5rK8Hrqo9YGiVGN5 (Apocalypse, Cigarettes After Sex) — so the
  card is visible from load. The "My projects" button was removed at the owner's
  request: hero.button is out of content.json, the .hero-actions/#hero-button
  markup is out of index.html, renderHero no longer looks for it, and the now
  unused .hero-actions/.button rules are out of notebook.css (no other element
  carries those classes). Work is still reachable from the menu.
- 20260918-spotify: the music is a Spotify Embed instead of self-hosted files.
  Reason: the wanted tracks are commercial releases, and embedding is the only
  lawful way to play them — Spotify licenses the playback, the site hosts nothing.
  The cost is fixed by Spotify's Developer Terms, which forbid "modifying,
  editing, altering" Spotify Content and removing trademark notices: the card
  must stay visible and unaltered, so it is the control and the header's circular
  play/stop button is gone, along with the two <audio> decks and the 1.4 s
  crossfade (the iFrame API exposes no volume). Visitors who are not signed in
  hear a preview clip Spotify documents as under 30 seconds.
  Placement: inside the hero, under the city control (#hero-music > #spotify-embed),
  width capped at 420 px. It sits in the book, so a page turn sets it to
  display:none — measured first that this neither stops playback nor reloads the
  iframe, so the music carries across pages. An iframe cannot be drawn into the
  turn's foreignObject raster, so book.js drops .hero-music from the snapshot
  clone and CSS hides it on .book.is-page-turning and in .paper-snapshot.
  Wiring: index.html loads https://open.spotify.com/embed/iframe-api/v1 async and
  parks the API on window.spotifyIframeApi from an inline callback, because that
  script can be ready before the deferred book.js defines one. book.js then
  createController(slot,{uri,width:'100%',height:80}) and, on a phase or city
  change, loadEntity(uri); playback_update tracks isPaused and resumes after a
  swap that followed a click (Safari blocks an ungestured play). content.json
  music is {provider:'spotify', tracks:{day|sunset|night:{uri,title}}}; an empty
  uri hides the card, which is the shipped state until the three Spotify links
  are filled in. Verified in headless Chromium (Spotify's host is blocked there,
  so the card was checked hidden/shown, positioned and page-turn-safe, with the
  controller itself confirmed separately in a browser with network).
- 20260918-sky-music: the music follows the sky. ocean.js skyFor() now also
  returns a coarse `tone` (day / sunset / night — the golden hours collapse into
  `sunset`, dusk into `night`), carried in describe() and describeCity() beside
  the display `label`. content.json music is now
  {credit, creditHref, tracks:{day|sunset|night:{src,title}}}; content.js only
  publishes it as window.SITE_MUSIC and appends the licence credit to the footer
  note (CC BY requires naming the author). book.js owns the player: two
  <audio class="player-deck"> elements so a change of tone can crossfade
  (1400 ms; 900 ms in on play, 260 ms out on stop) with one rAF ramp per deck,
  cancelled before a new one so fades never stack. sky:update and a city click
  both call player.sync(detail); only a changed tone restarts playback. The
  first click unlocks both decks (Safari only lets an element play after a
  gesture has touched it) and warms the other tracks into the HTTP cache, so
  later swaps are instant. A track missing on disk is caught by a
  preload="metadata" probe at configure() and leaves the button disabled rather
  than silently dead; loadedmetadata clears that. trackFor() falls back to any
  configured track, so a partial content.json still plays. Playback is
  deliberately not tied to the book: the header sits outside it, so a page turn
  does not interrupt the music.
  Recommended tracks (not committed — download the MP3s into dist/ as
  music-day.mp3 / music-sunset.mp3 / music-night.mp3): Cirrus, Hymn to the Dawn
  and Penumbra by Scott Buckley, all CC BY 4.0 from scottbuckley.com.au.
  Verified in headless Chromium: play fades to full, a tone change crossfades to
  1/0 and pauses the old deck, stop fades both out, playback survives a page
  turn, the footer credit renders, no console errors.
- 20260918-player-shown: the music button is always visible in the menu. With
  content.json music.src empty it is rendered disabled (opacity .5, no hover,
  aria-label "Music (no track yet)", click ignored in book.js); filling in
  music.src/title enables it. Previously the control was hidden until a track
  existed, which read as "the icon is missing".
- 20260918-sky-detail: the hover detail under Busan · San Diego and every
  label the sky feature emits are English, matching the site: "Sun −7° ·
  facing SE · dusk" (phase words day / golden hour / sunset / dusk / night,
  compass N…NW, describe().sunWhere in view / behind / out of view), the
  place buttons' aria-labels ("Busan, now 19:05 — show the sky over Busan"),
  the group label and the player's "Play music" / "Play <title>".
- 20260918-full-sky: the sky now covers the whole Hero screen. Before, the
  rendered sky/water was a strip below the intro and the area above it was a
  flat CSS gradient (--sky-top -> --sky-base at the strip's top); on wide
  screens the join read as a horizontal seam and the stars stopped there.
  Now .ocean-scene is absolute inset:0 in the hero sheet, .hero-introduction
  sits over it (z-index 1), .book-sheet.hero starts at top:0 with padding-top
  header height + 56px, and .site-header[data-page="hero"] is transparent so
  the surface runs under the menu. book.js texture(): the hero clone is
  composed at sheetTop 0 / full height (other sheets still start below the
  header). --sky-top and --sky-join are gone (ocean.js sets --sky-base and the
  three ink variables only). The water keeps the size it had as a strip:
  ocean.js geometry() places the horizon so the water is 49.5% of the space
  under the intro + 56px (clamped to 16-50% of the sheet) and the sky takes
  everything above; the fragment shader maps the sky band onto the upper half
  of the 3:1 source and the water band onto its lower half (the old 3:1 cover
  fit with a 50.5% horizon is gone). .ocean-art.ocean-surface drops the fallback
  photo's transform/mask, and the snapshot no longer injects a filter/scale
  rule for .ocean-art (that rule out-specified .ocean-surface's filter:none
  and brightened the captured water frame relative to the live canvas). The
  surface pixel budget rises from 1.4 M to 4 M (dpr still capped at 1.5).
  The phone rule that fixed the strip at 90 px is removed. Also: .player[hidden]
  now really hides (the .player display rule was overriding the hidden
  attribute), and content.js gets a ?v= like the other assets (a cached
  content.js could not render the hero.places control). Verified in headless
  Chromium at 2560x1440, 1440x900, 1280x720 and 390x844: surface = sheet
  rect, header transparent, water = previous strip size, no errors; Hero ->
  Work -> Hero clean; hero snapshot geometry matches the live page.
- 20260918-real-sky: the three-mode sky switch is gone. The hero draws the
  real sky of one of two cities, computed on the device from its clock (no
  network, no live data): Busan (35.18 N, 129.08 E, Asia/Seoul, looking SE,
  azimuth 135) and San Diego (32.72 N, 117.16 W, America/Los_Angeles, looking W,
  azimuth 270), default San Diego. Files: astronomy.browser.min.js (astronomy-engine
  2.1.19, MIT, Don Cross; used: Observer, Equator, Horizon, Illumination,
  SiderealTime), stars.js (window.STARS, 2,061 Hipparcos stars to
  magnitude 5.2 as a flat Float32Array [RA deg, Dec deg, mag, B-V], from
  d3-celestial stars.6.json, BSD-3, Olaf Frohn) and a rewritten ocean.js.
  ocean.js requires both globals and otherwise returns an inert API. Model:
  solar elevation -> palette blend between AMBER (sun side), ROSE (anti-sun side:
  Earth shadow + Belt of Venus) and NIGHT, chosen per pixel by azimuth relative
  to the Sun; sun disc/glare/glitter and moonlight/moon glitter at their real
  positions; a point-sprite pass draws stars (extinction, scintillation, B-V
  colour, limiting magnitude that rises as the sky darkens; soft round sprites,
  no square edges), the Moon disc with phase and limb angle, and the planets.
  Projection is cylindrical, 110 deg of azimuth by 42 deg of altitude above the
  waterline. Astronomy is recomputed every 30 s while running (setInterval,
  cleared while paused) and immediately on city change; the frame loop only
  animates water. Header/hero ink comes from the sky: ocean.js sets --sky-top,
  --sky-base, --sky-ink, --sky-muted, --sky-faint on :root and data-sky-dark
  on .ocean-scene; .site-header[data-page="hero"], .hero, .hero-copy, .button
  and the place control read them, so text turns light at night. API:
  createOcean(scene) -> { city, skyKey, setCity(id), setRunning(v), snapshot(),
  describe(), describeCity(id) }. skyKey is city@minute and is part of the
  book's hero texture key, so a cached hero raster is reused within a minute
  and re-rasterized after a city change (book.js also clears the cache on click).
  Snapshot and header clones copy the five --sky-* variables. Each recompute
  dispatches sky:update on .ocean-scene with the describe() detail.
  Hero: content.json hero.copyLines is now ["Data analyst"]; the "San Diego"
  line is replaced by hero.places (Busan · San Diego), rendered by content.js as
  .place buttons (aria-pressed marks the drawn city). Hover/focus fades the city
  name into its local time and shows #place-detail beneath: solar altitude,
  view direction ("남동쪽 바다"), phase label (낮/황금빛/노을/땅거미/밤).
  Click draws that city's sky (the easter egg). Menu: the toggle's slot holds
  #player, a 34 px circular play/stop button (bars animate while playing,
  hover shows stop) bound to #player-audio; content.js sets the src from
  content.json music.src/title (the control is shown disabled while src is empty; see 20260918-player-shown).
  On phones the player sits on the brand row (order) and the links wrap below.
  Weight: +~165 KB uncompressed (astronomy 116 KB, stars 47 KB). Verified in
  headless Chromium (SwiftShader; timing not representative): both cities render
  with correct times and ink, hover detail, city switch re-rasterizes the hero,
  Hero -> Work -> Hero clean, no console errors, 1440 and 390 px layouts.
  Not yet verified on the actual Mac/Safari/iPhone. tests/ocean-freeze.test.cjs
  and tests/ocean-state.test.cjs updated for the new API (the toggle is gone;
  pausing must clear the sky timer and never recompute).
- 20260918-header-ground: removed the `.method, .about { border-top }` section
  dividers left over from the stacked single-page layout; with the absolutely
  positioned header each sheet starts directly under the menu, so that border
  drew a line under the menu bar. The header now takes the page's ground:
  `.site-header[data-page="contact"]` is the footer's #143748 with light nav
  text (previously the menu stayed paper-white over the dark Contact page).
  Snapshots carry data-page on the cloned header, so raster and live agree.
- 20260918-prune (dead code removal, no behavior change): index.html no longer
  carries the #ocean-ripple SVG filter, the legacy #hero-work-flip wrapper, or the
  page/data-page attributes (book.js still accepts [data-page] for custom pages).
  notebook.css lost the wave-crest rules and keyframes, ocean-drift, the
  .ocean-art override, .paper-cast-shadow, .case-flow, .flow-item and
  footer h2 span (nothing generates them). book.js lost the wrapper unwrapping,
  turnPose() and the wave-crest snapshot rule; ocean.js lost the setSunset alias
  and the per-frame data-sunset-blend/data-ocean-second attribute writes (kept:
  data-ocean-mode/ready/running). Frame deltas are clamped at zero. content.json
  carries the portrait srcset/sizes and content.js applies them. Unused files
  deleted from dist: the four *-preview.html, ocean-pink.js, jiung-moon-840/1260,
  pacific-horizon.png, jiung-ai-enhanced.png. Method: a Playwright pass matched
  every notebook.css selector against all pages, a page turn and all sky modes;
  only the snapshot-only selectors (.paper-snapshot*, .book-scroll-*) match
  nothing in the live DOM, as intended. Verified all routes, three sky modes,
  zero changed pixels after every finish, no console errors; tests pass.
- 20260918-live-destination (text shimmer + slow About): measured with per-frame
  pixel diffs under deterministic rAF stepping. (1) The final flat raster of the
  destination differed from the live page at every glyph edge (max 76/255 at
  DPR 1), so the 165 ms opacity crossfade morphed all text: the reported shimmer.
  The destination is now never drawn as a flat raster; the live destination page
  and precommitted header sit beneath the transparent canvas, the outgoing page
  is rasterized only while it is being covered, and the turn settles on the frame
  the last sheet is flat (single turn 1485 ms, no tail). preserveDrawingBuffer is
  gone (every frame is drawn, so the browser may swap instead of copy).
  (2) NPOT native-resolution snapshots sampled with plain LINEAR alias when the
  sheet is foreshortened. The renderer now requests WebGL2 first (NPOT mipmaps:
  LINEAR_MIPMAP_LINEAR + generateMipmap) with EXT_texture_filter_anisotropic (x8)
  and highp fragment precision; WebGL1 falls back to LINEAR. (3) About embedded
  the 2433 px / 1.18 MB portrait as a 1.6 MB data URL in every snapshot; images
  are now embedded at displayed width x raster scale (createImageBitmap), and the
  page serves jiung-moon-700/-1400/-2100.jpg via srcset. Note the portrait box is
  420x525 with object-fit: cover on a landscape photo, so the rendered image is
  700 CSS px wide (scaled to the box height, cropped at the sides): sizes is
  "(max-width: 460px) 133vw, 700px" and the snapshot embed is sized by the
  rendered image, not the box width. An earlier 840/1260 pair sized by the box
  width was upscaled 1.67x at DPR 2 and looked soft; those two files are unused.
  Verified in headless Chromium: Hero -> About (3 sheets), About -> Work, Work ->
  Hero with zero changed pixels after finish; WebGL2 context in use; no errors.
  tests/book-handoff.test.cjs and tests/book-raster.test.cjs were rewritten for
  this design (they previously required preserveDrawingBuffer and forbade mipmaps).
  Frame timing on the actual Mac/Safari was not re-benchmarked here.
- 20260918-water-visibility: root cause of the Hero-origin bottom jump, found by
  deterministic rAF stepping (16.67 ms) with per-frame pixel diffs in headless
  Chromium. notebook.css gave the ready water canvas an explicit
  `visibility: visible`; CSS visibility lets a child override a hidden ancestor,
  so the outgoing Hero's `visibility: hidden` hid everything except the canvas,
  which stayed painted above the incoming page (z-index 2) for the whole turn
  and vanished in one frame when settle() set `hidden` (display:none). Before:
  the finish frame changed pixels in 0,397-1440,900 at 1440x900 (below the intro,
  i.e. the water strip). Fix: `.ocean-scene[data-ocean-ready] .ocean-surface`
  now uses `visibility: inherit`. After: Hero -> Work, Hero -> About (3 sheets)
  and Hero -> Contact (4 sheets) all show zero changed pixels on the finish frame
  and the following frames. Snapshots are unaffected (the captured <img> inherits
  from the visible .paper-snapshot). No JS changed. The earlier preserveDrawingBuffer,
  retina-parity and precommit changes were not the cause of this jump.
- Hero-origin follow-up: ocean.js now retains its own WebGL drawing buffer too
  (the previous retention fix changed only the book renderer). Pausing the ocean
  no longer calls settle(), which had advanced an in-flight sky transition to
  its endpoint before the book snapshot. PNG snapshots reuse identical
  dimensions/clock/blend/tone captures. Hero live/snapshot geometry was visually
  compared and matched; these lifecycle fixes target the Hero-only preparation
  interval, but the user's exact visible jump still requires visual confirmation.
  Regression: node tests/ocean-freeze.test.cjs.
- Retained-frame correction: the opacity-only final handoff requires WebGL
  preserveDrawingBuffer:true. Previously the default discarded the framebuffer
  after presentation. In-app-browser Hero -> About diagnostic sampled the
  subsequent handoff frame: alpha 0 before, alpha 255 after enabling retention.
  This is shared by all routes. ?book-debug additionally records the final flat
  GPU image and data-retained-frame-alpha; production does no readback. The
  earlier resolution/scrollbar differences did not fully explain the reported
  route-dependent jump; do not claim those alone resolved the issue.
- Retina/snapshot parity follow-up supersedes older POT/DPR limits below.
  Actual viewport 854x773, DPR 2: old snapshots were 1024x1024 and the moving
  framebuffer was capped at DPR 1.25; live text was native DPR 2. All pages now
  use a shared native scale (DPR <=2, 6M pixels, max dimension 4096) for both
  NPOT RGBA snapshots and the framebuffer, with WebGL1 LINEAR/CLAMP sampling.
  Five active textures fit the existing 128 MiB cache. Actual snapshots for
  Hero/Work/Method/About/Contact verified at 1708x1546. Work's native scrollbar
  was absent from the old snapshot; a shared 10px scrollbar style and snapshot
  track/thumb now agree. Snapshot content is clipped below the header and
  preserves a full viewport background even when scrolled. Optional ?book-debug
  exposes hidden diagnostic snapshot images for visual comparisons only.
  Observed Hero -> Work: 157 frame intervals / 1650ms, max26ms, 5 over25ms;
  this is a spot check, not a stable 120fps guarantee. Regression test:
  node tests/book-raster.test.cjs.
- End-handoff follow-up: precommit destination header and live content beneath
  the opaque book canvas before motion starts, instead of changing their
  visibility/selection at the final fade. After the mesh is flat, reuse that
  frame and change opacity only (no mesh rebuilding). Header is inert during
  motion and restored at settle. Visible sky-mode labels are removed; the
  accessible mode/cycle description remains. book-handoff.test.cjs checks both
  directions for no late header mutation or flat-handoff mesh redraw.
- 20260918-full-book supersedes the header/selection/turn-path notes below:
  the header is positioned over the full-viewport book; its measured height
  offsets live sheets. Each snapshot includes its own header, active menu and
  sky control. Non-Hero headers use paper instead of the Hero sky. Single and
  multi-sheet navigation share the same bounded renderer and flat handoff.
  The live header is hidden during motion, restored beneath the fading canvas,
  then exposed at settle. Active navigation uses color only, weight 400, no
  underline or color tween. The three-stop sky pill has a white center marker
  and ArrowLeft/ArrowRight/Home/End support; any mode change clears all snapshots.
  Actual in-app-browser check: menu x/width identical before/after navigation;
  Work -> Contact completed three sheets, no console error. Observed 149 frame
  intervals over 3539 ms, max 34 ms, so stable 120 FPS is NOT established.
- Latest direction: golden-hour supersedes pink/violet sunset grades below.
  Header #efe0c6 joins honey #e7c597 and copper #cf915e near the horizon.
  Broad amber light and luminance-gated honey reflections follow the displaced
  photograph; sea outside the reflection retains cooler depth. Toggle accent
  is amber. Daylight and all animation timings/amplitudes remain unchanged.
- Latest approved direction: dreamy-violet, applied directly to homepage.
  Pale pink header #ebd3d8 joins #e5c8da and lavender #bfadd3 near the horizon,
  with a broad pink glow. Sunset water is luminance-preserving violet-tinted
  with pink/lavender reflections gated by displaced photograph highlights.
  This supersedes the sea-original sunset grade below. Daytime, wave speed,
  amplitude, page-turn geometry and the shared freeze/capture clock are unchanged.
- Latest sea-original revision supersedes the slate water grades below: sunset
  water uses the original daytime displayed RGB with only 5% chroma reduction
  toward its luminance. No added slate lift, contrast compression or pink
  reflection. Sky unchanged. Ocean displacement speed (.72) and amplitude
  (.00042/.00105 times .8) remain identical to the initial homepage integration;
  preview sliders may have been set higher independently.
- Sea-depth refinement: preserve pale header/join but use #deb4c1 at the
  horizon for a perceptible, continuous rose gradient. Sunset water now mixes
  38% source chroma into luminance and blends 70% of that with muted slate
  (.23,.25,.30), replacing the washed-out lifted-gray treatment. Wave geometry,
  speed and amplitude are unchanged. data-ocean-second exposes its clock at 1 Hz.
- Latest art direction (soft-sky) supersedes the darker sampled sky below:
  keep the preferred pale header #ebd3d8, join to #e8cad1 at the actual ocean
  offset, then gently approach #e5c0c9 toward the horizon. Snapshot copies include
  --sky-join. Sunset water retains only 25% source chroma before a lifted slate
  grade, with reduced reflection intensity; daylight stays unchanged. Static
  sub-1-LSB shader dithering softens sky banding without flickering noise.
- Full-sky theme: header and Hero share --sky-top/--sky-base, interpolated from
  white to pale rose/dusty rose by the same blend clock as the water. A 100px
  image alpha feather removes the ocean's hard top edge. Snapshot roots copy
  the resolved sky variables so SVG capture matches the live page during turns.
- Sunset palette now uses median samples of the user's attached wallpaper,
  converted from its embedded Display ICC profile to sRGB: #cf96a0, #d9959d,
  #e09da6, #d98e98. Surface canvas filter is none and opacity is 1, including
  serialized snapshots: former CSS brightness/saturation/0.8 alpha washed out
  the sunset. Original daytime grading is reproduced inside the shader only.
- Approved dusty-rose sunset is integrated with a fixed-size DAY switch in the
  top navigation. Left = daylight, right = sunset; no visible SUNSET label.
  Shader matches day-preview.html. Color interpolates over 2200 ms and reverses
  from its current blend. Wave/color clocks pause together during page turns;
  the switch is disabled until handoff completes. No preference is persisted.
  Changing mode away from Hero or with reduced motion selects the endpoint
  immediately; Hero snapshots are invalidated on mode changes.
- Navigation selection uses constant font weight plus color/absolute underline.
  Do not use active-state font-weight/size/padding changes: the former 400→700
  change shifted Work/Method by 3.0625 CSS px when settling back to Hero.
  Opacity/color transitions do not change the menu or book layout.
- Static HTML/CSS/JS. content.json is rendered by content.js.
- book.js unwraps the legacy hero-work container and treats hero, work, method,
  about and contact as peers.
- Single-sheet transitions take 1650 ms including the flat 165 ms handoff.
  Multi-sheet transitions use overlapping timelines: first 1500 ms, middle
  1400 ms, last 1650 ms, with 42% overlap of the shorter adjacent duration.
  Two/three/four-sheet totals are 2685/3539/4351 ms including final handoff.
  A cosine/quintic blend softens peak velocity. Depth is scaled to 68%, corner
  twist and shading reduced, and perspective pulled back for a calmer motion.
  One WebGL canvas draws connected 64 x 12 meshes with a corner-led twist,
  continuously changing curvature, shaded faces and a fine outer edge.
  This replaces thousands of cloned DOM descendants with two overlay elements.
- Single turns retain live stationary halves. Riffles draw two flat backing
  halves plus at most two moving sheets, all in the same depth-tested canvas.
  Every intermediate page has its own front/back textures. Rasterization and
  upload happen before the timeline starts, not between its overlapping sheets.
  Only fully flat geometry fades into live content at the end (165 ms).
  Navigation distances above four sheets continue in bounded four-sheet batches.
- Snapshot roots preserve source classes, viewport dimensions and scroll positions.
  Inline SVG foreignObject captures are rasterized locally and cached; external
  images are embedded first. Power-of-two textures allow trilinear mipmapping
  so text stays smooth when the surface is steeply angled. IDs are removed.
- The overlay spans the entire viewport. Texture coordinates select the proper
  source half for both front and back faces, including reverse navigation.
- Per-vertex shading, mesh curvature and a compositor-only spine shadow add depth.
  GPU buffers, textures and renderer are reused. Moving-sheet framebuffer DPR is
  capped at 1.25 and 2 million pixels; snapshots use CSS size rounded to a power
  of two, capped at 2048 per dimension. Settled live text remains native resolution.
  GPU cache has an LRU budget of 128 MiB / 6 textures (minimum 2 active faces);
  CPU snapshot cache is limited to 6 pages. Up to 6 nearby pages are warmed in
  advance with a 50 ms yield between uploads; no synchronous gl.finish fence.
  Per-frame trigonometry uses recurrence; UV coordinates are precomputed.
  rAF follows native refresh rate without a 60 fps cap. 120 fps requires a
  120 Hz display/browser; synthetic 120 Hz tests do not establish hardware FPS.
- 20260918-three-skies: the hero has three sky modes. #day-toggle is the original
  pill switch with a three-stop track; one click cycles DAY -> AMBER -> ROSE and
  book.js keeps data-mode, the label and aria-label in sync. The label has a fixed
  min-width so the nav row's geometry never changes. ocean.js exposes setMode(n)
  (setSunset(bool) remains as an alias for mode 1) and a `mode` getter; the mode is
  mirrored to .ocean-scene[data-ocean-mode]. ROSE header colors (--sky-top/--sky-base)
  stay within the rose family (rgb 233,207,204 -> 224,188,185); an earlier near-white
  --sky-top made the intro area read as washed out on wide screens. AMBER keeps the previous golden-hour
  constants unchanged. ROSE is the dusty-rose palette approved from the preview
  (sky #e0bcb9 -> #e8b2b3, peach glow #f9cdb5, water reflection #f4bcaa), plus a
  waterline haze band and near-water sky reflection that AMBER has at 0.
  Palettes are plain data at the top of ocean.js and reach the shader as uniforms,
  uploaded only while a fade is in progress; day mode early-exits the dusk math.
  day -> dusk and amber -> rose share one 2200 ms clock; returning to day keeps the
  current tone so rose fades directly to day. Pausing the water (page turn, hidden
  page, reduced motion) settles an in-progress fade so the captured snapshot and the
  live page after handoff show the same sky. The header gradient (--sky-top/--sky-base)
  follows the same blend and tone. Validated in headless Chromium: all three modes,
  a page turn during ROSE with a matching snapshot, return to Hero with water
  resumed and mode retained, and the control fitting at 390 px width. Not yet
  measured on the actual Mac/Safari; frame timing was not re-benchmarked.
- ocean.js replaces the SVG ribbons with the approved photo-displacement shader
  from ocean-preview.html (default strength 0.8). Sky/horizon remain fixed; the
  water displacement increases toward the foreground. One bounded 1.4M-pixel
  WebGL surface, DPR <=1.5, uses a 1920px photo and no blur/turbulence passes.
  The clock runs only while Hero is settled, visible and reduced motion is off.
  Navigation pauses it and captures the canvas once as PNG for the serialized
  page snapshot. Hero resumes at the same clock after handoff. The static photo
  remains the fallback for unavailable/lost WebGL. Legacy CSS drift stays off.
- Navigation turns every intervening sheet: Hero to About = Work, Method, About.
  Reverse navigation works identically. Rapid input redirects after the active batch.
  Resize settles to the requested final destination.
  Reduced-motion preference switches pages immediately.
- Hidden live sections are inert and aria-hidden. Active navigation uses aria-current.
- No publication is authorized. A previous source version was uploaded to Sites
  but deployment was cancelled by the user. Current GPU changes are local only.

## Validation
Local Chrome automated checks passed for desktop/mobile forward and backward
navigation, skipped destinations, scroll retention, queued navigation, resizing
during animation, and reduced motion. No page errors. Deterministic intermediate
frames were captured and inspected. Recheck screenshots after future geometry edits.

## Preview
Serve dist through a local HTTP server (content.json is fetched).
The sky needs window.Astronomy and window.STARS (both script tags in index.html).
Current development URL: http://127.0.0.1:4173

## Adding pages
Add a section/footer with a unique id as a direct child of #book, plus a matching
nav.links entry in content.json (href: #that-id). Custom div pages may use data-page.
Menu order determines page order; additional unlinked sections follow DOM order.
No edits to a hardcoded page list or turn-count logic are needed. Runtime additions
and menu reorderings are observed. The corresponding page content must still be built.

## Latest tests
20260917-day-toggle: live DAY switch and sunset endpoint verified; Hero ↔ Contact
preserved sunset=1 and resumed water, switch re-enabled, no console errors.
Current in-app run recorded 300/269 intervals with max 34 ms and 27/26 intervals
above 25 ms. Do not carry the prior revision's 120 Hz performance claim forward;
the cause of this run's slower frame delivery has not been established.
Lifecycle and timing unit tests pass. Public deployment remains unauthorized.

20260917-photo-water: approved shader integrated into Hero. Actual in-app
Hero → Contact → Hero each recorded 523 rAF intervals, maximum 9 ms and zero
above 25 ms. Snapshot preparation was 29/33 ms. Water paused while away and
resumed after return; no warnings/errors. Timing and ocean lifecycle tests pass.

20260917-swell: three SVG wave layers visible in the live Hero; frozen poses
matched exactly on departure and return (transform and opacity), then advanced
after the final handoff. Actual in-app Hero → Contact and reverse: 523 rAF
intervals each, max 9 ms, zero over 25 ms, preparation 8/10 ms, no errors.
node tests/ocean-state.test.cjs checks running/paused lifecycle and phase retention
for navigation, hidden pages/documents and reduced motion. No new mobile or
standalone water-only FPS benchmark was performed in this revision.

20260917-silk: timing regression tests updated for 1650 ms single turns and
neighboring sheet-duration ratios below 1.2 (no rushed middle sheets). The
two-moving-sheet cap and exact page counts remain covered.
In-app 854 x 773 / DPR 2: Hero → About completed in the 3539 ms timeline
(423 rAF intervals, maximum 17 ms, zero above 25 ms). About → Method single
reverse turn recorded 199 intervals, maximum 9 ms, zero above 25 ms. Both had
21 handoff frames. Final destination visible, no leftover overlay or errors.

Previous revision measurements:
20260917-riffle: node tests/book-timing.test.cjs checks 1350 ms single turns,
overlapping schedules, maximum two moving sheets, counts for distances 1–100,
and flat-only opacity handoff. Actual in-app measurements at 854 x 773 / DPR 2:
Hero → About: three sheets, 2515 ms, 302 frame intervals, maximum 9 ms.
About → Work: two sheets, 1965 ms, 236 intervals, maximum 9 ms.
Work → Hero: single sheet, 1350 ms, 162 intervals, maximum 9 ms.
Hero → Contact: four sheets, 2905 ms, 349 intervals, maximum 9 ms, two moving
meshes, no leftover overlay. Fixed footer.book-sheet background specificity so
the live Contact page matches its dark snapshot rather than flashing to white.
All three recorded zero frame intervals above 25 ms and 17 handoff frames.
These are rAF delivery measurements, not proof of every GPU presentation.

Previous revision validation:
20260917-handoff addresses the raster-to-live discontinuity, not just frame rate:
geometry reaches an exact flat endpoint at 90% of the 1150 ms turn; the final
115 ms smoothly fades the flat mesh into the already-positioned incoming DOM.
The outgoing half is hidden only once covered, and visibility is reset by settle
(including interruption/reduced-motion paths). Cleanup runs on the next rAF so
the transparent endpoint can be presented before removing the overlay.
Snapshot width now uses the live section's clientWidth, accounting for scrollbars.
Pure timing checks passed at 60/120/144 Hz (no crossfade while geometry is curved).
Actual in-app Hero → About: final sheet 138 intervals, max 9 ms, 14 flat handoff
frames, preparation 1 ms; the destination was visible and no overlay remained.

Actual in-app preview (854 x 773, devicePixelRatio 2), after explicit reload of
20260917-budgeted: Hero → About and About → Work completed. Final sheets recorded
138/139 frame intervals over 1150 ms, maximum 9 ms, zero intervals over 25 ms;
preparation 2/1 ms respectively. No warning/error logs. This measures rAF delivery,
not proof of every GPU presentation or all hardware/viewport performance.
The book's data-last-turn holds the latest measurement for future regressions.
Versioned asset URLs ensure a reload requests this revision.

Synthetic 120 Hz timestamps verified 1/2/3-sheet jumps, reverse chains, a newly added
sixth section/menu, redirect during a chain, resizing, mobile and reduced motion.

## Notes
This supersedes the previous rigid-card implementation and its old validation claims.
The surface uses a GPU mesh, not a cloth-physics solver. Browsers without usable
WebGL or SVG rasterization fall back to immediate, accessible navigation.
# Work exhibition integrated — September 22, 2026

- Main Work now mounts the same single-column exhibition renderer as work-preview.html: collapsed index, title-first artworks, paired Research/MediRoute images, email video, original links, and separate five-section detail view.
- `work-preview.js` exposes `mountWorkExhibition`; embedded mode uses the Work sheet's own scroll container and intercepts only its internal links, keeping book page navigation intact. Scoped `work-exhibition.css` avoids styling other sheets.
- Work layout/media events invalidate its cached page texture. Videos pause on book navigation and their current frame is captured for page-turn snapshots.
- Main-site script URLs versioned. Eight existing regression checks and JS syntax checks passed. No browser visual/performance QA was performed this turn; no official deployment.
- Privacy review remains required before publication for the supplied email recording and the old unused screenshot. See exhibits/SOURCES.md. Preview Marketing methodological caveats also appear in the integrated renderer; content.json is preserved.
