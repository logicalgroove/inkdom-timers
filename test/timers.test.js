'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IDT = require('../support/load.js')('guards.js', 'ranks.js', 'store.js', 'timers.js');
const { T, ME, P1, P2, AL, AL2, H } = require('../support/fixtures.js');

const { empty, apply } = IDT.store;
const { view, landState, inkEstimate, LOCK_MS } = IDT.timers;
const MIN = 60000;
const OK = { sawTick: true, formatMiss: false };
const id = n => 'cccccccc-0000-4000-8000-' + String(n).padStart(12, '0');
const world = extra => Object.assign({ type: 'world', as_of: null, self: null, players: [], loops: [], shields: [], in_view: null, pins: [], bounds: null, shapes: [] }, extra);
const player = (pid, name, extra) => Object.assign({ id: pid, name, color: '#112233', monogram: name.slice(0, 2).toUpperCase(), score_km2: 20000, last_loop_at: T - 10 * H, first_loop_at: T - 500 * H }, extra);

// Own record, directory, then a first view with everyone in it, as at page load.
const scene = (players, shields, localNow = T) => {
  const s = empty();
  apply(s, world({ self: { id: ME, score_km2: 33000, ink: 0, ink_updated_at: T } }), localNow);
  apply(s, world({ players }), localNow);
  apply(s, world({ as_of: T, in_view: players.map(p => p.id).concat(ME), shields: shields || [] }), localNow);
  return s;
};
const row = (vm, pid) => vm.neighbours.find(r => r.id === pid);

test('status: waiting until a refresh is seen in this page, format when one was not understood', () => {
  const s = scene([]);
  assert.equal(view(s, T, { sawTick: false, formatMiss: false }).status, 'waiting');
  assert.equal(view(s, T, OK).status, 'ok');
  assert.equal(view(s, T, { sawTick: true, formatMiss: true }).status, 'format');
  assert.equal(view(empty(), T).status, 'waiting');
});

test('status: timed data but no map view after 20 visible seconds says so', () => {
  const s = scene([]);
  const flags = extra => Object.assign({ sawTick: true, formatMiss: false, sawView: false, viewWaitMs: 0 }, extra);
  assert.equal(view(s, T, flags({ viewWaitMs: 19000 })).status, 'ok');
  assert.equal(view(s, T, flags({ viewWaitMs: 21000 })).status, 'noview');
  assert.equal(view(s, T, flags({ viewWaitMs: 99000, sawView: true })).status, 'ok');
  assert.equal(view(s, T, flags({ viewWaitMs: 99000, formatMiss: true })).status, 'format');
  assert.equal(view(s, T, flags({ viewWaitMs: 99000, sawTick: false })).status, 'waiting');
});

test('land state at each boundary', () => {
  const land = { shield_until: T };
  assert.deepEqual(landState(land, T - 1, null), { state: 'shield', until: T });
  assert.deepEqual(landState(land, T, null), { state: 'window', until: T + LOCK_MS });
  assert.deepEqual(landState(land, T + LOCK_MS - 1, null), { state: 'window', until: T + LOCK_MS });
  assert.deepEqual(landState(land, T + LOCK_MS, null), { state: 'free', until: null });
  assert.deepEqual(landState({ shield_until: null }, T, null), { state: 'free', until: null });
  assert.deepEqual(landState(undefined, T, null), { state: 'unknown', until: null });
  assert.deepEqual(landState(land, T - 1, T + 5), { state: 'safe', until: T + 5 });
  assert.deepEqual(landState(land, T - 1, T - 1), { state: 'shield', until: T });
});

test('ink estimate from the last loop', () => {
  assert.equal(inkEstimate(6598, null, T), null);
  assert.deepEqual(inkEstimate(6598, T, T), { full: false, pct: 0, at: T + 40 * MIN });
  assert.deepEqual(inkEstimate(6598, T - 14 * MIN, T), { full: false, pct: 35, at: T + 26 * MIN });
  assert.deepEqual(inkEstimate(6598, T - 13 * MIN, T), { full: false, pct: 30, at: T + 27 * MIN });
  assert.deepEqual(inkEstimate(6598, T - 40 * MIN, T), { full: true });
  assert.deepEqual(inkEstimate(6598, T + MIN, T), { full: false, pct: 0, at: T + 41 * MIN });
});

