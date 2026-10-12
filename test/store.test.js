'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IDT = require('../support/load.js')('guards.js', 'store.js');
const { T, ME, P1, P2, AL, H } = require('../support/fixtures.js');

const { empty, apply, serialize, revive } = IDT.store;
const SLOW = 300000; // this computer's clock is five minutes behind the server
const P3 = 'aaaaaaaa-0000-4000-8000-000000000009';
const world = extra => Object.assign({ type: 'world', as_of: null, self: null, players: [], loops: [], shields: [], in_view: null, pins: [], bounds: null, shapes: [] }, extra);
const player = (id, name, extra) => Object.assign({ id, name, color: '#112233', monogram: name.slice(0, 2), score_km2: 20000, last_loop_at: T - H, first_loop_at: T - 500 * H }, extra);
const SELF = { id: ME, score_km2: 33000, ink: 12, ink_updated_at: T - 1000 };

// The order the game loads things in: own record, directory, then the first view.
const first = () => {
  const s = empty();
  apply(s, world({ self: SELF }), T - SLOW);
  apply(s, world({ players: [player(P1, 'Tessaly'), player(P2, 'Marrow'), player(P3, 'Far away'), player(ME, 'Me')] }), T - SLOW);
  apply(s, world({
    as_of: T, in_view: [P1, P2, ME],
    shields: [{ player_id: P1, slot: 1, shield_until: T + 1000 }, { player_id: ME, slot: 2, shield_until: T + 2000 }]
  }), T - SLOW);
  return s;
};

test('own record, directory and first view give self, players, who is on screen, shields and the clock offset', () => {
  const s = first();
  assert.equal(s.offset_ms, SLOW);
  assert.equal(s.last_tick_at, T);
  assert.equal(s.self.id, ME);
  assert.deepEqual(Object.keys(s.players).sort(), [P1, P2, P3].sort());
  assert.deepEqual(s.in_view, [P1, P2]);
  assert.equal(s.players[P1].seen_at, T);
  assert.equal(s.players[P3].seen_at, null);
  assert.deepEqual(s.lands[P1 + ':1'], { shield_until: T + 1000, country_name: '', seen_at: T });
  assert.deepEqual(s.lands[ME + ':2'], { shield_until: T + 2000, country_name: '', seen_at: T });
});

test('a directory has no time: the clock is left alone and nobody counts as seen', () => {
  const s = apply(empty(), world({ players: [player(P1, 'Tessaly')] }), T);
  assert.equal(s.offset_ms, 0);
  assert.equal(s.last_tick_at, null);
  assert.equal(s.players[P1].seen_at, null);
  assert.deepEqual(s.in_view, []);
});

test('you never become your own neighbour, whichever arrives first', () => {
  const s = apply(empty(), world({ players: [player(ME, 'Me'), player(P1, 'Tessaly')] }), T);
  assert.ok(s.players[ME]);
  apply(s, world({ self: SELF }), T);
  assert.deepEqual(Object.keys(s.players), [P1]);
  apply(s, world({ as_of: T, players: [player(ME, 'Me')], in_view: [ME, P1] }), T);
  assert.deepEqual(Object.keys(s.players), [P1]);
  assert.deepEqual(s.in_view, [P1]);
});

test('a different own id replaces the own record whole, and a wrong saved one heals on the next load', () => {
  const s = first();
  apply(s, { type: 'readout', full_at: T + 5 }, T);
  apply(s, world({ self: { id: P3, score_km2: 900, ink: 1, ink_updated_at: T } }), T);
  assert.deepEqual(s.self, { id: P3, score_km2: 900, ink: 1, ink_updated_at: T, full_at: null, full_seen_at: null });
  assert.equal(s.players[P3], undefined);

  const saved = JSON.parse(JSON.stringify(serialize(first())));
  saved.self.id = P1;               // what the 2026-10-09 bug left in storage: a neighbour saved as "you"
  delete saved.players[P1];
  const back = revive(saved);
  apply(back, world({ self: SELF }), T);
  apply(back, world({ players: [player(P1, 'Tessaly')] }), T);
  assert.equal(back.self.id, ME);
  assert.equal(back.players[P1].name, 'Tessaly');
});

