'use strict';

const T = 1_800_000_000_000;
const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const P1 = 'aaaaaaaa-0000-4000-8000-000000000002';
const P2 = 'aaaaaaaa-0000-4000-8000-000000000003';
const AL = 'bbbbbbbb-0000-4000-8000-000000000001';
const AL2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const H = 3600000;
const D = 24 * H;
const iso = ms => new Date(ms).toISOString();

function tick() {
  return {
    cfg: { poll_ms: 4000, idle_poll_ms: 8000, hidden_poll_ms: 60000 },
    as_of: iso(T),
    geo: [{
      id: ME, ink: 12.5, ink_updated_at: iso(T - 60000), name: 'Me', color: '#DB2777', monogram: 'ME', score_km2: 33464.58,
      last_loop_at: iso(T - 60000), stats: { loops: 151, firstLoopAt: T - 3 * D, giftRefillsLeft: 1 }, territory_json: [[[[89, 22], [90, 22], [90, 23], [89, 22]]]]
    }],
    view: [
      {
        id: P1, ink: 99.9, ink_updated_at: iso(T - 5000), name: 'Tessaly', color: '#3fb6c9', monogram: 'TE', score_km2: 42179,
        last_loop_at: iso(T - 95 * 60000), stats: { loops: 354, firstLoopAt: T - 12 * D, giftRefillsLeft: 2 },
        territory_json: [[[[88, 23], [89, 23], [89, 24], [88, 24], [88, 23]], [[88.4, 23.4], [88.6, 23.4], [88.6, 23.6], [88.4, 23.4]]]]
      },
      {
        id: P2, ink: 3.1, ink_updated_at: iso(T - 9000), name: 'Marrow', color: '#a77fe0', monogram: 'MA', score_km2: 6598,
        last_loop_at: iso(T - 14 * 60000), stats: { loops: 361, firstLoopAt: T - 13 * D, giftRefillsLeft: 0 }
      }
    ],
    pins: [{ id: P1, lat: 23, lng: 88 }, { id: P2, lat: 23.5, lng: 90 }, { id: ME, lat: 22.8, lng: 89.5 }],
    shields: [
      { player_id: P1, slot: 1, shield_until: iso(T + 683000), geom: { type: 'MultiPolygon', coordinates: [] } },
      { player_id: ME, slot: 2, shield_until: iso(T + 3372000), geom: { type: 'MultiPolygon', coordinates: [] } }
    ],
    claims: [], rulers: [], directory: [], style: [], self_version: 324, rulers_version: 7
  };
}

function shop() {
  return {
    ok: true,
    lands: [
      { free: false, slot: 1, price: 3023.56, active: false, locked: false, lockUntil: iso(T - 20 * H), shieldUntil: iso(T - 36 * H) },
      { free: false, slot: 2, price: 3023.56, active: true, locked: false, lockUntil: iso(T + 3372000 + 15 * H), shieldUntil: iso(T + 3372000) }
    ],
    refill: { cap: 5, used: 5, price: 4800, reason: '5/5 today' },
    joker: { face: null, price: 300, nextAt: null },
    resetsAt: iso(T + 4 * H), wallet: 11598.68, shielded: true
  };
}

function playerLands(playerId, shieldUntil) {
  return [
    { player_id: playerId, slot: 1, seed_lng: 2.6, seed_lat: 39.5, country_id: 'ESP', country_name: 'Spain', km2: 4685, people: 935320, started_at: iso(T - 3 * D), shield_until: null },
    { player_id: playerId, slot: 2, seed_lng: 89.5, seed_lat: 22.8, country_id: 'BGD', country_name: 'Bangladesh', km2: 30392, people: 55e6, started_at: iso(T - 2 * D), shield_until: shieldUntil == null ? null : iso(shieldUntil) }
  ];
}

function seasons() {
  return [{ id: 2, number: 2, name: 'Season 2', ends_at: iso(T + 11 * D), starts_at: iso(T - 3 * D) }];
}