test('a shielded neighbour', () => {
  const s = scene([player(P1, 'Tessaly', { score_km2: 42179, last_loop_at: T - 95 * MIN })], [{ player_id: P1, slot: 1, shield_until: T + 683000 }]);
  const vm = view(s, T, OK);
  assert.deepEqual(vm.neighbours, [{
    id: P1, name: 'Tessaly', color: '#112233', rank: 'State', ally: false, pinned: false,
    lands: [{ slot: 1, label: '', state: 'shield', until: T + 683000 }],
    ink: { full: true }, seen_min: null
  }]);
  assert.equal(vm.open, 0);
});

test('the row flips to open the moment the shield ends, with no new data', () => {
  const s = scene([player(P1, 'Tessaly')], [{ player_id: P1, slot: 1, shield_until: T + 683000 }]);
  assert.equal(row(view(s, T + 682999, OK), P1).lands[0].state, 'shield');
  const after = view(s, T + 683000, OK);
  assert.deepEqual(row(after, P1).lands[0], { slot: 1, label: '', state: 'window', until: T + 683000 + LOCK_MS });
  assert.equal(after.open, 1);
});

test('a loop seen in the feed moves the ink estimate without a new directory', () => {
  const s = scene([player(P1, 'Marrow', { score_km2: 6598 })]);
  assert.deepEqual(row(view(s, T, OK), P1).ink, { full: true });
  apply(s, world({ as_of: T + MIN, loops: [{ player_id: P1, at: T + MIN }] }), T + MIN);
  assert.deepEqual(row(view(s, T + 15 * MIN, OK), P1).ink, { full: false, pct: 35, at: T + 41 * MIN });
});

test('no land record is unknown, a card with no shield is free, a new player is safe', () => {
  const s = scene([player(P1, 'A'), player(P2, 'B'), player(id(3), 'C', { first_loop_at: T - H })], [{ player_id: id(3), slot: 1, shield_until: T + 5 }]);
  apply(s, { type: 'lands', lands: [{ player_id: P2, slot: 1, country_name: 'Nepal', shield_until: null }] }, T);
  const vm = view(s, T, OK);
  assert.deepEqual(row(vm, P1).lands, [{ slot: 0, label: '', state: 'unknown', until: null }]);
  assert.deepEqual(row(vm, P2).lands, [{ slot: 1, label: '', state: 'free', until: null }]);
  assert.deepEqual(row(vm, id(3)).lands, [{ slot: 1, label: '', state: 'safe', until: T + 5 * H }]);
});

test('two known lands get labels', () => {
  const s = scene([player(P1, 'Halden')], [{ player_id: P1, slot: 2, shield_until: T + H }]);
  apply(s, { type: 'lands', lands: [{ player_id: P1, slot: 1, country_name: 'Nepal', shield_until: T - 10 * H }, { player_id: P1, slot: 2, country_name: '', shield_until: null }] }, T);
  assert.deepEqual(row(view(s, T, OK), P1).lands, [
    { slot: 1, label: 'Nepal', state: 'window', until: T - 10 * H + LOCK_MS },
    { slot: 2, label: 'Land 2', state: 'shield', until: T + H }
  ]);
});

test('a computer clock five minutes slow still counts down correctly', () => {
  const localNow = T - 5 * MIN;
  const s = scene([player(P1, 'Tessaly', { last_loop_at: T - 14 * MIN, score_km2: 6598 })], [{ player_id: P1, slot: 1, shield_until: T + 683000 }], localNow);
  const r = row(view(s, localNow, OK), P1);
  assert.equal(r.lands[0].until - localNow, 683000);
  assert.equal(r.ink.at - localNow, 26 * MIN);
  assert.equal(r.ink.pct, 35);
});