test('later sources merge: blanks never erase what is known, the last loop only moves forward', () => {
  const s = first();
  apply(s, world({ players: [{ id: P1, name: '', color: '#445566', monogram: '', score_km2: null, last_loop_at: T - 2 * H, first_loop_at: null }] }), T);
  assert.deepEqual(s.players[P1], { id: P1, name: 'Tessaly', color: '#445566', monogram: 'Te', score_km2: 20000, last_loop_at: T - H, first_loop_at: T - 500 * H, seen_at: T });
  apply(s, world({ loops: [{ player_id: P1, at: T + 5 }, { player_id: P2, at: T - 3 * H }, { player_id: AL, at: T }] }), T);
  assert.equal(s.players[P1].last_loop_at, T + 5);
  assert.equal(s.players[P2].last_loop_at, T - H);
  assert.equal(s.players[AL], undefined);
  apply(s, world({ self: { id: ME, score_km2: null, ink: 80, ink_updated_at: T + 9 } }), T);
  assert.deepEqual([s.self.score_km2, s.self.ink, s.self.ink_updated_at], [33000, 80, T + 9]);
});

test('a new view replaces who is on screen and keeps when the others were last seen', () => {
  const s = first();
  apply(s, world({ as_of: T + 60000, in_view: [P1] }), T + 60000 - SLOW);
  assert.deepEqual(s.in_view, [P1]);
  assert.equal(s.players[P1].seen_at, T + 60000);
  assert.equal(s.players[P2].seen_at, T);
  apply(s, world({ as_of: T + 70000, players: [player(P2, 'Marrow')] }), T + 70000 - SLOW);
  assert.deepEqual(s.in_view, [P1]);
});

test('a cached answer with an older time does not move the clock back or replace a newer view', () => {
  const s = first();
  apply(s, world({ as_of: T + 5000 - 85000, players: [player(P3, 'Far away')] }), T + 5000 - SLOW);
  assert.equal(s.offset_ms, SLOW);
  assert.equal(s.last_tick_at, T);
  apply(s, world({ as_of: T - 1000, in_view: [P3] }), T + 6000 - SLOW);
  assert.deepEqual(s.in_view, [P1, P2]);
  apply(s, world({ as_of: T + 7000, in_view: [P3] }), T + 7000 - SLOW);
  assert.deepEqual(s.in_view, [P3]);
  assert.equal(s.offset_ms, SLOW);
});

test('the clock offset only tightens within a page, and a saved one gives way to the first new time', () => {
  const s = empty();
  apply(s, world({ as_of: T - 2000 }), T);
  assert.equal(s.offset_ms, -2000);
  apply(s, world({ as_of: T + 1000 - 300 }), T + 1000);
  assert.equal(s.offset_ms, -300);
  apply(s, world({ as_of: T + 2000 - 60000 }), T + 2000);
  assert.equal(s.offset_ms, -300);
  const back = revive(JSON.parse(JSON.stringify(serialize(s))));
  assert.equal(back.offset_ms, -300);
  apply(back, world({ as_of: T + 9000 - 5000 }), T + 9000);
  assert.equal(back.offset_ms, -5000);
});

test('a view brings its points and map edges, a newer view replaces them, an older one does not, and neither is saved', () => {
  const s = first();
  const edges = { west: 86, south: 21, east: 92, north: 25 };
  apply(s, world({ as_of: T + 1000, in_view: [P1, ME], pins: [{ id: P1, lat: 23, lng: 88 }, { id: ME, lat: 22.8, lng: 89.5 }], bounds: edges }), T + 1000 - SLOW);
  assert.deepEqual(s.pins, { [P1]: { lat: 23, lng: 88 }, [ME]: { lat: 22.8, lng: 89.5 } });
  assert.deepEqual(s.bounds, edges);
  apply(s, world({ as_of: T + 500, in_view: [P2], pins: [{ id: P2, lat: 1, lng: 1 }], bounds: { west: 0, south: 0, east: 1, north: 1 } }), T + 2000 - SLOW);
  assert.deepEqual(Object.keys(s.pins), [P1, ME]);
  apply(s, world({ as_of: T + 3000, in_view: [P2], pins: [{ id: P2, lat: 24, lng: 90 }] }), T + 3000 - SLOW);
  assert.deepEqual(s.pins, { [P2]: { lat: 24, lng: 90 } });
  assert.equal(s.bounds, null);
  const saved = serialize(s);
  assert.equal(saved.pins, undefined);
  assert.equal(saved.bounds, undefined);
  assert.deepEqual(revive(JSON.parse(JSON.stringify(saved))).pins, {});
});

