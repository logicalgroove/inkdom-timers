(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  // This file and tap.js are the only ones that run in the page's own world, so it depends on nothing.
  // Chrome runs a content-script file once per frame: a helper shared with the extension's side would run
  // in one world only. What leaves here is a candidate event; the extension's side checks every field of it.
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const arr = v => (Array.isArray(v) ? v : []);
  const hasId = v => isObj(v) && typeof v.id === 'string';
  function toMs(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
    if (typeof v !== 'string') return null;
    const t = Date.parse(v);
    return Number.isNaN(t) || t <= 0 ? null : t;
  }

  // The game talks to two places: its Supabase backend, and its own cached reads under /api/.
  // Only the first map call of a page load goes to Supabase; later ones go through /api/read.
  const KINDS = [
    [/\/rest\/v1\/rpc\/world_tick2(?:[?#]|$)/, 'tick'],
    [/\/api\/read(?:[?#]|$)/, 'read'],
    [/\/api\/view\/[^?#]+\.json(?:[?#]|$)/, 'cell'],
    [/\/api\/feed\/[^?#]+\.json(?:[?#]|$)/, 'feed'],
    [/\/api\/boards\/[^?#]+\/marks\/[^?#]+\.json(?:[?#]|$)/, 'marks'],
    [/\/rest\/v1\/players(?:[?#]|$)/, 'directory'],
    [/\/rest\/v1\/rpc\/players_geo(?:[?#]|$)/, 'directory'],
    [/\/rest\/v1\/rpc\/my_player(?:[?#]|$)/, 'me'],
    [/\/rest\/v1\/rpc\/econ_shop(?:[?#]|$)/, 'shop'],
    [/\/rest\/v1\/player_lands(?:[?#]|$)/, 'lands'],
    [/\/rest\/v1\/seasons(?:[?#]|$)/, 'season'],
    [/\/rest\/v1\/alliance_members(?:[?#]|$)/, 'alliances']
  ];

  function kindOf(url) {
    if (typeof url !== 'string') return null;
    for (const [re, kind] of KINDS) if (re.test(url)) return kind;
    return null;
  }

  // Player records also carry ink, ink_updated_at and stats.giftRefillsLeft. They are not copied.
  const person = p => ({
    id: p.id, name: p.name, color: p.color, monogram: p.monogram, score_km2: p.score_km2,
    last_loop_at: toMs(p.last_loop_at), first_loop_at: isObj(p.stats) ? toMs(p.stats.firstLoopAt) : null
  });
  const people = list => arr(list).filter(hasId).map(person);

  // A player's land as the game sends it: polygons of rings of [lng, lat] points. Flattened to rings of
  // numbers, which is all an outline needs. This is the shape the map already draws for everyone.
  const MAX_RINGS = 400, MAX_NUMBERS = 60000;
  function ringsOf(territory) {
    const rings = [];
    let total = 0;
    for (const polygon of arr(territory)) {
      for (const ring of arr(polygon)) {
        if (!Array.isArray(ring) || rings.length >= MAX_RINGS) continue;
        const flat = [];
        for (const pt of ring) if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') flat.push(pt[0], pt[1]);
        if (flat.length < 6 || total + flat.length > MAX_NUMBERS) continue;
        total += flat.length;
        rings.push(flat);
      }
    }
    return rings;
  }
  const shapesOf = list => arr(list).filter(hasId).map(p => ({ id: p.id, rings: ringsOf(p.territory_json) })).filter(s => s.rings.length);
  const loops = list => arr(list).filter(c => isObj(c) && c.kind === 'loop').map(c => ({ player_id: c.player_id, at: c.at_ms }));
  const shields = list => arr(list).filter(isObj).map(s => ({ player_id: s.player_id, slot: s.slot, shield_until: toMs(s.shield_until) }));
  const own = m => (isObj(m) ? { id: m.id, score_km2: m.score_km2, ink: m.ink, ink_updated_at: toMs(m.ink_updated_at) } : null);
  const alliancePairs = rows => {
    const pairs = arr(rows).filter(r => isObj(r) && isObj(r.alliances)).map(r => [r.player_id, r.alliances.id]);
    return pairs.length ? { type: 'alliances', pairs } : null;
  };

  // The player's own id, learned from rpc/my_player: the only response that is certainly their own record.
  let ownId = null;

  // world_tick2, whether the full page-load answer or a later one with only what changed.
  // Its view is whatever area was asked for, which at page load is not where the player is looking,
  // so it never says who is on screen. Its geo list is "records sent in full": the player's own at page
  // load, other players' later. Only the entry with the player's own id is read as the own record;
  // from every other entry the same public fields are taken as from any player, and no ink.
  function tick(j) {
    if (!isObj(j) || toMs(j.as_of) == null) return null;
    const geo = arr(j.geo).filter(hasId);
    return {
      type: 'world', as_of: toMs(j.as_of), self: own(ownId == null ? null : geo.find(p => p.id === ownId)),
      players: people(j.view).concat(people(j.directory), people(geo)), loops: loops(j.claims), shields: shields(j.shields),
      shapes: shapesOf(j.view).concat(shapesOf(geo))
    };
  }

  // The one thing ever read from a request: the four map edges in the game's own "who is in view" question.
  // They are needed to work out where on the screen a map position falls. `body` is that request's text.
  function boundsOf(body) {
    if (typeof body !== 'string') return null;
    let q;
    try { q = JSON.parse(body); } catch (_) { return null; }
    if (!isObj(q) || q.fn !== 'view_members' || !isObj(q.args)) return null;
    const a = q.args, ok = v => typeof v === 'number' && Number.isFinite(v);
    return ok(a.minx) && ok(a.miny) && ok(a.maxx) && ok(a.maxy) ? { west: a.minx, south: a.miny, east: a.maxx, north: a.maxy } : null;
  }

  // view_members: the ids and pins of everyone in the current map view, and the shields there.
  // A pin is a point inside a player's land; for a small land it is where the game draws the avatar.
  function members(j, body) {
    if (toMs(j.as_of) == null) return null;
    const pins = arr(j.pins).filter(hasId);
    const ids = arr(j.ids).concat(pins.map(p => p.id));
    return {
      type: 'world', as_of: toMs(j.as_of), shields: shields(j.shields), in_view: Array.from(new Set(ids)),
      pins: pins.map(p => ({ id: p.id, lat: p.lat, lng: p.lng })), bounds: boundsOf(body)
    };
  }

  const candidates = {
    tick,
    // /api/read answers several functions; they are told apart by shape, never by reading the request.
    read(j, body) {
      if (!isObj(j)) return null;
      if (Array.isArray(j.ids) && Array.isArray(j.pins)) return members(j, body);
      if (isObj(j.cfg) || Array.isArray(j.view_ids)) return tick(j);
      return null;
    },
    cell(j) {
      return isObj(j) && Array.isArray(j.view) ? { type: 'world', as_of: toMs(j.as_of), players: people(j.view), shapes: shapesOf(j.view) } : null;
    },
    feed(j) {
      return isObj(j) ? { type: 'world', as_of: toMs(j.as_of), players: people(j.directory), loops: loops(j.claims) } : null;
    },
    directory(j) {
      const players = people(j);
      return players.length ? { type: 'world', players, shapes: shapesOf(j) } : null;
    },
    me(j) {
      if (!hasId(j)) return null;
      ownId = j.id;
      return { type: 'world', self: own(j) };
    },
    marks(j) {
      return alliancePairs(isObj(j) ? j.rows : null);
    },
    alliances(j) {
      return alliancePairs(j);
    },
    shop(j) {
      if (!isObj(j) || !Array.isArray(j.lands)) return null;
      return {
        type: 'shop',
        lands: j.lands.filter(isObj).map(l => ({ slot: l.slot, shield_until: toMs(l.shieldUntil), lock_until: toMs(l.lockUntil) })),
        refill: j.refill,
        resets_at: toMs(j.resetsAt),
        joker_next_at: isObj(j.joker) ? toMs(j.joker.nextAt) : null
      };
    },
    lands(j) {
      const lands = arr(j).filter(l => isObj(l) && typeof l.player_id === 'string')
        .map(l => ({ player_id: l.player_id, slot: l.slot, country_name: l.country_name, shield_until: toMs(l.shield_until) }));
      return lands.length ? { type: 'lands', lands } : null;
    },
    season(j) {
      const row = arr(j).filter(isObj).find(s => toMs(s.ends_at) != null);
      return row ? { type: 'season', ends_at: toMs(row.ends_at) } : null;
    }
  };

  function reduce(kind, json, body) {
    if (!Object.prototype.hasOwnProperty.call(candidates, kind)) return [];
    try {
      const candidate = candidates[kind](json, body);
      return candidate ? [candidate] : [];
    } catch (_) {
      return [];
    }
  }

  IDT.reduce = { kindOf, reduce, boundsOf };
})(globalThis);