test('the list is the current view plus pinned players, and follows the map', () => {
  const s = scene([player(P1, 'Seen'), player(P2, 'Gone'), player(id(3), 'Pinned')]);
  apply(s, world({ players: [player(id(4), 'Elsewhere')] }), T);
  apply(s, { type: 'pin', id: id(3), on: true }, T);
  assert.deepEqual(view(s, T, OK).neighbours.map(r => r.name), ['Pinned', 'Gone', 'Seen']);
  apply(s, world({ as_of: T + MIN, in_view: [P1, ME] }), T + MIN);
  const vm = view(s, T + MIN, OK);
  assert.deepEqual(vm.neighbours.map(r => r.name), ['Pinned', 'Seen']);
  assert.equal(row(vm, id(3)).seen_min, 1);
  assert.equal(row(vm, id(3)).pinned, true);
  assert.equal(row(vm, P1).seen_min, null);
});

test('the view model carries the map edges and each on-screen player point, for the hover ring', () => {
  const s = scene([player(P1, 'Tessaly')]);
  assert.deepEqual(view(s, T, OK).map, { bounds: null, pins: {}, shapes: {} });
  const edges = { west: 86, south: 21, east: 92, north: 25 };
  apply(s, world({ as_of: T + 1, in_view: [P1, ME], pins: [{ id: P1, lat: 23, lng: 88 }], bounds: edges }), T);
  const rings = [[88, 23, 89, 23, 89, 24]];
  apply(s, world({ shapes: [{ id: P1, rings }] }), T);
  assert.deepEqual(view(s, T, OK).map, { bounds: edges, pins: { [P1]: { lat: 23, lng: 88 } }, shapes: { [P1]: rings } });
});

test('someone on screen whom no response has named yet is left out until one does', () => {
  const s = scene([player(P1, 'Known')]);
  apply(s, world({ as_of: T + 1, in_view: [P1, id(9)] }), T);
  assert.deepEqual(view(s, T, OK).neighbours.map(r => r.name), ['Known']);
  apply(s, world({ players: [player(id(9), 'Late')] }), T);
  assert.deepEqual(view(s, T, OK).neighbours.map(r => r.name), ['Known', 'Late']);
});

test('order: pinned, open with the lock running, shielded, open, unknown, new, allies', () => {
  const s = scene(
    [player(id(1), 'unknown'), player(id(2), 'free'), player(id(3), 'shield-late'), player(id(4), 'shield-soon'), player(id(5), 'window'),
      player(id(6), 'new', { first_loop_at: T - H }), player(id(7), 'ally'), player(id(8), 'pinned')],
    [{ player_id: id(3), slot: 1, shield_until: T + 5 * H }, { player_id: id(4), slot: 1, shield_until: T + H },
      { player_id: id(5), slot: 1, shield_until: T - H }, { player_id: id(7), slot: 1, shield_until: T - H }]);
  apply(s, { type: 'lands', lands: [{ player_id: id(2), slot: 1, country_name: 'X', shield_until: null }] }, T);
  apply(s, { type: 'alliances', pairs: [[ME, AL], [id(7), AL], [id(5), AL2]] }, T);
  apply(s, { type: 'pin', id: id(8), on: true }, T);
  const vm = view(s, T, OK);
  assert.deepEqual(vm.neighbours.map(r => r.name), ['pinned', 'window', 'shield-soon', 'shield-late', 'free', 'unknown', 'new', 'ally']);
  assert.equal(row(vm, id(7)).ally, true);
  assert.equal(row(vm, id(5)).ally, false);
  assert.equal(vm.open, 1);
});

test('own ink: the game readout wins while it is newer than the last ink change', () => {
  const s = scene([]);
  apply(s, { type: 'readout', full_at: T + 41 * MIN }, T + 1000);
  assert.deepEqual(view(s, T + 1000, OK).you.ink, { state: 'filling', at: T + 41 * MIN, approx: false, refill_ms: 66 * MIN });
  assert.equal(view(s, T + 41 * MIN, OK).you.ink.state, 'full');
});

