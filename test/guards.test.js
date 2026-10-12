'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IDT = require('../support/load.js')('guards.js');

const { sanitize, toMs, text, isId, color } = IDT.guards;
const T = 1_800_000_000_000;
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'aaaaaaaa-0000-4000-8000-000000000002';
const C = 'bbbbbbbb-0000-4000-8000-000000000001';
const nth = i => 'aaaaaaaa-0000-4000-8000-' + String(i).padStart(12, '0');

test('toMs reads ISO strings and positive numbers only', () => {
  assert.equal(toMs('2027-01-15T08:00:00.000Z'), T);
  assert.equal(toMs(T), T);
  for (const bad of ['nope', 0, -5, null, {}, NaN, Infinity]) assert.equal(toMs(bad), null);
});

test('text cuts by character, not by code unit, and rejects non-strings', () => {
  assert.equal(text('a'.repeat(60), 40).length, 40);
  assert.equal(text('😀😀😀', 2), '😀😀');
  assert.equal(text('<img src=x onerror=alert(1)>', 40), '<img src=x onerror=alert(1)>');
  assert.equal(text(5, 40), '');
});

test('isId accepts UUIDs only, so no key can be __proto__', () => {
  assert.equal(isId(A), true);
  for (const bad of ['__proto__', 'constructor', '', A + 'x', 5, null]) assert.equal(isId(bad), false);
});

test('color falls back to grey', () => {
  assert.equal(color('#DB2777'), '#DB2777');
  assert.equal(color('red'), '#888888');
  assert.equal(color('#fff'), '#888888');
});

test('world keeps only the listed fields', () => {
  const out = sanitize({
    type: 'world', as_of: T, junk: 1,
    self: { id: A, score_km2: 10, ink: 5, ink_updated_at: T - 1, name: 'me' },
    players: [
      { id: B, name: 'x'.repeat(60), color: 'red', monogram: 'ABCDEFG', score_km2: '9', last_loop_at: T - 2, first_loop_at: T - 3, ink: 99, ink_updated_at: T, giftRefillsLeft: 2 },
      { id: 'not-a-uuid', name: 'bad' },
      null
    ],
    loops: [{ player_id: B, at: T - 9, gained_km2: 3 }, { player_id: 'x', at: T }, { player_id: B, at: 'now' }],
    shields: [{ player_id: B, slot: 1, shield_until: T + 5, geom: {} }, { player_id: B, slot: 9, shield_until: T }, { player_id: B, slot: 2 }],
    in_view: [B, 'x', 7, A]
  });
  assert.deepEqual(out, {
    type: 'world', as_of: T,
    self: { id: A, score_km2: 10, ink: 5, ink_updated_at: T - 1 },
    players: [{ id: B, name: 'x'.repeat(40), color: '#888888', monogram: 'ABCD', score_km2: null, last_loop_at: T - 2, first_loop_at: T - 3 }],
    loops: [{ player_id: B, at: T - 9 }],
    shields: [{ player_id: B, slot: 1, shield_until: T + 5 }],
    in_view: [B, A], pins: [], bounds: null, shapes: []
  });
});

test('world: a land shape is rings of plain numbers, and anything else in it is dropped', () => {
  const ring = [88, 23, 89, 23, 89, 24];
  const out = sanitize({
    type: 'world',
    shapes: [
      { id: B, rings: [ring, [1, 2, 3, 4], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 'x'], 'no', [1, 2, 3, 4, 5, Infinity]], name: 'x' },
      { id: 'nope', rings: [ring] }, { id: A, rings: [] }, { id: A }, null
    ]
  });
  assert.deepEqual(out.shapes, [{ id: B, rings: [ring] }]);
  const huge = Array.from({ length: 70000 }, (_, i) => i % 90);
  assert.deepEqual(sanitize({ type: 'world', as_of: T, shapes: [{ id: B, rings: [huge] }] }).shapes, []);
  const many = Array.from({ length: 450 }, () => ring);
  assert.equal(sanitize({ type: 'world', as_of: T, shapes: [{ id: B, rings: many }] }).shapes[0].rings.length, 400);
});