test('a view being asked for moves the map edges at once and leaves who is on screen as it was', () => {
  const s = first();
  apply(s, world({ as_of: T + 1000, in_view: [P1], pins: [{ id: P1, lat: 23, lng: 88 }], bounds: { west: 86, south: 21, east: 92, north: 25 } }), T + 1000 - SLOW);
  const asked = { west: 80, south: 18, east: 97, north: 27 };
  apply(s, { type: 'view', bounds: asked }, T + 1500 - SLOW);
  assert.deepEqual(s.bounds, asked);
  assert.deepEqual(s.in_view, [P1]);
  assert.deepEqual(s.pins, { [P1]: { lat: 23, lng: 88 } });
  assert.equal(s.view_at, T + 1000);
});

test('land shapes are kept per player, replaced by a newer one, never kept for yourself, and never saved', () => {
  const s = first();
  const a = [[88, 23, 89, 23, 89, 24]], b = [[88, 23, 89.5, 23, 89.5, 24.5]];
  apply(s, world({ shapes: [{ id: P1, rings: a }, { id: ME, rings: a }] }), T);
  assert.deepEqual(Object.keys(s.shapes), [P1]);
  assert.equal(s.shapes[P1], a);
  apply(s, world({ shapes: [{ id: P1, rings: b }] }), T);
  assert.equal(s.shapes[P1], b);
  apply(s, world({ as_of: T + 5, players: [player(P2, 'Marrow')] }), T);
  assert.equal(s.shapes[P1], b);
  assert.equal(serialize(s).shapes, undefined);
  assert.deepEqual(revive(JSON.parse(JSON.stringify(serialize(s)))).shapes, {});
});

test('a shield end only moves forward, and a refresh without shields removes none', () => {
  const s = first();
  apply(s, world({ as_of: T + 1, shields: [{ player_id: P1, slot: 1, shield_until: T + 500 }] }), T);
  assert.equal(s.lands[P1 + ':1'].shield_until, T + 1000);
  apply(s, world({ as_of: T + 2, shields: [{ player_id: P1, slot: 1, shield_until: T + 9000 }] }), T);
  assert.equal(s.lands[P1 + ':1'].shield_until, T + 9000);
  apply(s, world({ as_of: T + 3, in_view: [P1] }), T);
  assert.equal(s.lands[P1 + ':1'].shield_until, T + 9000);
});

test('a player card adds country names and never-shielded lands', () => {
  const s = first();
  apply(s, { type: 'lands', lands: [{ player_id: P1, slot: 1, country_name: 'India', shield_until: T - 5 }, { player_id: P1, slot: 2, country_name: 'Nepal', shield_until: null }] }, T - SLOW);
  assert.deepEqual(s.lands[P1 + ':1'], { shield_until: T + 1000, country_name: 'India', seen_at: T });
  assert.deepEqual(s.lands[P1 + ':2'], { shield_until: null, country_name: 'Nepal', seen_at: T });
});

test('pin and unpin; a player that is not known cannot be pinned', () => {
  const s = first();
  apply(s, { type: 'pin', id: P1, on: true }, T);
  apply(s, { type: 'pin', id: P1, on: true }, T);
  apply(s, { type: 'pin', id: AL, on: true }, T);
  assert.deepEqual(s.pinned, [P1]);
  apply(s, { type: 'pin', id: P1, on: false }, T);
  assert.deepEqual(s.pinned, []);
});

test('shop, season, alliances and the ink readout', () => {
  const s = first();
  apply(s, { type: 'shop', lands: [{ slot: 2, shield_until: T + 2000, lock_until: T + 2000 + 15 * H }], refill: { used: 1, cap: 5, price: 600 }, resets_at: T + H, joker_next_at: null }, T);
  apply(s, { type: 'season', ends_at: T + 99 * H }, T);
  apply(s, { type: 'alliances', pairs: [[ME, AL], [P1, AL]] }, T);
  apply(s, { type: 'readout', full_at: T + 41 * 60000 }, T + 7);
  assert.equal(s.shop.lands[0].lock_until, T + 2000 + 15 * H);
  assert.equal(s.shop.refill.price, 600);
  assert.equal(s.season.ends_at, T + 99 * H);
  assert.equal(s.alliance_of[P1], AL);
  assert.equal(s.self.full_at, T + 41 * 60000);
  assert.equal(s.self.full_seen_at, T + 7);
});

