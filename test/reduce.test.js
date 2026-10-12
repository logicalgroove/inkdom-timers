'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IDT = require('../support/load.js')('guards.js', 'reduce.js');
const fx = require('../support/fixtures.js');

// reduce.js runs in the page and hands over candidates; the extension's side passes each through
// guards.sanitize before using it. These tests check the pair, as content.js runs it.
const { kindOf } = IDT.reduce;
const reduce = (kind, json, body) => IDT.reduce.reduce(kind, json, body).map(IDT.guards.sanitize).filter(Boolean);

const { T, ME, P1, P2, AL, AL2, H, D } = fx;
const BASE = 'https://abc.supabase.co/rest/v1/';
const TESSALY = { id: P1, name: 'Tessaly', color: '#3fb6c9', monogram: 'TE', score_km2: 42179, last_loop_at: T - 95 * 60000, first_loop_at: T - 12 * D };
const MARROW = { id: P2, name: 'Marrow', color: '#a77fe0', monogram: 'MA', score_km2: 6598, last_loop_at: T - 14 * 60000, first_loop_at: T - 13 * D };
const ME_AS_PLAYER = { id: ME, name: 'Me', color: '#DB2777', monogram: 'ME', score_km2: 33464.58, last_loop_at: T - 60000, first_loop_at: T - 3 * D };
const world = extra => Object.assign({ type: 'world', as_of: null, self: null, players: [], loops: [], shields: [], in_view: null, pins: [], bounds: null, shapes: [] }, extra);
const P1_SHAPE = { id: P1, rings: [[88, 23, 89, 23, 89, 24, 88, 24, 88, 23], [88.4, 23.4, 88.6, 23.4, 88.6, 23.6, 88.4, 23.4]] };
const ME_SHAPE = { id: ME, rings: [[89, 22, 90, 22, 90, 23, 89, 22]] };
const PINS = [{ id: P1, lat: 23, lng: 88 }, { id: P2, lat: 23.5, lng: 90 }, { id: ME, lat: 22.8, lng: 89.5 }];
const ASK = JSON.stringify({ fn: 'view_members', args: { minx: 86.25, miny: 21.5, maxx: 91.6, maxy: 24.4, p_since: '2026-10-09T21:24:15.005Z' } });

test('kindOf matches Supabase paths and ignores the query', () => {
  assert.equal(kindOf(BASE + 'rpc/world_tick2'), 'tick');
  assert.equal(kindOf(BASE + 'rpc/econ_shop'), 'shop');
  assert.equal(kindOf(BASE + 'rpc/my_player'), 'me');
  assert.equal(kindOf(BASE + 'rpc/players_geo'), 'directory');
  assert.equal(kindOf(BASE + 'players?select=id%2Cname&offset=0&limit=1000'), 'directory');
  assert.equal(kindOf(BASE + 'player_lands?select=player_id%2Cslot&player_id=eq.' + ME), 'lands');
  assert.equal(kindOf(BASE + 'seasons?select=id&status=eq.active'), 'season');
  assert.equal(kindOf(BASE + 'alliance_members?select=player_id&offset=0&limit=1000'), 'alliances');
});

test("kindOf matches the game's own /api/ reads, relative or absolute", () => {
  assert.equal(kindOf('/api/read'), 'read');
  assert.equal(kindOf('https://inkdom.io/api/read'), 'read');
  assert.equal(kindOf('/api/view/v1/0/2/21_5_23_7/59719369.json'), 'cell');
  assert.equal(kindOf('https://inkdom.io/api/feed/v1/2/27400.json'), 'feed');
  assert.equal(kindOf('/api/boards/v1/2/marks/119438742.json'), 'marks');
});

test('kindOf ignores everything else', () => {
  const others = [BASE + 'rpc/world_tick2x', BASE + 'rpc/my_state', BASE + 'player_lands_x', '/api/errors', '/api/readx',
    '/api/boards/v1/2/rulers/5.json', '/api/tiles/v1/2/3/4/5/6.pbf', 'https://inkdom.io/play', '', null, undefined, 5, {}];
  for (const other of others) assert.equal(kindOf(other), null, String(other));
});

