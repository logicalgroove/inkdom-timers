(function () {
  'use strict';
  // The page behind the Chrome Web Store pictures: the real panel and the real people layer over a stand-in map
  // with invented players. store.html?shot=overview, you, neighbours or people picks the picture.
  const { store, timers, panel, project, people, heat } = globalThis[Symbol.for('inkdom-timers')];
  const H = 3600000, MIN = 60000;
  // A fixed moment, so the pictures come out the same on every run.
  const T = new Date(2026, 9, 12, 14, 5, 0).getTime();
  const id = n => 'cccccccc-0000-4000-8000-' + String(n).padStart(12, '0');
  const ME = id(0), AL = id(900);

  const SHOTS = {
    overview: { people: true, hover: 'Tessaly', clip: [0, 0, 1280, 800], text: 'Your timers, the players on screen and a people layer, in one panel on the game' },
    you: { people: false, clip: [640, 0, 640, 400], text: 'When your ink is full and when each shield ends' },
    neighbours: { people: false, hover: 'Juno', top: 'On screen', clip: [640, 0, 640, 400], text: "Who is shielded, and until when they can't shield again" },
    people: { people: true, top: 'People', point: [23.76, 90.39], clip: [640, 0, 640, 400], text: 'The map shaded by people per km²' }
  };
  const shot = SHOTS[new URLSearchParams(location.search).get('shot')] || SHOTS.overview;

  // The edges the game would ask about for this window: 30% more than the screen, undistorted.
  const mercator = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const latOf = m => (Math.atan(Math.exp(m)) * 360) / Math.PI - 90;
  const MID = { lng: 89.85, lat: 23 }, SPAN = 6, half = (SPAN * Math.PI * innerHeight) / (360 * innerWidth);
  const bounds = { west: MID.lng - SPAN / 2, east: MID.lng + SPAN / 2, south: latOf(mercator(MID.lat) - half), north: latOf(mercator(MID.lat) + half) };

  // name, colour, km², minutes since the last loop, then each land as [lng, lat, half width, half height].
  const PEOPLE = [
    [1, 'Tessaly', '#3fb6c9', 42179, 95, [[88.95, 23.15, 0.4, 0.28]]],
    [2, 'Marrow', '#a77fe0', 6598, 14, [[88.2, 23.75, 0.42, 0.24]]],
    [3, 'Halden', '#f0a35e', 61000, 41, [[89.85, 24.03, 0.36, 0.17], [88.6, 22.45, 0.32, 0.22]]],
    [4, 'Brackwater', '#86c56f', 20000, 53, [[90.3, 22.45, 0.38, 0.22]]],
    [5, 'Old Kiln', '#b9b4a6', 2100, 300, [[87.95, 22.9, 0.26, 0.2]]],
    [6, 'Pim', '#e6c53f', 60, 2, [[89.55, 22.78, 0.16, 0.12]]],
    [7, 'Juno', '#ef7fb3', 30000, 30, [[90.3, 23.5, 0.34, 0.22]]],
    [8, 'Rook', '#7fb3ef', 18000, 600, [[89.1, 23.86, 0.24, 0.14]]]
  ];
  const OWN = [[89.45, 22.3, 0.3, 0.18]];
  const blob = ([lng, lat, w, h]) => {
    const r = [];
    for (let i = 0; i <= 24; i++) {
      const a = ((i % 24) / 24) * 2 * Math.PI, k = 1 + 0.2 * Math.sin(3 * a + lng);
      r.push(lng + w * k * Math.cos(a), lat + h * k * Math.sin(a));
    }
    return r;
  };

  const state = store.empty();
  const world = extra => Object.assign({ type: 'world', as_of: null, self: null, players: [], loops: [], shields: [], in_view: null }, extra);
  const apply = e => store.apply(state, e, T);
  apply(world({ self: { id: ME, score_km2: 33464, ink: 13.3, ink_updated_at: T - 5 * MIN } }));
  apply(world({
    players: PEOPLE.map(([n, name, color, km2, ago]) => ({
      id: id(n), name, color, monogram: name.slice(0, 2).toUpperCase(), score_km2: km2, last_loop_at: T - ago * MIN,
      first_loop_at: n === 6 ? T - 4 * H + 10 * MIN : T - 500 * H
    }))
  }));
  apply(world({
    as_of: T, in_view: PEOPLE.map(p => id(p[0])).concat(ME), bounds,
    pins: PEOPLE.map(p => ({ id: id(p[0]), lat: p[5][0][1], lng: p[5][0][0] })),
    shields: [
      { player_id: id(1), slot: 1, shield_until: T + 11 * MIN + 23000 }, { player_id: id(2), slot: 1, shield_until: T - 6 * H - 48 * MIN },
      { player_id: id(3), slot: 1, shield_until: T - 10 * H - 15 * MIN }, { player_id: id(3), slot: 2, shield_until: T + 5 * H + 40 * MIN },
      { player_id: id(4), slot: 1, shield_until: T - 19 * H }, { player_id: id(7), slot: 1, shield_until: T + 3 * H + 2 * MIN },
      { player_id: ME, slot: 2, shield_until: T + 56 * MIN + 12000 }, { player_id: id(8), slot: 1, shield_until: T - 2 * H }
    ]
  }));
  apply(world({ shapes: PEOPLE.map(p => ({ id: id(p[0]), rings: p[5].map(blob) })) }));
  apply({
    type: 'lands', lands: [
      { player_id: id(3), slot: 1, country_name: 'Bangladesh', shield_until: null }, { player_id: id(3), slot: 2, country_name: 'India', shield_until: null },
      { player_id: ME, slot: 1, country_name: 'Spain', shield_until: null }, { player_id: ME, slot: 2, country_name: 'Bangladesh', shield_until: null }
    ]
  });
  apply({
    type: 'shop',
    lands: [{ slot: 1, shield_until: T - 36 * H, lock_until: T - 20 * H }, { slot: 2, shield_until: T + 56 * MIN + 12000, lock_until: T + 56 * MIN + 12000 + 15 * H }],
    refill: { used: 2, cap: 5, price: 4800 }, resets_at: T + 4 * H + 40 * MIN, joker_next_at: null
  });
  apply({ type: 'season', ends_at: T + 11 * 24 * H + 2 * H });
  apply({ type: 'alliances', pairs: [[ME, AL], [id(7), AL], [id(8), AL]] });
  apply({ type: 'readout', full_at: T + 61 * MIN + 12000 });
  apply({ type: 'pin', id: id(1), on: true });

  // The stand-in map: flat ground, each land in its player's colour, and a disc where the game shows an avatar.
  const map = document.querySelector('canvas.maplibregl-canvas');
  const size = { width: innerWidth, height: innerHeight }, dpr = devicePixelRatio || 1;
  function paintMap() {
    const ctx = map.getContext('2d'), p = project.projector(bounds, size);
    map.width = size.width * dpr;
    map.height = size.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e9ede6';
    ctx.fillRect(0, 0, size.width, size.height);
    const lands = PEOPLE.map(([, name, color, , , list]) => ({ name, color, list })).concat({ name: 'You', color: '#5b6b7d', list: OWN });
    for (const land of lands) {
      for (const ring of land.list.map(blob)) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](p.x(ring[i]), p.y(ring[i + 1]));
        ctx.closePath();
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = land.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = land.color;
        ctx.stroke();
      }
      const [lng, lat] = land.list[0], x = p.x(lng), y = p.y(lat);
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, 2 * Math.PI);
      ctx.fillStyle = land.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#131a23';
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(land.name.slice(0, 2).toUpperCase(), x, y + 0.5);
    }
  }

  const flags = { sawTick: true, formatMiss: false, sawView: true, viewWaitMs: 0 };
  const view = panel.create(document, {
    ui: { x: null, y: null, collapsed: false, people: shot.people },
    onPeople() {}, onPin() {}, onUi() {},
    mapRect() { return map.getBoundingClientRect(); }
  });
  const root = view.host.shadowRoot;
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  async function stage() {
    paintMap();
    view.update(timers.view(state, T, flags), T);
    if (shot.people) {
      const layer = heat.create(document, { mapCanvas: () => map });
      const data = await people.load(() => '../data/people-r6.bin', url => fetch(url));
      const info = layer.render(bounds, data);
      const at = shot.point ? project.toScreen(bounds, size, shot.point[0], shot.point[1]) : null;
      view.people(Object.assign({ here: at ? layer.at(at.x, at.y) : null }, info));
    }
    await frame();
    if (shot.top) {
      const label = Array.from(root.querySelectorAll('.panel > .p-sec > .p-label > span:first-child')).find(n => n.textContent === shot.top);
      root.querySelector('.panel').scrollTop = label.closest('.p-sec').offsetTop;
    }
    if (shot.hover) {
      const name = Array.from(root.querySelectorAll('.row .name')).find(n => n.textContent === shot.hover);
      name.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    }
    // The caption sits in the bottom left corner of the part photographed, and is as large as that part is wide.
    const [x, y, width, height] = shot.clip, caption = document.getElementById('caption');
    caption.firstChild.textContent = shot.text;
    caption.style.left = x + 16 * (width / 640) + 'px';
    caption.style.bottom = innerHeight - y - height + 16 * (width / 640) + 'px';
    caption.style.fontSize = 15 * (width / 640) + 'px';
    // Clear of the panel: no further right than its left edge, with the same margin on that side.
    caption.style.maxWidth = Math.min(view.host.getBoundingClientRect().left, x + width) - x - 32 * (width / 640) + 'px';
    caption.hidden = false;
    await frame();
    return { x, y, width, height };
  }

  // tools/store-shots.js waits for this and takes the picture of the part it names.
  window.ready = stage();
})();
