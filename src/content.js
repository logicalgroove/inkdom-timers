(function (g) {
  'use strict';
  const { guards, store, timers, panel, readout, people, heat } = g[Symbol.for('inkdom-timers')];

  const STATE_KEY = 'state-v1';
  const UI_KEY = 'ui-v1';
  const flags = { sawTick: false, formatMiss: false, sawView: false, viewWaitMs: 0 };
  const seen = { firstTimedAt: null, visibleSince: document.visibilityState === 'visible' ? Date.now() : null };
  const queue = [];
  let state = store.empty(), ready = false, dirty = false, view = null, lastMinutes = null, lastInkStamp = null;
  // The people layer. data is the unpacked file, read the first time the switch is on.
  const layer = { on: false, data: null, loading: false, failed: false, canvas: null, info: { state: 'off' }, here: null, last: null, frame: 0, pointer: 0 };
  const mapCanvas = () => document.querySelector('canvas.maplibregl-canvas');
  const put = store.saver(() => chrome.storage.local);

  function handle(event, localNow) {
    store.apply(state, event, localNow);
    dirty = true;
  }

  // Messages come from the page's world and are untrusted: everything goes through sanitize().
  window.addEventListener('message', ev => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const d = ev.data;
    if (!guards.isObj(d) || d.source !== 'inkdom-timers' || d.v !== 1) return;
    if (d.miss === 'tick') { flags.formatMiss = true; return; }
    for (const raw of guards.arr(d.events).slice(0, 8)) {
      const event = guards.sanitize(raw);
      if (!event) continue;
      if (event.type === 'world' && event.as_of != null) {
        flags.sawTick = true;
        flags.formatMiss = false;
        if (seen.firstTimedAt == null) seen.firstTimedAt = Date.now();
      }
      if (event.type === 'world' && event.in_view) flags.sawView = true;
      if (ready) handle(event, Date.now());
      else queue.push([event, Date.now()]);
      // A new map view: move the layer on the next frame rather than waiting for the one-second tick.
      if ((event.type === 'view' || (event.type === 'world' && event.in_view)) && layer.on) {
        if (layer.canvas) layer.canvas.seen();
        if (!layer.frame) layer.frame = requestAnimationFrame(() => { layer.frame = 0; drawPeople(); });
      }
    }
  });

  function loadPeople() {
    if (layer.loading) return;
    layer.loading = true;
    people.load(() => chrome.runtime.getURL('data/people-r6.bin'), url => fetch(url))
      .then(data => { layer.data = data; }, () => { layer.failed = true; })
      .then(() => { layer.loading = false; drawPeople(); });
  }

  // Draws or removes the layer and tells the panel what to show. Nothing here may stop the timers.
  function drawPeople() {
    if (!view || !layer.canvas) return;
    let info;
    try {
      if (!layer.on) { layer.canvas.remove(); info = { state: 'off' }; }
      else if (layer.failed) info = { state: 'failed' };
      else if (!layer.data) { loadPeople(); info = { state: 'loading' }; }
      else info = layer.canvas.render(state.bounds, layer.data);
    } catch (_) {
      info = { state: 'h3' };
    }
    // A new drawing can put another hexagon, or another size of hexagon, under a pointer that has not moved.
    if (info.state !== 'on') layer.here = null;
    else if (info !== layer.info) layer.here = readHere();
    layer.info = info;
    view.people(Object.assign({ here: layer.here }, info));
  }

  // The hexagon under where the pointer last was, or null when that is not the map itself.
  function readHere() {
    const p = layer.last;
    try { return p && p.target === mapCanvas() ? layer.canvas.at(p.x, p.y) : null; } catch (_) { return null; }
  }

  // Puts the figure under the pointer in the panel, if it changed. There is none while the layer is hidden.
  function showHere() {
    const here = readHere(), was = layer.here;
    if (here ? was && here.people === was.people && here.density === was.density : !was) return;
    layer.here = here;
    if (view && layer.info.state === 'on') view.people(Object.assign({ here }, layer.info));
  }

  // The figure under the pointer, at most once a frame.
  function onPointer(ev) {
    if (!layer.on) return;
    layer.last = { x: ev.clientX, y: ev.clientY, target: ev.target };
    if (layer.info.state !== 'on' || layer.pointer) return;
    layer.pointer = requestAnimationFrame(() => { layer.pointer = 0; showHere(); });
  }

  // The game's own "full Nm" figure, read again whenever its minutes or the ink timestamp change.
  // The label exists only while the game's sidebar is folded; without it the time is computed.
  function readInk(now) {
    const el = document.querySelector('[aria-label^="Ink "]');
    const reading = el ? readout.parse(el.getAttribute('aria-label')) : null;
    if (!reading) return;
    if (reading.minutes === lastMinutes && state.self.ink_updated_at === lastInkStamp) return;
    lastMinutes = reading.minutes;
    lastInkStamp = state.self.ink_updated_at;
    handle({ type: 'readout', full_at: now + reading.minutes * 60000 }, now);
  }

  function refresh() {
    const now = Date.now();
    readInk(now);
    // The game asks who is in view only while its tab is in front, so only that time counts as waiting.
    flags.viewWaitMs = seen.firstTimedAt != null && seen.visibleSince != null ? now - Math.max(seen.firstTimedAt, seen.visibleSince) : 0;
    view.update(timers.view(state, now, flags), now);
    drawPeople();
  }

  function save() {
    if (!dirty) return;
    dirty = false;
    put({ [STATE_KEY]: store.serialize(state) }).then(ok => { if (!ok) dirty = true; });
  }

  function start(saved) {
    state = store.revive(saved[STATE_KEY]);
    ready = true;
    for (const [event, at] of queue.splice(0)) handle(event, at);
    const ui = guards.isObj(saved[UI_KEY]) ? saved[UI_KEY] : {};
    const mount = () => {
      layer.on = ui.people === true;
      layer.canvas = heat.create(document, { mapCanvas, onVisible: showHere });
      view = panel.create(document, {
        ui: { x: guards.num(ui.x), y: guards.num(ui.y), collapsed: ui.collapsed === true, people: layer.on },
        onPin(id, on) { handle({ type: 'pin', id, on }, Date.now()); refresh(); },
        mapRect() { const map = mapCanvas(); return map ? map.getBoundingClientRect() : null; },
        onUi(next) { put({ [UI_KEY]: next }); },
        onPeople(on) { layer.on = on; drawPeople(); }
      });
      document.addEventListener('mousemove', onPointer, { capture: true, passive: true });
      refresh();
      setInterval(refresh, 1000);
      setInterval(save, 5000);
      document.addEventListener('visibilitychange', () => {
        seen.visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
        if (document.visibilityState === 'hidden') save();
      });
    };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  chrome.storage.local.get([STATE_KEY, UI_KEY]).then(start, () => start({}));
})(globalThis);