test('the own record comes only from my_player; a map answer never decides who you are', () => {
  // Seen live on 2026-10-09: a later answer's geo list held another player's record, and the panel took it for
  // the player's own. geo is "records sent in full", not "you".
  assert.deepEqual(reduce('me', fx.myPlayer()), [world({ self: { id: ME, score_km2: 33464.58, ink: 12.5, ink_updated_at: T - 60000 } })]);
  const other = Object.assign({}, fx.tick().view[0], { ink: 77.7 });
  const later = Object.assign(fx.readTick(), { geo: [other], claims: [], directory: [] });
  assert.deepEqual(reduce('read', later), [world({ as_of: T + 8000, players: [TESSALY], shapes: [P1_SHAPE] })]);
  const mine = Object.assign({}, fx.myPlayer(), { ink: 3.25, ink_updated_at: fx.iso(T + 7000) });
  assert.deepEqual(reduce('read', Object.assign(fx.readTick(), { geo: [other, mine], claims: [], directory: [] })), [world({
    as_of: T + 8000, self: { id: ME, score_km2: 33464.58, ink: 3.25, ink_updated_at: T + 7000 },
    players: [TESSALY, ME_AS_PLAYER], shapes: [P1_SHAPE, ME_SHAPE]
  })]);
});

test('the page-load map call becomes one world event that says nothing about who is on screen', () => {
  reduce('me', fx.myPlayer());
  assert.deepEqual(reduce('tick', fx.tick()), [world({
    as_of: T,
    self: { id: ME, score_km2: 33464.58, ink: 12.5, ink_updated_at: T - 60000 },
    players: [TESSALY, MARROW, ME_AS_PLAYER], shapes: [P1_SHAPE, ME_SHAPE],
    shields: [{ player_id: P1, slot: 1, shield_until: T + 683000 }, { player_id: ME, slot: 2, shield_until: T + 3372000 }]
  })]);
});

test('view_members says who is on screen, self included, and which shields are up', () => {
  assert.deepEqual(reduce('read', fx.viewMembers()), [world({
    as_of: T, in_view: [P1, P2, ME], pins: PINS,
    shields: [{ player_id: P1, slot: 1, shield_until: T + 683000 }]
  })]);
});

test("the map edges come from the game's own question, and only from a view_members question", () => {
  const edges = { west: 86.25, south: 21.5, east: 91.6, north: 24.4 };
  assert.deepEqual(IDT.reduce.boundsOf(ASK), edges);
  assert.deepEqual(reduce('read', fx.viewMembers(), ASK)[0].bounds, edges);
  const tickAsk = JSON.stringify({ fn: 'world_tick2', args: { minx: 1, miny: 2, maxx: 3, maxy: 4 } });
  for (const bad of [null, undefined, '', 'not json', '[]', '{}', tickAsk, JSON.stringify({ fn: 'view_members' }),
    JSON.stringify({ fn: 'view_members', args: { minx: '86', miny: 21, maxx: 91, maxy: 24 } }), 5, {}]) {
    assert.equal(IDT.reduce.boundsOf(bad), null, String(bad));
  }
  assert.equal(reduce('read', fx.readTick(), ASK)[0].bounds, null);
});

test('a later refresh carries new loops and changed players, bombs left out', () => {
  assert.deepEqual(reduce('read', fx.readTick()), [world({
    as_of: T + 8000,
    players: [{ id: P2, name: 'Marrow', color: '#a77fe0', monogram: 'MA', score_km2: 6600, last_loop_at: T + 5000, first_loop_at: null }],
    loops: [{ player_id: P2, at: T + 5000 }]
  })]);
});

test('a map cell, the feed, the directory, one player and the own record', () => {
  assert.deepEqual(reduce('cell', fx.cell()), [world({ as_of: T, players: [TESSALY, MARROW], shapes: [P1_SHAPE] })]);
  assert.deepEqual(reduce('feed', fx.feed()), [world({
    as_of: T + 9000,
    players: [{ id: P1, name: 'Tessaly', color: '#3fb6c9', monogram: 'TE', score_km2: 42200, last_loop_at: T + 7000, first_loop_at: null }],
    loops: [{ player_id: P1, at: T + 7000 }]
  })]);
  assert.deepEqual(reduce('directory', fx.playersDirectory()), [world({
    players: [Object.assign({}, TESSALY, { first_loop_at: null }), Object.assign({}, MARROW, { first_loop_at: null })]
  })]);
  assert.deepEqual(reduce('directory', [fx.tick().view[0]]), [world({ players: [TESSALY], shapes: [P1_SHAPE] })]);
  assert.deepEqual(reduce('me', fx.myPlayer()), [world({ self: { id: ME, score_km2: 33464.58, ink: 12.5, ink_updated_at: T - 60000 } })]);
});