test('only players seen in the last 48 hours or pinned are saved, with their lands and your own', () => {
  const s = first();
  apply(s, { type: 'pin', id: P2, on: true }, T);
  apply(s, world({ as_of: T + 49 * H, in_view: [] }), T + 49 * H);
  const saved = serialize(s);
  assert.deepEqual(Object.keys(saved.players), [P2]);
  assert.deepEqual(Object.keys(saved.lands), [ME + ':2']);
  assert.deepEqual(saved.pinned, [P2]);
  assert.equal(Object.keys(s.players).length, 3);
});

test('serialize then revive keeps what matters and drops the rest', () => {
  const s = first();
  apply(s, { type: 'pin', id: P1, on: true }, T);
  apply(s, { type: 'alliances', pairs: [[ME, AL]] }, T);
  apply(s, { type: 'readout', full_at: T + 5 }, T);
  const saved = JSON.parse(JSON.stringify(serialize(s)));
  assert.equal(saved.alliance_of, undefined);
  assert.equal(saved.in_view, undefined);
  assert.equal(saved.self.full_at, undefined);
  const back = revive(saved);
  assert.deepEqual(back.players, { [P1]: s.players[P1], [P2]: s.players[P2] });
  assert.deepEqual(back.lands, s.lands);
  assert.deepEqual(back.pinned, [P1]);
  assert.deepEqual(back.in_view, []);
  assert.equal(back.self.id, ME);
  assert.equal(back.self.full_at, null);
  assert.equal(back.last_tick_at, T);
  assert.equal(back.offset_ms, SLOW);
  assert.deepEqual(back.alliance_of, {});
});

test('revive discards anything that is not a version 1 state', () => {
  for (const bad of [null, undefined, 'x', [], {}, { v: 2, players: {} }]) assert.deepEqual(revive(bad), empty());
});

test('revive drops invalid entries instead of failing', () => {
  const back = revive({
    v: 1, self: { id: 'nope' },
    players: { [P1]: { name: 5, seen_at: T }, ['__proto__']: { seen_at: T }, [P2]: 'broken' },
    lands: { [P1 + ':1']: { shield_until: 'x', seen_at: T }, 'bad:key': { seen_at: T }, [P1 + ':7']: { seen_at: T } },
    pinned: [P1, P2, 'x'], shop: 'broken', season: null, offset_ms: 'big'
  });
  assert.equal(back.self.id, null);
  assert.deepEqual(Object.keys(back.players), [P1]);
  assert.equal(back.players[P1].name, '');
  assert.deepEqual(back.lands, { [P1 + ':1']: { shield_until: null, country_name: '', seen_at: T } });
  assert.deepEqual(back.pinned, [P1]);
  assert.deepEqual(back.shop, empty().shop);
  assert.equal(back.offset_ms, 0);
});

// After an update or a removal the old tab's script lives on without its extension, and every chrome.storage
// call throws where it stands. saver() is how the content script writes, so that such a tab stays quiet.
test('a save hands the items to the storage area and reports that it worked', async () => {
  const got = [];
  const put = IDT.store.saver(() => ({ set(items) { got.push(items); return Promise.resolve(); } }));
  assert.equal(await put({ 'state-v1': { v: 1 } }), true);
  assert.deepEqual(got, [{ 'state-v1': { v: 1 } }]);
});

test('a save the storage area turns down reports that it failed', async () => {
  const put = IDT.store.saver(() => ({ set() { return Promise.reject(new Error('QUOTA_BYTES quota exceeded')); } }));
  assert.equal(await put({ a: 1 }), false);
});

test('a save in a tab whose extension is gone throws nothing and reports that it failed', async () => {
  const gone = IDT.store.saver(() => ({ set() { throw new Error('Extension context invalidated.'); } }));
  assert.equal(await gone({ a: 1 }), false);
  const noApi = IDT.store.saver(() => { throw new TypeError("Cannot read properties of undefined (reading 'local')"); });
  assert.equal(await noApi({ a: 1 }), false);
});
