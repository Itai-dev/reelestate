/* DW22 interactive apartment picker.
   Three stages on one canvas: the neighbourhood map zooms down to the address,
   the building turns and lets you pick an apartment, and the camera flies into
   it for a room-by-room look with the floor plan as a live guide. */
(() => {
  const D = window.DW22;
  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const flats = D.flats;
  const byId = Object.fromEntries(flats.map((f) => [f.id, f]));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const params = new URLSearchParams(location.search);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const num = (n) => n.toFixed(2).replace(".", ",");
  const floorName = (f) => (f === 0 ? "parter" : f + " piętro");
  const roomsName = (n) => (n === 1 ? "1 pokój" : n + " pokoje");
  const flatsWord = (n) => {
    const d = n % 10, h = n % 100;
    if (n === 1) return "mieszkanie";
    return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? "mieszkania" : "mieszkań";
  };
  // upper floors have balconies (the plans say so), the ground floor a terrace or a garden
  const outdoorName = (f) => (f.floor === 0 ? f.extra.toLowerCase() : f.spaces.filter((s) => s.name === "Balkon").length > 1 ? "2 balkony" : "balkon");
  const facts = (f) =>
    [roomsName(f.rooms), num(f.area) + " m²", floorName(f.floor), f.outdoor ? `${outdoorName(f)} ${num(f.outdoor)} m²` : ""]
      .filter(Boolean).join(" · ");

  let stage = "map";
  const tell = (type, detail) => { try { parent !== window && parent.postMessage({ source: "dw22-tour", type, ...detail }, "*"); } catch (e) {} };

  function setStage(s) {
    stage = s;
    app.dataset.stage = s;
    document.querySelectorAll(".steps button").forEach((b) => {
      if (b.dataset.go === s) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    tell("stage", { stage: s });
  }

  /* ------------------------------------------------------------------ okolica */
  const mapSq = $("mapSq");
  const mapImgs = [...mapSq.querySelectorAll("img")];
  const rings = $("rings");
  const KM_ACROSS = 31.26; // width of the widest map image on the ground
  let z = 0, mapAnim = 0, autoNext = 0;

  rings.setAttribute("viewBox", "0 0 1000 1000");
  rings.innerHTML = [1, 2, 3].map((km) => `<g data-km="${km}"><circle cx="500" cy="500"/><text x="500">${km} km</text></g>`).join("");

  function drawMap() {
    mapImgs.forEach((im, i) => {
      const sc = Math.pow(4, z - i);
      im.style.transform = `scale(${sc})`;
      im.style.opacity = i === 0 ? 1 : clamp((z - (i - 1)) * 1.7 - 0.2, 0, 1);
      im.style.visibility = (i < mapImgs.length - 1 && z >= i + 1) || sc < 0.02 ? "hidden" : "visible";
    });
    const M = mapSq.offsetWidth || 1;
    rings.querySelectorAll("g").forEach((g) => {
      const r = (g.dataset.km / KM_ACROSS) * 1000 * Math.pow(4, z);
      const c = g.firstChild, t = g.lastChild;
      c.setAttribute("r", r);
      t.setAttribute("y", 500 - r - 8000 / M);
      t.style.fontSize = 13000 / M + "px";
      g.style.opacity = clamp(1.6 - r / 420, 0, 1) * clamp(r / 12, 0, 1);
    });
  }
  function layoutMap() {
    const M = Math.max(app.clientWidth, app.clientHeight);
    mapSq.style.width = mapSq.style.height = M + "px";
    drawMap();
  }
  function zoomMap(to, ms, done) {
    cancelAnimationFrame(mapAnim);
    const from = z, t0 = performance.now();
    if (reduce) ms = 1;
    const tick = (now) => {
      const t = clamp((now - t0) / ms, 0, 1);
      z = from + (to - from) * ease(t);
      drawMap();
      if (t < 1) mapAnim = requestAnimationFrame(tick); else done && done();
    };
    mapAnim = requestAnimationFrame(tick);
  }
  function playMap(auto) {
    clearTimeout(autoNext);
    $("replay").hidden = true;
    z = 0; drawMap();
    zoomMap(3, 6500, () => {
      $("replay").hidden = false;
      if (auto) autoNext = setTimeout(() => stage === "map" && goBld(), 2600);
    });
  }
  $("near").innerHTML = [
    ["Szpital Miejski", "3 min samochodem"], ["Politechnika Śląska", "6 min samochodem"],
    ["PKP Gliwice", "9 min samochodem"], ["Park Handlowy Arena", "9 min samochodem"],
    ["Szkoła Podstawowa nr 23", "13 min spacerem"], ["Park Chopina", "13 min rowerem"],
  ].map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join("");
  $("replay").onclick = () => playMap(false);
  $("toBld").onclick = () => goBld();
  $("intro").addEventListener("pointerdown", () => clearTimeout(autoNext));

  /* ------------------------------------------------------------------ budynek */
  const bld = $("bld"), box = $("bldBox"), cv = $("frame"), ctx = cv.getContext("2d"), ov = $("ov");
  const N = D.frames.length;
  const frameSrc = (i) => `frames/${String(i + 1).padStart(2, "0")}.webp`;
  const imgs = [], ready = [], edge = [];
  let fi = 0, sel = null, started = false;
  let pos = 0, aim = 0, praf = 0, moving = false, anim = null; // pos: where the turn is, in frames (fractional while moving)
  const filter = { floor: null, rooms: null };

  const points = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  function shape(d) { // area and centre of an outline (largest piece wins the centre)
    let area = 0, best = 0, c = null;
    d.split(/z/i).forEach((part) => {
      const p = points(part);
      if (p.length < 6) return;
      let a = 0, cx = 0, cy = 0;
      for (let i = 0; i < p.length; i += 2) {
        const x0 = p[i], y0 = p[i + 1], x1 = p[(i + 2) % p.length], y1 = p[(i + 3) % p.length];
        const k = x0 * y1 - x1 * y0; a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
      }
      a /= 2;
      if (Math.abs(a) > best) { best = Math.abs(a); c = [cx / (6 * a), cy / (6 * a)]; }
      area += Math.abs(a);
    });
    return { area, c };
  }
  const shapes = D.frames.map((fr) => Object.fromEntries(Object.entries(fr).map(([id, d]) => [id, shape(d)])));
  const bestFrame = (id) => {
    let b = -1, a = 0;
    shapes.forEach((s, i) => { if (s[id] && s[id].area > a) { a = s[id].area; b = i; } });
    return { i: b, area: a };
  };
  const matches = (f) => (filter.floor === null || f.floor === filter.floor) && (filter.rooms === null || f.rooms === filter.rooms);

  // Frames are fetched and decoded ahead, then painted on one canvas: turning never waits on a download or a decode.
  const wrap = (i) => ((i % N) + N) % N;
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  function edgeColours(i) { // average colour of the top and bottom strips, to continue the picture past its edges
    try {
      probe.canvas.width = 1; probe.canvas.height = 2;
      const im = imgs[i], h = im.naturalHeight, w = im.naturalWidth;
      probe.drawImage(im, 0, 0, w, h * 0.04, 0, 0, 1, 1);
      probe.drawImage(im, 0, h * 0.96, w, h * 0.04, 0, 1, 1, 1);
      const d = probe.getImageData(0, 0, 1, 2).data;
      edge[i] = [`rgb(${d[0]},${d[1]},${d[2]})`, `rgb(${d[4]},${d[5]},${d[6]})`];
    } catch (e) { edge[i] = null; }
  }
  function preload(i) {
    if (imgs[i]) return imgs[i];
    const im = (imgs[i] = new Image());
    im.decoding = "async";
    im.src = frameSrc(i);
    const done = () => { ready[i] = true; edgeColours(i); if (i === wrap(Math.round(aim)) || !started) paint(); };
    (im.decode ? im.decode() : new Promise((r, j) => { im.onload = r; im.onerror = j; })).then(done, () => { im.onload = done; });
    return im;
  }
  function preloadAll() { // nearest frames first, four at a time
    const order = [];
    for (let k = 0; k <= N / 2; k++) { order.push(wrap(fi + k)); if (k) order.push(wrap(fi - k)); }
    let at = 0;
    const next = () => {
      while (at < order.length && imgs[order[at]]) at++;
      if (at >= order.length) return;
      const im = preload(order[at++]);
      const go = () => next();
      if (im.complete) go(); else { im.addEventListener("load", go, { once: true }); im.addEventListener("error", go, { once: true }); }
    };
    for (let k = 0; k < 4; k++) next();
  }
  function nearestReady(i) {
    for (let k = 0; k <= N / 2; k++) { if (ready[wrap(i + k)]) return wrap(i + k); if (ready[wrap(i - k)]) return wrap(i - k); }
    return -1;
  }
  function paint() {
    const i = nearestReady(Math.round(aim));
    if (i < 0) return;
    const changed = i !== fi || !started;
    fi = i; started = true;
    ctx.drawImage(imgs[i], 0, 0, cv.width, cv.height);
    if (edge[i]) { bld.style.setProperty("--top", edge[i][0]); bld.style.setProperty("--bot", edge[i][1]); }
    if (changed) { drawOverlay(); if (!moving) follow(); }
  }
  function request(p) { aim = p; if (!praf) praf = requestAnimationFrame(() => { praf = 0; paint(); }); }
  function drawOverlay() {
    const fr = D.frames[fi];
    let html = "";
    for (const id in fr) {
      const f = byId[id];
      html += `<path d="${fr[id]}" data-id="${id}" class="${matches(f) ? "" : "off"}${f.tour ? " ready" : ""}${id === sel ? " sel" : ""}"><title>${id} · ${facts(f)}</title></path>`;
    }
    if (sel && fr[sel]) {
      const c = shapes[fi][sel].c;
      html += `<g class="tag"><rect x="${c[0] - 82}" y="${c[1] - 38}" width="164" height="76" rx="12"/><text x="${c[0]}" y="${c[1]}">${sel}</text></g>`;
    }
    ov.innerHTML = html;
  }
  function setFrame(i) { stop(); pos = wrap(i); preload(pos); request(pos); }
  function stop() { if (anim) { cancelAnimationFrame(anim); anim = null; } }
  function settle() { moving = false; bld.classList.remove("moving"); pos = wrap(Math.round(pos)); request(pos); follow(); }
  function rotateTo(target, done) { // eased turn along the shorter way round
    stop();
    let d = wrap(target - Math.round(pos)); if (d > N / 2) d -= N;
    if (reduce || !d) { setFrame(target); done && done(); return; }
    const from = pos, ms = Math.min(1100, 160 + Math.abs(d) * 55), t0 = performance.now();
    moving = true; bld.classList.add("moving");
    const step = (now) => {
      const t = clamp((now - t0) / ms, 0, 1);
      pos = from + d * ease(t); request(pos);
      if (t < 1) anim = requestAnimationFrame(step); else { anim = null; settle(); done && done(); }
    };
    anim = requestAnimationFrame(step);
  }
  function glide(v) { // keep turning after a flick, slowing down; v in frames per millisecond
    stop();
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(48, now - last); last = now;
      pos += v * dt; v *= Math.pow(0.9935, dt); request(pos);
      if (Math.abs(v) > 0.003) anim = requestAnimationFrame(step); else { anim = null; settle(); }
    };
    anim = requestAnimationFrame(step);
  }
  let zoomed = false;
  $("zoomBtn").onclick = () => {
    zoomed = !zoomed;
    $("zoomBtn").textContent = zoomed ? "−" : "+";
    $("zoomBtn").setAttribute("aria-label", zoomed ? "Oddal" : "Przybliż");
    layoutBld();
  };
  function layoutBld() {
    const w = app.clientWidth, h = app.clientHeight;
    // the frame always fills the screen; on a tall phone that crops its sides, so the view follows the chosen apartment
    // wide screens are always filled; a tall phone shows more of the street unless the visitor zooms in
    const W = Math.max(w, zoomed ? h * 1.25 : Math.min(h * 1.25, w * 1.95)), H = W * 0.8;
    box.style.width = W + "px"; box.style.height = H + "px";
    // any strip left over goes mostly to the top, where the controls sit
    box.style.marginTop = (H > h ? -0.47 * H : -H / 2 + (h - H) * 0.08) + "px";
    bld.classList.toggle("banded", H < h - 1);
    $("zoomBtn").hidden = h * 1.25 <= w * 1.95;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; ctx.imageSmoothingQuality = "high"; if (started) paint(); }
    follow();
  }
  function follow() {
    const w = app.clientWidth, W = box.offsetWidth, spare = Math.max(0, (W - w) / 2);
    const s = sel && shapes[fi][sel];
    const dx = s ? clamp((0.5 - s.c[0] / 2000) * W, -spare, spare) : 0;
    box.style.marginLeft = -W / 2 + dx + "px";
  }

  // drag to turn, tap to pick
  let drag = null;
  const stepPx = () => clamp(app.clientWidth / 26, 12, 40); // pixels of drag per frame
  bld.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const wasMoving = !!anim; stop();
    drag = { x: e.clientX, y: e.clientY, p: pos, moved: wasMoving, id: !wasMoving && e.target.dataset && e.target.dataset.id, track: [[performance.now(), e.clientX]] };
    bld.setPointerCapture(e.pointerId);
  });
  bld.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.hypot(dx, e.clientY - drag.y) < 7) return;
    if (!drag.moved || !moving) { drag.moved = true; moving = true; bld.classList.add("dragging", "moving"); }
    const now = performance.now();
    drag.track.push([now, e.clientX]);
    while (drag.track.length > 2 && now - drag.track[0][0] > 90) drag.track.shift();
    pos = drag.p - dx / stepPx();
    request(pos);
  });
  const endDrag = (e) => {
    if (!drag) return;
    bld.classList.remove("dragging");
    const d = drag; drag = null;
    if (!d.moved) { moving = false; bld.classList.remove("moving"); d.id ? select(d.id) : select(null); return; }
    const t = d.track, a = t[0], b = [performance.now(), e ? e.clientX : t[t.length - 1][1]];
    const v = b[0] - a[0] > 8 ? -(b[1] - a[1]) / (b[0] - a[0]) / stepPx() : 0;
    Math.abs(v) > 0.006 && !reduce ? glide(clamp(v, -0.06, 0.06)) : settle();
  };
  bld.addEventListener("pointerup", endDrag);
  bld.addEventListener("pointercancel", () => endDrag());
  $("turnL").onclick = () => rotateTo((fi + 3) % N);
  $("turnR").onclick = () => rotateTo((fi - 3 + N) % N);
  addEventListener("keydown", (e) => {
    if (stage === "bld" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) rotateTo(wrap(fi + (e.key === "ArrowLeft" ? 1 : -1)));
    if (stage === "room" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) stepSpace(e.key === "ArrowLeft" ? -1 : 1);
    if (e.key === "Escape") { $("mini").classList.remove("big"); if (stage === "bld") select(null); }
  });

  function chips(el, items, key) {
    el.innerHTML = items.map(([label, v]) => `<button type="button" data-v="${v}" aria-pressed="${filter[key] === v}">${label}</button>`).join("");
    el.onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const v = b.dataset.v === "null" ? null : +b.dataset.v;
      filter[key] = filter[key] === v ? null : v;
      [...el.children].forEach((c) => c.setAttribute("aria-pressed", String((c.dataset.v === "null" ? null : +c.dataset.v) === filter[key])));
      if (sel && !matches(byId[sel])) select(null); else drawOverlay();
      count();
    };
  }
  function count() {
    const n = flats.filter((f) => matches(f) && f.status === "available").length;
    $("count").textContent = `${n} ${flatsWord(n)}`;
    $("filterBtn").classList.toggle("active", filter.floor !== null || filter.rooms !== null);
  }
  $("filterBtn").onclick = () => {
    const open = $("filters").hidden;
    $("filters").hidden = !open;
    $("filterBtn").setAttribute("aria-expanded", String(open));
  };
  chips($("floorChips"), [["Parter", 0], ["1 piętro", 1], ["2 piętro", 2]], "floor");
  chips($("roomChips"), [["1 pokój", 1], ["2", 2], ["3", 3], ["4 pokoje", 4]], "rooms");

  function select(id) {
    sel = id;
    const card = $("card");
    app.classList.toggle("has-card", !!id);
    if (!id) { card.hidden = true; drawOverlay(); follow(); return; }
    const f = byId[id];
    $("cardId").textContent = id;
    const ok = f.status === "available";
    $("cardStatus").textContent = ok ? "Dostępne" : "Niedostępne";
    $("cardStatus").classList.toggle("no", !ok);
    $("cardFacts").textContent = facts(f);
    $("cardPlan").innerHTML = `<img src="plans/${id}.webp" alt="Plan mieszkania ${id}">`;
    $("cardPdf").href = f.pdf;
    $("enter").textContent = f.tour ? "Wejdź do środka" : "Zobacz plan";
    $("cardNote").hidden = !!f.tour;
    card.hidden = false;
    if (f.tour) f.tour.order.forEach((n) => { new Image().src = roomSrc(f, n); });
    const best = bestFrame(id), here = shapes[fi][id];
    if (best.i >= 0 && (!here || here.area < best.area * 0.55)) rotateTo(best.i); else { drawOverlay(); follow(); }
    tell("select", { id });
  }
  $("cardX").onclick = () => select(null);

  // the building opens on an apartment that has interiors, so the first tap leads somewhere
  const withTour = (byId.M11 && byId.M11.tour && byId.M11) || flats.find((f) => f.tour);
  $("readyKey").hidden = !withTour || flats.every((f) => f.tour);

  function goBld() {
    clearTimeout(autoNext);
    if (stage === "map") zoomMap(4.4, 1100);
    if (!started) { setFrame(5); setTimeout(() => { if (!sel) withTour ? select(withTour.id) : rotateTo(0); }, 700); }
    setStage("bld");
    preloadAll();
  }

  /* -------------------------------------------------------------- mieszkanie */
  const room = $("room"), flash = $("flash"), mini = $("mini");
  const views = [$("viewA"), $("viewB")];
  let cur = null, order = [], si = 0, vi = 0, raf = 0, lastTouch = 0;
  const pan = { x: 0, y: 0, tx: 0, ty: 0, rx: 0, ry: 0 };
  const roomSrc = (f, n) => `rooms/${f.tour.views[n].img}.webp`;
  const space = (n) => cur.spaces.find((s) => s.n === n);

  function enter() {
    const f = byId[sel]; if (!f) return;
    const s = shapes[fi][sel];
    const start = () => { openRoom(f); setStage("room"); };
    if (!s || reduce) { start(); return; }
    const r = box.getBoundingClientRect(), a = app.getBoundingClientRect();
    const ox = s.c[0] / 2000, oy = s.c[1] / 1600;
    const tx = a.left + a.width / 2 - (r.left + r.width * ox), ty = a.top + a.height / 2 - (r.top + r.height * oy);
    app.classList.add("busy");
    box.style.transformOrigin = `${ox * 100}% ${oy * 100}%`;
    box.classList.add("fly");
    box.style.transform = `translate(${tx}px, ${ty}px) scale(7)`;
    setTimeout(() => flash.classList.add("on"), 620);
    setTimeout(() => {
      start();
      setTimeout(() => {
        flash.classList.remove("on"); app.classList.remove("busy");
        box.classList.remove("fly"); box.style.transform = "";
      }, 120);
    }, 1120);
  }
  $("enter").onclick = enter;

  function planHtml(f) {
    const { w, h } = f.plan;
    return `<img src="plans/${f.id}.webp" alt="Plan mieszkania ${f.id}" draggable="false">
      <svg class="plan-svg" viewBox="0 0 ${w} ${h}">
        <defs><radialGradient id="coneG" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${w * 0.24}">
          <stop offset="0" stop-color="#a8905f" stop-opacity=".75"/><stop offset="1" stop-color="#a8905f" stop-opacity="0"/></radialGradient></defs>
        <g class="marks"></g></svg>`;
  }
  function drawPlans() {
    const { w, h } = cur.plan, n = order[si], tour = cur.tour;
    const v = tour && tour.views[n];
    let g = "";
    order.forEach((m) => {
      const s = space(m); if (!s || !s.pt) return;
      if (m === n && v) return;
      const x = s.pt[0] * w, y = s.pt[1] * h + h * 0.045;
      g += `<circle class="hit" data-n="${m}" cx="${x}" cy="${y}" r="${w * 0.055}"><title>${s.name}</title></circle>
            <circle class="dot${m === n ? " on" : ""}" data-n="${m}" cx="${x}" cy="${y}" r="${w * (m === n ? 0.02 : 0.013)}"/>`;
    });
    if (v) {
      const x = v.cam[0] * w, y = v.cam[1] * h, R = w * 0.24, a = (34 * Math.PI) / 180;
      g += `<g class="me" transform="translate(${x} ${y}) rotate(${v.dir})" data-dir="${v.dir}" data-x="${x}" data-y="${y}">
              <path class="cone" d="M0 0 L${R * Math.cos(a)} ${-R * Math.sin(a)} A${R} ${R} 0 0 1 ${R * Math.cos(a)} ${R * Math.sin(a)} Z"/></g>
            <circle class="halo" cx="${x}" cy="${y}" r="${w * 0.03}"/><circle class="dot on" cx="${x}" cy="${y}" r="${w * 0.017}"/>`;
    }
    document.querySelectorAll(".plan-svg .marks").forEach((el) => (el.innerHTML = g));
  }
  function fit(img) {
    if (!img.naturalWidth) return;
    const w = app.clientWidth, h = app.clientHeight;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight) * 1.08;
    img.style.width = img.naturalWidth * s + "px"; img.style.height = img.naturalHeight * s + "px";
    img.style.marginLeft = (-img.naturalWidth * s) / 2 + "px"; img.style.marginTop = (-img.naturalHeight * s) / 2 + "px";
    pan.rx = Math.max(0, (img.naturalWidth * s - w) / 2); pan.ry = Math.max(0, (img.naturalHeight * s - h) / 2);
  }
  function goSpace(i, first) {
    si = ((i % order.length) + order.length) % order.length;
    const n = order[si], s = space(n);
    $("spaceLine").innerHTML = `${s.name}<small>${num(s.area)} m²</small>`;
    [...$("spaces").children].forEach((b, k) => {
      if (k === si) { b.setAttribute("aria-current", "true"); const sp = $("spaces"); sp.scrollTo({ left: b.offsetLeft - (sp.clientWidth - b.offsetWidth) / 2, behavior: first || reduce ? "auto" : "smooth" }); }
      else b.removeAttribute("aria-current");
    });
    drawPlans();
    if (!cur.tour) return;
    const next = views[(vi = 1 - vi)], img = next.firstElementChild;
    const show = () => {
      if (order[si] !== n) return;
      fit(img);
      pan.x = pan.rx * 0.35; pan.y = 0; pan.tx = 0; pan.ty = 0; lastTouch = performance.now();
      img.style.transform = `translate(${pan.x}px, 0)`;
      next.classList.add("on"); views[1 - vi].classList.remove("on");
    };
    img.onload = show;
    img.src = roomSrc(cur, n);
    if (img.complete && img.naturalWidth) show();
  }
  const stepSpace = (d) => cur && goSpace(si + d);

  function openRoom(f) {
    cur = f;
    order = f.tour ? f.tour.order.filter((n) => f.spaces.some((s) => s.n === n)) : f.spaces.map((s) => s.n);
    room.classList.toggle("plan-only", !f.tour);
    views.forEach((v) => v.classList.remove("on"));
    $("stepRoom").disabled = false; $("stepRoom").textContent = f.id;
    $("aptLine").textContent = `${f.id} · ${facts(f)}`;
    $("spaces").innerHTML = order.map((n) => { const s = space(n); return `<button type="button" data-n="${n}">${s.name}<small>${num(s.area)} m²</small></button>`; }).join("");
    $("miniPlan").innerHTML = planHtml(f);
    $("bigPlan").innerHTML = f.tour ? "" : planHtml(f);
    $("ask").href = `mailto:biuro@dw22.pl?subject=${encodeURIComponent(`Zapytanie o mieszkanie ${f.id} (DW22)`)}`;
    $("roomPdf").href = f.pdf;
    $("note").textContent = f.tour
      ? `Wizualizacja poglądowa · ${coarse ? "przeciągnij" : "porusz myszą"}, aby się rozejrzeć`
      : "Wizualizacje wnętrz tego mieszkania są w przygotowaniu. Na planie zaznaczono pomieszczenia.";
    mini.classList.remove("big");
    goSpace(0, true);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    tell("enter", { id: f.id });
  }
  $("spaces").onclick = (e) => { const b = e.target.closest("button"); if (b) goSpace(order.indexOf(b.dataset.n)); };
  const planClick = (e) => { const n = e.target.dataset && e.target.dataset.n; if (n) { goSpace(order.indexOf(n)); mini.classList.remove("big"); } };
  $("miniPlan").onclick = planClick; $("bigPlan").onclick = planClick;
  $("miniZoom").onclick = () => mini.classList.toggle("big");

  // look around: drag on touch, follow the pointer on desktop, drift when idle
  let rdrag = null;
  room.addEventListener("pointerdown", (e) => {
    if (!cur || !cur.tour || e.button) return;
    mini.classList.remove("big");
    rdrag = { x: e.clientX, y: e.clientY, px: pan.tx, py: pan.ty };
    room.setPointerCapture(e.pointerId); room.classList.add("dragging");
  });
  room.addEventListener("pointermove", (e) => {
    if (!cur || !cur.tour) return;
    lastTouch = performance.now();
    if (rdrag) {
      pan.tx = clamp(rdrag.px + (e.clientX - rdrag.x), -pan.rx, pan.rx);
      pan.ty = clamp(rdrag.py + (e.clientY - rdrag.y), -pan.ry, pan.ry);
    } else if (e.pointerType === "mouse") {
      const r = app.getBoundingClientRect();
      pan.tx = -((e.clientX - r.left) / r.width - 0.5) * 2 * pan.rx;
      pan.ty = -((e.clientY - r.top) / r.height - 0.5) * 2 * pan.ry;
    }
  });
  const endR = () => { rdrag = null; room.classList.remove("dragging"); };
  room.addEventListener("pointerup", endR); room.addEventListener("pointercancel", endR);

  function loop(now) {
    if (stage === "room" && cur && cur.tour) {
      if (!rdrag && !reduce && now - lastTouch > 3500) pan.tx = Math.sin((now - lastTouch - 3500) / 5200) * pan.rx * 0.6;
      pan.x += (pan.tx - pan.x) * 0.07; pan.y += (pan.ty - pan.y) * 0.07;
      const img = views[vi].firstElementChild;
      img.style.transform = `translate(${pan.x.toFixed(1)}px, ${pan.y.toFixed(1)}px)`;
      const turn = pan.rx ? (-pan.x / pan.rx) * 30 : 0;
      document.querySelectorAll(".plan-svg .me").forEach((g) => g.setAttribute("transform", `translate(${g.dataset.x} ${g.dataset.y}) rotate(${+g.dataset.dir + turn})`));
    }
    raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------- całość */
  document.querySelector(".steps").onclick = (e) => {
    const go = e.target.dataset && e.target.dataset.go; if (!go || go === stage) return;
    if (go === "map") { clearTimeout(autoNext); cancelAnimationFrame(mapAnim); z = 3; drawMap(); $("replay").hidden = false; setStage("map"); }
    else if (go === "bld") goBld();
    else if (cur) setStage("room");
  };
  addEventListener("resize", () => {
    layoutMap(); layoutBld();
    if (cur && cur.tour) fit(views[vi].firstElementChild);
  });
  layoutMap(); layoutBld(); count(); setStage("map");
  preload(0); preload(5);

  const want = byId[(params.get("m") || "").toUpperCase()];
  if (want) { // deep link: ?m=M11 opens the building on that apartment, &in=1 goes inside
    z = 3; drawMap(); goBld(); select(want.id);
    if (params.get("in")) { openRoom(want); setStage("room"); }
  } else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); playMap(true); } }, { threshold: 0.4 });
    io.observe(app);
  } else playMap(true);
})();