test("other players' ink never leaves any reducer", () => {
  const withGeo = Object.assign(fx.readTick(), { geo: [Object.assign({}, fx.tick().view[0], { ink: 99.9 })] });
  const all = [['tick', fx.tick()], ['read', withGeo], ['read', fx.viewMembers()], ['read', fx.readTick()], ['cell', fx.cell()], ['feed', fx.feed()], ['directory', [fx.tick().view[0]]]];
  for (const [kind, json] of all) {
    // Checked on the raw candidate, which is what crosses from the page to the extension. Only `self` may hold ink.
    const candidate = IDT.reduce.reduce(kind, json)[0];
    const text = JSON.stringify(Object.assign({}, candidate, { self: null }));
    for (const word of ['ink', 'giftRefillsLeft', 'territory', '99.9', '3.1']) assert.equal(text.includes(word), false, kind + ' ' + word);
  }
  assert.equal(IDT.reduce.reduce('read', withGeo)[0].self, null);
});

test('a page-load map call with only as_of, or with junk in its lists, is still understood', () => {
  const bare = [world({ as_of: T })];
  assert.deepEqual(reduce('tick', { as_of: fx.iso(T) }), bare);
  assert.deepEqual(reduce('tick', { as_of: fx.iso(T), view: 'x', geo: 5, pins: {}, shields: null, claims: 7, directory: {} }), bare);
});

test('what is not understood gives no event and does not throw', () => {
  for (const bad of [null, undefined, 'x', 7, [], {}, { as_of: 'soon' }, { view: [] }]) assert.deepEqual(reduce('tick', bad), [], 'tick');
  for (const bad of [null, 'x', [], {}, { ok: true }, { ids: [P1] }, { ids: [P1], pins: [], as_of: 'soon' }]) assert.deepEqual(reduce('read', bad), [], 'read');
  for (const bad of [null, [], {}, { view: 'x' }]) assert.deepEqual(reduce('cell', bad), [], 'cell');
  for (const bad of [null, [], {}, { claims: [] }]) assert.deepEqual(reduce('feed', bad), [], 'feed');
  for (const bad of [null, {}, [], [{ peak_rank_id: 10, land_lost_at: null }]]) assert.deepEqual(reduce('directory', bad), [], 'directory');
  for (const bad of [null, [], {}, { id: 'nope' }]) assert.deepEqual(reduce('me', bad), [], 'me');
});

test('a land shape that is not rings of points is left out, without losing the player', () => {
  const odd = t => Object.assign({}, fx.tick().view[0], { territory_json: t });
  for (const t of [null, 'x', 5, {}, [], [[]], [[[]]], [[[[1, 2]]]], [[[[1, 2], [3, 4]]]], [[[['a', 'b'], [1, 2], [3, 4]]]], [[[[1], [2], [3]]]]]) {
    const out = reduce('cell', { as_of: fx.iso(T), view: [odd(t)] })[0];
    assert.deepEqual(out.shapes, [], JSON.stringify(t));
    assert.equal(out.players.length, 1);
  }
});

test('shop', () => {
  assert.deepEqual(reduce('shop', fx.shop()), [{
    type: 'shop',
    lands: [{ slot: 1, shield_until: T - 36 * H, lock_until: T - 20 * H }, { slot: 2, shield_until: T + 3372000, lock_until: T + 3372000 + 15 * H }],
    refill: { used: 5, cap: 5, price: 4800 },
    resets_at: T + 4 * H, joker_next_at: null
  }]);
  assert.deepEqual(reduce('shop', { ok: false }), []);
});

test('player lands keep the country name and a past or missing shield', () => {
  assert.deepEqual(reduce('lands', fx.playerLands(P1, T - 5 * H)), [{
    type: 'lands',
    lands: [{ player_id: P1, slot: 1, country_name: 'Spain', shield_until: null }, { player_id: P1, slot: 2, country_name: 'Bangladesh', shield_until: T - 5 * H }]
  }]);
  assert.deepEqual(reduce('lands', [{ bbox: [1, 2, 3, 4] }]), []);
});

test('season', () => {
  assert.deepEqual(reduce('season', fx.seasons()), [{ type: 'season', ends_at: T + 11 * D }]);
  assert.deepEqual(reduce('season', []), []);
});

test('the alliance directory gives pairs, from Supabase or from the marks board', () => {
  const pairs = [{ type: 'alliances', pairs: [[ME, AL], [P1, AL2]] }];
  assert.deepEqual(reduce('alliances', fx.allianceDirectory()), pairs);
  assert.deepEqual(reduce('marks', fx.marks()), pairs);
  assert.deepEqual(reduce('alliances', [{ alliance_id: AL, role: 'member' }]), []);
  assert.deepEqual(reduce('alliances', [{ player_id: P1, role: 'member', joined_at: fx.iso(T), players: { name: 'x' } }]), []);
  assert.deepEqual(reduce('marks', { rows: 'x' }), []);
});

test('an unknown kind gives no event', () => {
  assert.deepEqual(reduce('players', [{ id: ME }]), []);
  assert.deepEqual(reduce('constructor', {}), []);
});
