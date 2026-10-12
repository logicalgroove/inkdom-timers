(function () {
  'use strict';
  const { store, timers, panel } = globalThis[Symbol.for('inkdom-timers')];
  const H = 3600000, MIN = 60000, T = Date.now();
  const id = n => 'cccccccc-0000-4000-8000-' + String(n).padStart(12, '0');
  const ME = id(0), AL = id(900);
  const p = (n, name, color, km2, loopAgoMin, extra) => Object.assign({
    id: id(n), name, color, monogram: name.slice(0, 2).toUpperCase(), score_km2: km2,
    last_loop_at: T - loopAgoMin * MIN, first_loop_at: T - 500 * H
  }, extra);
  const state = store.empty();
  const world = extra => Object.assign({ type: 'world', as_of: null, self: null, players: [], loops: [], shields: [], in_view: null }, extra);
  const apply = e => store.apply(state, e, T);

  // Own record, directory, then the first view: the order the game loads them in.
  apply(world({ self: { id: ME, score_km2: 33464, ink: 13.3, ink_updated_at: T - 5 * MIN } }));
  apply(world({
    players: [
      p(1, 'Tessaly', '#3fb6c9', 42179, 95), p(2, 'Marrow', '#a77fe0', 6598, 14), p(3, 'Halden', '#f0a35e', 61000, 41),
      p(4, 'Brackwater', '#86c56f', 20000, 53), p(5, 'Old Kiln', '#b9b4a6', 2100, 300),
      p(6, 'Pim', '#e6c53f', 60, 2, { first_loop_at: T - 4 * H + 10 * MIN }), p(7, 'Juno', '#ef7fb3', 30000, 30),
      p(8, '<img src=x onerror=alert(1)>', '#cc4444', 900, 600), p(9, 'A name that runs to the forty char limit', '#4477cc', 5200, 600),
      p(10, 'Not on screen', '#333333', 100, 600), p(11, 'Rook', '#7fb3ef', 18000, 600)
    ]
  }));
  apply(world({
    as_of: T, in_view: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 0].map(id),
    // Points inside each land, and the edges the game asked for (30% more than the screen).
    bounds: { west: 86, south: 21.5, east: 92, north: 24.5 },
    pins: [[1, 23, 89], [2, 23.6, 88.2], [3, 22.4, 90.1], [4, 23.9, 90.6], [5, 22.2, 87.6], [6, 23.2, 87.3], [7, 22.9, 91.2], [8, 24.4, 86.1], [9, 22.6, 88.9], [11, 23.3, 89.9]]
      .map(([n, lat, lng]) => ({ id: id(n), lat, lng })),
    shields: [
      { player_id: id(1), slot: 1, shield_until: T + 11 * MIN + 23000 }, { player_id: id(2), slot: 1, shield_until: T - 6 * H - 48 * MIN },
      { player_id: id(3), slot: 1, shield_until: T - 10 * H - 15 * MIN }, { player_id: id(3), slot: 2, shield_until: T + 5 * H + 40 * MIN },
      { player_id: id(4), slot: 1, shield_until: T - 19 * H }, { player_id: id(7), slot: 1, shield_until: T + 3 * H + 2 * MIN },
      { player_id: ME, slot: 2, shield_until: T + 56 * MIN + 12000 }, { player_id: id(11), slot: 1, shield_until: T - 2 * H }
    ]
  }));
  // Land outlines for some players, as rings of lng, lat. The rest fall back to the ring at their point.
  const blob = (lng, lat, w, h) => { const r = []; for (let i = 0; i <= 24; i++) { const a = (i % 24) / 24 * 2 * Math.PI, k = 1 + 0.25 * Math.sin(3 * a); r.push(lng + w * k * Math.cos(a), lat + h * k * Math.sin(a)); } return r; };
  apply(world({
    shapes: [
      { id: id(1), rings: [blob(89, 23, 0.5, 0.35), blob(89, 23, 0.12, 0.08)] },
      { id: id(2), rings: [blob(88.2, 23.6, 0.6, 0.3)] },
      { id: id(3), rings: [blob(90.6, 22.6, 0.7, 0.45), blob(91.9, 23.4, 0.4, 0.3)] },
      { id: id(8), rings: [blob(85.2, 24.9, 0.5, 0.3)] }
    ]
  }));
  apply({
    type: 'lands', lands: [
      { player_id: id(3), slot: 1, country_name: 'Nepal', shield_until: null }, { player_id: id(3), slot: 2, country_name: 'India', shield_until: null },
      { player_id: ME, slot: 1, country_name: 'Spain', shield_until: null }, { player_id: ME, slot: 2, country_name: 'Bangladesh', shield_until: null }
    ]
  });
  apply({
    type: 'shop',
    lands: [{ slot: 1, shield_until: T - 36 * H, lock_until: T - 20 * H }, { slot: 2, shield_until: T + 56 * MIN + 12000, lock_until: T + 56 * MIN + 12000 + 15 * H }],
    refill: { used: 5, cap: 5, price: 4800 }, resets_at: T + 4 * H + 40 * MIN, joker_next_at: null
  });
  apply({ type: 'season', ends_at: T + 11 * 24 * H + 2 * H });
  apply({ type: 'alliances', pairs: [[ME, AL], [id(7), AL], [id(11), AL]] });
  apply({ type: 'readout', full_at: T + 61 * MIN + 12000 });
  apply({ type: 'pin', id: id(1), on: true });

  // demo.html#pill, #waiting, #format and #noview show the other states. #people, #people-sea, #people-loading,
  // #people-failed, #people-waiting and #people-h3 show the People section; its switch works in all of them.
  const PEOPLE = {
    '#people': { state: 'on', res: 6, name: '7 km', lo: 187, hi: 16234, here: { people: 455625, density: 11497 } },
    '#people-sea': { state: 'on', res: 2, name: '370 km', lo: null, hi: null, here: null },
    '#people-loading': { state: 'loading' }, '#people-failed': { state: 'failed' },
    '#people-waiting': { state: 'waiting' }, '#people-h3': { state: 'h3' }
  };
  const sample = PEOPLE[location.hash] || PEOPLE['#people'];
  const flags = { sawTick: location.hash !== '#waiting', formatMiss: location.hash === '#format', sawView: location.hash !== '#noview', viewWaitMs: 60000 };
  const view = panel.create(document, {
    ui: { x: null, y: null, collapsed: location.hash === '#pill', people: location.hash in PEOPLE },
    onPeople(on) { view.people(on ? sample : { state: 'off' }); },
    onPin(pid, on) { store.apply(state, { type: 'pin', id: pid, on }, Date.now()); refresh(); },
    mapRect() { return { left: 0, top: 0, width: innerWidth, height: innerHeight }; },
    onUi() {}
  });
  function refresh() {
    const now = Date.now();
    view.update(timers.view(state, now, flags), now);
  }
  refresh();
  if (location.hash in PEOPLE) view.people(sample);
  setInterval(refresh, 1000);
})();