test('world: pins need a real id and a real place, map edges need all four numbers the right way round', () => {
  const ok = { west: 86.2, south: 21.5, east: 91.6, north: 24.4 };
  const out = sanitize({
    type: 'world', as_of: T, in_view: [B],
    pins: [{ id: B, lat: 23, lng: 88, name: 'x' }, { id: 'nope', lat: 1, lng: 1 }, { id: A, lat: 91, lng: 0 }, { id: A, lat: 0, lng: 'east' }, null],
    bounds: Object.assign({ junk: 1 }, ok)
  });
  assert.deepEqual(out.pins, [{ id: B, lat: 23, lng: 88 }]);
  assert.deepEqual(out.bounds, ok);
  for (const bad of [null, 'x', {}, { west: 1, south: 2, east: 3 }, { west: 1, south: 5, east: 3, north: 2 }, { west: 1, south: 2, east: 1, north: 3 },
    { west: 1, south: -95, east: 3, north: 2 }, { west: NaN, south: 1, east: 3, north: 2 }]) {
    assert.equal(sanitize({ type: 'world', as_of: T, bounds: bad }).bounds, null, JSON.stringify(bad));
  }
});

test('world: as_of is optional, a missing in_view is null, an empty list stays a list', () => {
  assert.deepEqual(sanitize({ type: 'world', players: [{ id: B, name: 'n' }] }), {
    type: 'world', as_of: null, self: null,
    players: [{ id: B, name: 'n', color: '#888888', monogram: '', score_km2: null, last_loop_at: null, first_loop_at: null }],
    loops: [], shields: [], in_view: null, pins: [], bounds: null, shapes: []
  });
  assert.deepEqual(sanitize({ type: 'world', as_of: T, in_view: [] }), { type: 'world', as_of: T, self: null, players: [], loops: [], shields: [], in_view: [], pins: [], bounds: null, shapes: [] });
});

test('world with nothing in it is rejected, and list sizes are capped', () => {
  assert.equal(sanitize({ type: 'world' }), null);
  assert.equal(sanitize({ type: 'world', players: [{ id: 'bad' }], loops: 'x' }), null);
  const many = Array.from({ length: 2500 }, (_, i) => ({ id: nth(i) }));
  assert.equal(sanitize({ type: 'world', players: many }).players.length, 2000);
});

test('shop, lands, season and alliances', () => {
  assert.deepEqual(
    sanitize({ type: 'shop', lands: [{ slot: 2, shield_until: T, lock_until: T + 1, price: 5 }, { slot: 7 }], refill: { used: 5, cap: 5, price: 4800, reason: 'x' }, resets_at: T + 2, joker_next_at: null }),
    { type: 'shop', lands: [{ slot: 2, shield_until: T, lock_until: T + 1 }], refill: { used: 5, cap: 5, price: 4800 }, resets_at: T + 2, joker_next_at: null });
  assert.deepEqual(
    sanitize({ type: 'lands', lands: [{ player_id: A, slot: 1, country_name: 'Spain', shield_until: null, km2: 4 }, { player_id: 'x', slot: 1 }] }),
    { type: 'lands', lands: [{ player_id: A, slot: 1, country_name: 'Spain', shield_until: null }] });
  assert.equal(sanitize({ type: 'lands', lands: [] }), null);
  assert.deepEqual(sanitize({ type: 'season', ends_at: T }), { type: 'season', ends_at: T });
  assert.equal(sanitize({ type: 'season', ends_at: 'soon' }), null);
  assert.deepEqual(sanitize({ type: 'alliances', pairs: [[A, C], [B], ['x', C], 'no'] }), { type: 'alliances', pairs: [[A, C]] });
  assert.equal(sanitize({ type: 'alliances', pairs: [] }), null);
});

test('a land list of 170 rows, as the game sends for the leaderboard, is kept whole', () => {
  const rows = Array.from({ length: 170 }, (_, i) => ({ player_id: nth(i), slot: 1, country_name: 'X', shield_until: T }));
  assert.equal(sanitize({ type: 'lands', lands: rows }).lands.length, 170);
});

test('anything else is rejected', () => {
  for (const bad of [null, 5, 'world', [], {}, { type: 'tick', as_of: T }, { type: 'pin', id: A }, { type: 'readout', full_at: T }]) assert.equal(sanitize(bad), null);
});