function allianceDirectory() {
  return [
    { player_id: ME, alliances: { id: AL, name: 'First', tag: 'FI', seal: {} } },
    { player_id: P1, alliances: { id: AL2, name: 'Second', tag: 'SE', seal: {} } },
    { player_id: P2, alliances: null }
  ];
}

// Shapes below were seen in the round 3 capture on 2026-10-09.

// POST /api/read, function view_members: who is in the current map view, and its shields.
function viewMembers() {
  return {
    ids: [P1, P2],
    pins: [{ id: P1, lat: 23, lng: 88 }, { id: P2, lat: 23.5, lng: 90 }, { id: ME, lat: 22.8, lng: 89.5 }],
    as_of: iso(T), level: 0, moved: [P1], changed: [],
    shields: [{ geom: { type: 'MultiPolygon', coordinates: [] }, slot: 1, player_id: P1, shield_until: iso(T + 683000) }]
  };
}

// POST /api/read, function world_tick2: a later refresh. Lists are empty unless something changed.
function readTick() {
  return {
    cfg: { poll_ms: 4000 }, geo: [], view: [], as_of: iso(T + 8000), style: [],
    claims: [
      { id: 685011, bbox: [1, 2, 3, 4], kind: 'loop', tier: null, at_ms: T + 5000, eaten: [], player_id: P2, gained_km2: 0.3, gained_people: 1046 },
      { id: 685012, bbox: [1, 2, 3, 4], kind: 'bomb', tier: 'big', at_ms: T + 6000, eaten: [], player_id: P1, gained_km2: 9, gained_people: 5 }
    ],
    rulers: [], shields: [], view_ids: [P1, P2],
    directory: [{ id: P2, name: 'Marrow', color: '#a77fe0', people: 7e6, version: 552, monogram: 'MA', portrait: '', character: '01', score_km2: 6600, last_loop_at: iso(T + 5000) }],
    self_version: 328, rulers_version: 37333
  };
}

// GET /api/view/v1/0/2/21_5_23_7/59719369.json: every player in one map cell, full records.
function cell() {
  return { view: tick().view, as_of: iso(T), level: 0, dirty_since: null };
}

// GET /api/feed/v1/2/27400.json: the world feed of recent loops.
function feed() {
  return {
    cfg: { poll_ms: 4000 }, last: 685019, as_of: iso(T + 9000),
    claims: [{ id: 685019, bbox: [1, 2, 3, 4], kind: 'loop', tier: null, at_ms: T + 7000, eaten: [], player_id: P1, gained_km2: 1, gained_people: 400 }],
    directory: [{ id: P1, name: 'Tessaly', color: '#3fb6c9', people: 24e6, version: 1445, monogram: 'TE', portrait: '', character: '09', score_km2: 42200, last_loop_at: iso(T + 7000) }],
    rulers_version: 37333
  };
}

// GET /api/boards/v1/2/marks/119438742.json: the alliance directory again, wrapped in rows.
function marks() {
  return { rows: allianceDirectory() };
}

// Supabase players?select=...&offset=0&limit=1000: the whole player directory, loaded once per page.
function playersDirectory() {
  return [
    { id: P1, name: 'Tessaly', monogram: 'TE', color: '#3fb6c9', character: '09', portrait: '', score_km2: 42179, people: 24e6, last_loop_at: iso(T - 95 * 60000), version: 1444 },
    { id: P2, name: 'Marrow', monogram: 'MA', color: '#a77fe0', character: '01', portrait: '', score_km2: 6598, people: 7e6, last_loop_at: iso(T - 14 * 60000), version: 551 }
  ];
}

// Supabase rpc/my_player: the player's own record, the first thing loaded.
function myPlayer() {
  return Object.assign({}, tick().geo[0], { created_at: iso(T - 3 * D), last_seen_at: iso(T), peak_rank_id: 10 });
}

module.exports = {
  T, ME, P1, P2, AL, AL2, H, D, iso, tick, shop, playerLands, seasons, allianceDirectory,
  viewMembers, readTick, cell, feed, marks, playersDirectory, myPlayer
};
