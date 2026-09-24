/*
 * content.js — renders all editable page text/data from content.json.
 *
 * HOW TO EDIT THIS SITE:
 * Open content.json and change the values there. Do not edit index.html or
 * this file for a normal content update — this file only reads content.json
 * and builds the matching page structure automatically. Adding a new project
 * card, principle, timeline step, tag, or contact link is done by adding a
 * new entry to the relevant array in content.json; nothing else needs to
 * change.
 */
(function () {
  "use strict";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setLines(target, lines) {
    target.innerHTML = "";
    lines.forEach((line, i) => {
      if (i > 0) target.appendChild(document.createElement("br"));
      target.appendChild(document.createTextNode(line));
    });
  }

  function renderMeta(meta) {
    if (!meta) return;
    if (meta.title) document.title = meta.title;
    if (meta.description) {
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute("content", meta.description);
    }
  }

  function renderNav(nav) {
    if (!nav) return;
    const brand = document.getElementById("nav-brand");
    if (brand && nav.brand) {
      brand.textContent = nav.brand.label;
      // data-label feeds the invisible bold copy that reserves each item's width
      // (see .nav-links a::before), so going bold never reflows the row.
      brand.dataset.label = nav.brand.label;
      brand.setAttribute("href", nav.brand.href);
    }
    const links = document.getElementById("nav-links");
    if (links && nav.links) {
      links.innerHTML = "";
      nav.links.forEach((l) => {
        const a = document.createElement("a");
        a.href = l.href;
        a.textContent = l.label;
        a.dataset.label = l.label;
        links.appendChild(a);
      });
    }
  }

  function renderHero(hero) {
    if (!hero) return;
    const name = document.getElementById("hero-title");
    if (name) name.textContent = hero.name;

    const copy = document.getElementById("hero-copy");
    if (copy && hero.copyLines) setLines(copy, hero.copyLines);

    // Two cities under the title. Each is a button; the sky follows the chosen one.
    const place = document.getElementById("hero-place");
    if (place && hero.places) {
      place.innerHTML = "";
      hero.places.forEach((p, i) => {
        if (i > 0) { const dot = el("span", "place-dot", "·"); dot.setAttribute("aria-hidden", "true"); place.appendChild(dot); }
        const b = el("button", "place");
        b.type = "button"; b.dataset.place = p.id; b.setAttribute("aria-pressed", "false");
        b.appendChild(el("span", "place-name", p.label));
        const t = el("span", "place-time", "--:--"); t.setAttribute("aria-hidden", "true"); b.appendChild(t);
        place.appendChild(b);
      });
      const detail = el("span", "place-detail"); detail.id = "place-detail"; detail.setAttribute("aria-live", "polite");
      place.appendChild(detail);
    }
  }

  function renderWork(work) {
    if (!work) return;
    const kicker = document.getElementById("work-kicker");
    if (kicker) kicker.textContent = work.kicker;
    const title = document.getElementById("work-title");
    if (title) title.textContent = work.title;
    const intro = document.getElementById("work-intro");
    if (intro) intro.textContent = work.intro;

    // The Work sheet is the exhibition from work-preview.js (loaded before this
    // file): an overview, and a case-study reading mode inside the same sheet.
    const list = document.getElementById("case-list");
    if (list && work.groups && window.mountWorkExhibition) {
      const shell = list.closest('.shell');
      shell.classList.add('work-exhibition', 'preview-main');
      const overview = el('div');
      overview.id = 'overview';
      overview.append(shell.querySelector('.section-heading'));
      const collection = el('div');
      collection.id = 'work-collection';
      overview.append(collection);
      const detail = el('article');
      detail.id = 'detail';
      detail.hidden = true;
      list.replaceWith(overview, detail);
      if (intro) intro.hidden = true;
      window.mountWorkExhibition({ work });
    }
  }

  function renderReasoningMap(rm) {
    if (!rm) return;
    const map = document.querySelector(".reasoning-map");
    if (map && rm.ariaLabel) map.setAttribute("aria-label", rm.ariaLabel);

    const sig1 = document.getElementById("rm-signal-1");
    const sig2 = document.getElementById("rm-signal-2");
    if (sig1 && rm.signalLabel) sig1.textContent = rm.signalLabel[0];
    if (sig2 && rm.signalLabel) sig2.textContent = rm.signalLabel[1];

    const qk = document.getElementById("rm-q-kicker");
    const qt = document.getElementById("rm-q-text");
    if (qk && rm.question) qk.textContent = rm.question.kicker;
    if (qt && rm.question) qt.textContent = rm.question.text;

    const branches = document.getElementById("rm-branches");
    if (branches && rm.branches) {
      branches.innerHTML = "";
      rm.branches.forEach((b) => {
        const div = document.createElement("div");
        div.appendChild(el("span", null, b.label));
        div.appendChild(el("small", null, b.text));
        branches.appendChild(div);
      });
    }

    const caption = document.getElementById("rm-caption");
    if (caption) caption.textContent = rm.mapCaption;

    const fwk = document.getElementById("rm-fw-kicker");
    const fwt = document.getElementById("rm-fw-text");
    if (fwk && rm.framework) fwk.textContent = rm.framework.kicker;
    if (fwt && rm.framework) fwt.textContent = rm.framework.text;

    const ank = document.getElementById("rm-an-kicker");
    const ant = document.getElementById("rm-an-text");
    const ann = document.getElementById("rm-an-note");
    if (ank && rm.analysis) ank.textContent = rm.analysis.kicker;
    if (ant && rm.analysis) ant.textContent = rm.analysis.text;
    if (ann && rm.analysis) ann.textContent = rm.analysis.note;

    const outk = document.getElementById("rm-out-kicker");
    const outt = document.getElementById("rm-out-text");
    if (outk && rm.output) outk.textContent = rm.output.kicker;
    if (outt && rm.output) setLines(outt, rm.output.lines);
  }

  function renderPrinciple(p) {
    const article = el("article", "principle");
    article.appendChild(el("span", "number", p.number));
    article.appendChild(el("h3", null, p.title));
    article.appendChild(el("p", null, p.text));
    return article;
  }

  function renderMethod(method) {
    if (!method) return;
    const kicker = document.getElementById("method-kicker");
    if (kicker) kicker.textContent = method.kicker;
    const title = document.getElementById("method-title");
    if (title) title.textContent = method.title;
    const intro = document.getElementById("method-intro");
    if (intro) intro.textContent = method.intro;

    renderReasoningMap(method.reasoningMap);

    const grid = document.getElementById("method-grid");
    if (grid && method.principles) {
      grid.innerHTML = "";
      method.principles.forEach((p) => grid.appendChild(renderPrinciple(p)));
    }
  }

  function renderAbout(about) {
    if (!about) return;
    const kicker = document.getElementById("about-kicker");
    if (kicker) kicker.textContent = about.kicker;

    const portrait = document.getElementById("about-portrait");
    if (portrait && about.portrait) {
      portrait.src = about.portrait.src;
      if (about.portrait.srcset) portrait.setAttribute("srcset", about.portrait.srcset);
      if (about.portrait.sizes) portrait.setAttribute("sizes", about.portrait.sizes);
      portrait.alt = about.portrait.alt;
      if (about.portrait.width) portrait.setAttribute("width", about.portrait.width);
      if (about.portrait.height) portrait.setAttribute("height", about.portrait.height);
    }
    const caption = document.getElementById("portrait-caption");
    if (caption && about.portrait) caption.textContent = about.portrait.caption || "";

    const heading = document.getElementById("about-title");
    if (heading && about.headingLines) setLines(heading, about.headingLines);

    const detailsContainer = document.getElementById("about-details");
    if (detailsContainer && about.details) {
      detailsContainer.innerHTML = "";
      about.details.forEach((text, i) => {
        const p = el("p", i === 0 ? "about-detail" : "about-detail coastal-background", text);
        detailsContainer.appendChild(p);
      });
    }

    if (about.education) {
      const school = document.getElementById("edu-school");
      const degree = document.getElementById("edu-degree");
      const years = document.getElementById("edu-years");
      if (school) school.textContent = about.education.school;
      if (degree) {
        degree.replaceChildren();
        about.education.degree.split(' · ').forEach(line => {
          degree.appendChild(el('span', 'education-degree-line', line));
        });
      }
      if (years) years.textContent = about.education.years;
    }
  }

  // Music is configured, not rendered: book.js reads window.SITE_MUSIC and picks
  // the track matching the hero's sky. Here we only publish it and add the
  // licence credit to the footer (CC BY tracks must name their author).
  function renderMusic(music) {
    window.SITE_MUSIC = music || null;

    const note = document.getElementById("footer-note");
    const tracks = (music && music.tracks) || {};
    const titles = [...new Set(
      Object.values(tracks).filter((t) => t && t.src && t.title).map((t) => t.title)
    )];
    if (!note || !music || !music.credit || !titles.length) return;
    const line = el("span", "footer-music");
    line.appendChild(document.createTextNode(titles.join(" · ") + " — "));
    if (music.creditHref) {
      const a = document.createElement("a");
      a.href = music.creditHref;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = music.credit;
      line.appendChild(a);
    } else {
      line.appendChild(document.createTextNode(music.credit));
    }
    note.appendChild(line);
  }

  function renderContact(contact) {
    if (!contact) return;
    // No heading here any more: the footer's first column is the sunrise/sunset
    // block, which contact-sun.js draws from live solar data rather than JSON.

    const links = document.getElementById("contact-links");
    if (links && contact.links) {
      links.innerHTML = "";
      contact.links.forEach((l) => {
        const a = document.createElement("a");
        a.href = l.href;
        if (/^https?:\/\//.test(l.href)) {
          a.target = "_blank";
          a.rel = "noreferrer";
        }
        a.appendChild(el("span", null, l.label));
        a.appendChild(el("span", null, "↗"));
        links.appendChild(a);
      });
    }

    const note = document.getElementById("footer-note");
    if (note && contact.footerNote) {
      note.innerHTML = "";
      contact.footerNote.forEach((text) => note.appendChild(el("span", null, text)));
    }
  }

  async function init() {
    let data;
    try {
      // no-cache, not no-store: always revalidated, but a 304 skips the body.
      const res = await fetch("content.json", { cache: "no-cache" });
      data = await res.json();
    } catch (err) {
      console.error("content.js: failed to load content.json — page content will not render.", err);
      return;
    }

    renderMeta(data.meta);
    renderNav(data.nav);
    renderHero(data.hero);
    renderWork(data.work);
    renderMethod(data.method);
    renderAbout(data.about);
    renderContact(data.contact);
    renderMusic(data.music);

    // Let book.js (loaded separately) know the nav links now exist in the DOM, so
    // it can mark the current page's link active. book.js may not have downloaded
    // yet — it sits behind ~163KB of astronomy/star data — so leave a flag as well;
    // it checks the flag when it does arrive, and the event is not lost.
    window.CONTENT_RENDERED = true;
    document.dispatchEvent(new CustomEvent("content:rendered"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
