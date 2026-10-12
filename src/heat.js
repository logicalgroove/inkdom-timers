(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});
  const P = IDT.people, J = IDT.project;

  const ID = 'inkdom-timers-people';
  const INK = '16,21,28', INSET = 0.93, STRIP = 60, MAX_KEPT = 60000, GIVE_UP_MS = 8000;
  const wrap = lng => ((((lng + 180) % 360) + 360) % 360) - 180;

  // The hexagons of level.res that hold people inside rect, each with its corners, people and people per km².
  // rect is { west, east, south, north } in degrees, east above west even across the date line.
  // kept, when given, remembers corners and areas between calls.
  function cells(h3, level, rect, kept) {
    const dLat = P.ACROSS[level.res] / 111.32;
    const south = Math.max(-85, rect.south - dLat), north = Math.min(85, rect.north + dLat);
    if (!(north > south)) return [];
    const dLng = dLat / Math.cos((((south + north) / 2) * Math.PI) / 180);
    let west = rect.west - dLng, east = rect.east + dLng;
    if (!(east - west < 360)) { west = -180; east = 180; }
    // H3 reads a polygon wider than 180 degrees as the other way round the world, so it gets strips.
    const strips = Math.ceil((east - west) / STRIP), step = (east - west) / strips;
    const seen = new Set(), out = [];
    for (let i = 0; i < strips; i++) {
      const a = wrap(west + i * step), b = wrap(west + (i + 1) * step);
      for (const id of h3.polygonToCells([[north, a], [north, b], [south, b], [south, a]], level.res)) {
        if (seen.has(id)) continue;
        seen.add(id);
        const people = P.find(level, P.keyOf(id));
        if (!people) continue;
        let shape = kept ? kept.get(id) : null;
        if (!shape) {
          const ring = [];
          for (const corner of h3.cellToBoundary(id)) ring.push(corner[0], corner[1]);
          shape = { ring, km2: h3.cellArea(id, 'km2') };
          if (kept) {
            if (kept.size >= MAX_KEPT) kept.clear();
            kept.set(id, shape);
          }
        }
        out.push({ id, ring: shape.ring, people, density: people / shape.km2 });
      }
    }
    return out;
  }

  // Where the page says the map is: the scale bar's width, and where each of the game's map pins sits on screen.
  function reading(map) {
    const box = map && map.parentElement, doc = map && map.ownerDocument, pins = new Map();
    const bar = doc && doc.querySelector ? doc.querySelector('.maplibregl-ctrl-scale') : null;
    if (box && box.querySelectorAll) for (const pin of box.querySelectorAll('.maplibregl-marker')) pins.set(pin, pin.style.transform);
    return { scale: bar ? bar.style.width : null, pins };
  }

  // Has the map moved between two readings? The scale bar changes width on every zoom, and on a pan every pin
  // shifts. One pin moving while the others stay is the game putting that pin somewhere else, not the map moving.
  function moved(before, now) {
    if (!before || !now) return false;
    if (before.scale !== now.scale) return true;
    let shared = 0, shifted = 0;
    for (const [pin, where] of before.pins) {
      if (!now.pins.has(pin)) continue;
      shared++;
      if (now.pins.get(pin) !== where) shifted++;
    }
    return shared > 0 && shifted === shared;
  }

  // opts.mapCanvas() returns the game's map canvas, or null. opts.onVisible(shown), if given, is told when the
  // layer is hidden because the map moved and when it is back. opts.now() is the clock, for tests.
  function create(doc, opts) {
    const win = doc.defaultView, kept = new Map(), levels = {}, clock = opts.now || Date.now;
    let canvas = null, drawn = null;
    // ref: the reading the drawing belongs to. asked: the reading taken when the game last reported a view.
    // hiddenAt: when the map was seen to leave the place the drawing is for, or null while the layer shows.
    let ref = null, asked = null, hiddenAt = null, watched = null, watchedBar = null, observer = null;

    function setHidden(on) {
      if (!canvas || (hiddenAt != null) === on) return;
      hiddenAt = on ? clock() : null;
      canvas.style.visibility = on ? 'hidden' : '';
      if (opts.onVisible) opts.onVisible(!on);
    }

    // Runs whenever a pin or the scale bar changes: hides the layer the moment the map leaves the place it was
    // drawn for, and shows it again if the map comes back there.
    function check() {
      const map = drawn && drawn.level ? opts.mapCanvas() : null;
      if (map) setHidden(moved(ref, reading(map)));
    }

    function watch(map) {
      const Observer = win.MutationObserver;
      if (!Observer || !map.parentElement) return;
      if (watched !== map) {
        if (observer) observer.disconnect();
        observer = new Observer(check);
        observer.observe(map.parentElement, { attributes: true, attributeFilter: ['style'], subtree: true });
        watched = map;
        watchedBar = null;
      }
      if (!watchedBar) {
        watchedBar = doc.querySelector('.maplibregl-ctrl-scale');
        if (watchedBar) observer.observe(watchedBar, { attributes: true, attributeFilter: ['style'] });
      }
    }

    // The game has just reported a view: note where the map is at this moment, for the drawing that follows.
    function seen() {
      const map = opts.mapCanvas();
      asked = map ? reading(map) : null;
    }

    function levelOf(data, res) {
      if (res === data.res) return data;
      return levels[res] || (levels[res] = P.coarser(data, res));
    }

    // The layer is the map canvas's next sibling and covers it exactly, so the game's own interface stays on top.
    function attach(map, size) {
      if (!canvas) {
        canvas = doc.createElement('canvas');
        canvas.id = ID;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.position = 'absolute';
        canvas.style.pointerEvents = 'none';
      }
      if (map.nextElementSibling !== canvas) map.after(canvas);
      const s = canvas.style, left = map.offsetLeft + 'px', top = map.offsetTop + 'px', w = size.width + 'px', h = size.height + 'px';
      if (s.left !== left) s.left = left;
      if (s.top !== top) s.top = top;
      if (s.width !== w) s.width = w;
      if (s.height !== h) s.height = h;
    }

    function paint(list, scale, bounds, size, dpr) {
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      const ctx = canvas.getContext('2d'), p = J.projector(bounds, size);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      // A hexagon on the far side of the world from the middle of the view has corners at both screen edges.
      const tooWide = 180 * p.pxPerDegree;
      for (const c of list) {
        const a = P.alpha(c.density, scale);
        if (a < 0.05) continue;
        const n = c.ring.length / 2, xs = new Array(n), ys = new Array(n);
        let cx = 0, cy = 0, min = Infinity, max = -Infinity;
        for (let i = 0; i < n; i++) {
          const x = p.x(c.ring[i * 2 + 1]), y = p.y(c.ring[i * 2]);
          xs[i] = x; ys[i] = y; cx += x; cy += y;
          if (x < min) min = x;
          if (x > max) max = x;
        }
        if (!(max - min < tooWide) || !Number.isFinite(cy)) continue;
        cx /= n; cy /= n;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = cx + (xs[i] - cx) * INSET, y = cy + (ys[i] - cy) * INSET;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(' + INK + ',' + a.toFixed(3) + ')';
        ctx.fill();
      }
    }

    function remove() {
      if (canvas) canvas.remove();
      canvas = null;
      drawn = null;
      ref = asked = hiddenAt = null;
    }

    // bounds: the map edges the game asked for. data: the resolution 6 level.
    // Returns { state: 'on', res, name, lo, hi }, or { state: 'waiting' } or { state: 'h3' } with nothing drawn.
    function render(bounds, data) {
      const map = opts.mapCanvas();
      const box = map ? map.getBoundingClientRect() : null;
      const size = box ? { width: box.width, height: box.height } : null;
      const rect = J.rectOf(bounds, size);
      if (!rect) { remove(); return { state: 'waiting' }; }
      const dpr = win.devicePixelRatio || 1;
      const sig = JSON.stringify([bounds, size.width, size.height, dpr]);
      attach(map, size);
      watch(map);
      if (drawn && drawn.sig === sig) {
        if (asked) {
          // The game reported this same view again, so this is where the map is now.
          ref = asked;
          asked = null;
          if (drawn.level) setHidden(moved(ref, reading(map)));
        } else if (hiddenAt != null && clock() - hiddenAt >= GIVE_UP_MS) {
          // No new view came after the map moved: better the layer as it was than none.
          ref = reading(map);
          setHidden(false);
        }
        return drawn.info;
      }
      const res = P.resFor(J.pxPerKm(bounds, size), size.width * size.height), level = levelOf(data, res);
      drawn = { sig, bounds, size, res, level: null, info: { state: 'h3' } };
      try {
        const list = cells(g.h3, level, rect, kept);
        const scale = P.scale(list.map(c => c.density));
        paint(list, scale, bounds, size, dpr);
        drawn.level = level;
        drawn.info = { state: 'on', res, name: P.NAMES[res], lo: scale ? scale.lo : null, hi: scale ? scale.hi : null };
        // If the map went on moving after the game asked, the drawing is already out of place: keep it hidden.
        ref = asked || reading(map);
        asked = null;
        setHidden(moved(ref, reading(map)));
      } catch (_) {
        canvas.width = canvas.width;
      }
      return drawn.info;
    }

    // The hexagon under a point of the window: { people, density }, zeros where nobody is counted,
    // null when the layer is not drawn or the point cannot be placed.
    function at(clientX, clientY) {
      const map = drawn && drawn.level && hiddenAt == null ? opts.mapCanvas() : null;
      if (!map) return null;
      const box = map.getBoundingClientRect();
      const where = J.fromScreen(drawn.bounds, drawn.size, clientX - box.left, clientY - box.top);
      if (!where || Math.abs(where.lat) > 89) return null;
      try {
        const id = g.h3.latLngToCell(where.lat, where.lng, drawn.res);
        const people = P.find(drawn.level, P.keyOf(id));
        return people ? { people, density: people / g.h3.cellArea(id, 'km2') } : { people: 0, density: 0 };
      } catch (_) {
        return null;
      }
    }

    return { render, at, remove, seen, check };
  }

  IDT.heat = { ID, cells, moved, create };
})(globalThis);