test('own ink: computed from the last ink change when the readout is older or missing', () => {
  const s = scene([]);
  apply(s, { type: 'readout', full_at: T + 41 * MIN }, T + 1000);
  apply(s, world({ as_of: T + 2 * MIN, self: { id: ME, score_km2: 33000, ink: 80, ink_updated_at: T + 2 * MIN } }), T + 2 * MIN);
  assert.deepEqual(view(s, T + 2 * MIN, OK).you.ink, { state: 'filling', at: T + 35 * MIN, approx: true, refill_ms: 66 * MIN });
  assert.deepEqual(view(empty(), T, OK).you.ink, { state: 'unknown', at: null, approx: false, refill_ms: null });
});

test('own lands come from the shop and are named from land records', () => {
  const s = scene([], [{ player_id: ME, slot: 2, shield_until: T + 2000 }]);
  apply(s, { type: 'lands', lands: [{ player_id: ME, slot: 2, country_name: 'Bangladesh', shield_until: T + 2000 }] }, T);
  apply(s, {
    type: 'shop',
    lands: [{ slot: 2, shield_until: T + 2000, lock_until: T + 2000 + LOCK_MS }, { slot: 1, shield_until: T - 36 * H, lock_until: T - 20 * H }],
    refill: { used: 2, cap: 5, price: 1200 }, resets_at: T + 4 * H, joker_next_at: T + H
  }, T);
  apply(s, { type: 'season', ends_at: T + 99 * H }, T);
  const you = view(s, T, OK).you;
  assert.deepEqual(you.lands, [
    { slot: 1, name: 'Land 1', state: 'free', until: null, next: null },
    { slot: 2, name: 'Bangladesh', state: 'shield', until: T + 2000, next: T + 2000 + LOCK_MS }
  ]);
  assert.deepEqual(you.refills, { used: 2, cap: 5, price: 1200, resets_at: T + 4 * H });
  assert.deepEqual(you.joker, { ready: false, at: T + H });
  assert.deepEqual(you.season, { ends_at: T + 99 * H });
  assert.deepEqual(view(s, T + 3000, OK).you.lands[1], { slot: 2, name: 'Bangladesh', state: 'window', until: null, next: T + 2000 + LOCK_MS });
  assert.equal(view(s, T + H, OK).you.joker.ready, true);
});

test('own lands fall back to land records when the shop has not arrived', () => {
  const s = scene([], [{ player_id: ME, slot: 2, shield_until: T + 2000 }]);
  assert.deepEqual(view(s, T, OK).you.lands, [{ slot: 2, name: 'Land 2', state: 'shield', until: T + 2000, next: T + 2000 + LOCK_MS }]);
});

test('five hours in the background: same list, ended shields are open, nothing is negative', () => {
  const s = scene([player(P1, 'Tessaly'), player(P2, 'Marrow', { last_loop_at: T - 5 * MIN })], [{ player_id: P1, slot: 1, shield_until: T + 683000 }]);
  const vm = view(s, T + 5 * H, OK);
  assert.deepEqual(vm.neighbours.map(r => r.name), ['Tessaly', 'Marrow']);
  assert.deepEqual(row(vm, P1).lands[0], { slot: 1, label: '', state: 'window', until: T + 683000 + LOCK_MS });
  assert.equal(row(vm, P1).seen_min, null);
  assert.deepEqual(row(vm, P2).ink, { full: true });
});

// The developer's update of 10 October 2026, "Your shield was moving your bedtime": a land can be shielded again
// 23 hours after the purchase, not 24. So after its 8 hours of shield it is open for 15 hours before that.
test('a land can be shielded again 23 hours after the purchase', () => {
  const bought = T, land = { shield_until: bought + 8 * H };
  assert.equal(LOCK_MS, 15 * H);
  assert.deepEqual(landState(land, bought + 23 * H - 1, null), { state: 'window', until: bought + 23 * H });
  assert.deepEqual(landState(land, bought + 23 * H, null), { state: 'free', until: null });
});
