(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LIMIT = { players: 2000, loops: 500, shields: 500, in_view: 1000, lands: 400, pairs: 5000, shapes: 200, rings: 400, numbers: 60000 };

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const arr = v => (Array.isArray(v) ? v : []);
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const ts = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const isId = v => typeof v === 'string' && UUID.test(v);
  const isSlot = v => v === 1 || v === 2 || v === 3;
  const text = (v, max) => (typeof v === 'string' ? Array.from(v).slice(0, max).join('') : '');
  const color = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#888888');

  const isLat = v => num(v) != null && v >= -90 && v <= 90;
  const isLng = v => num(v) != null && v >= -540 && v <= 540;

  // The map edges the game asked for: all four numbers, north above south, some width.
  function edges(b) {
    if (!isObj(b) || !isLng(b.west) || !isLng(b.east) || !isLat(b.south) || !isLat(b.north)) return null;
    if (!(b.north > b.south) || b.west === b.east) return null;
    return { west: b.west, south: b.south, east: b.east, north: b.north };
  }

  // A land shape: rings of lng, lat numbers, flat. It is the outline the map already draws.
  function shape(s) {
    if (!isObj(s) || !isId(s.id)) return null;
    const rings = [];
    let total = 0;
    for (const ring of arr(s.rings)) {
      if (rings.length >= LIMIT.rings) break;
      if (!Array.isArray(ring) || ring.length < 6 || ring.length % 2 || total + ring.length > LIMIT.numbers) continue;
      if (!ring.every(n => typeof n === 'number' && Number.isFinite(n))) continue;
      total += ring.length;
      rings.push(ring);
    }
    return rings.length ? { id: s.id, rings } : null;
  }

  function toMs(v) {
    if (typeof v === 'number') return ts(v);
    if (typeof v !== 'string') return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : ts(t);
  }

  function sanitize(e) {
    if (!isObj(e)) return null;
    switch (e.type) {
      case 'world': {
        const s = e.self;
        const out = {
          type: 'world',
          as_of: ts(e.as_of),
          self: isObj(s) && isId(s.id) ? { id: s.id, score_km2: num(s.score_km2), ink: num(s.ink), ink_updated_at: ts(s.ink_updated_at) } : null,
          players: arr(e.players).slice(0, LIMIT.players).filter(p => isObj(p) && isId(p.id)).map(p => ({
            id: p.id, name: text(p.name, 40), color: color(p.color), monogram: text(p.monogram, 4),
            score_km2: num(p.score_km2), last_loop_at: ts(p.last_loop_at), first_loop_at: ts(p.first_loop_at)
          })),
          loops: arr(e.loops).slice(0, LIMIT.loops).filter(l => isObj(l) && isId(l.player_id) && ts(l.at) != null)
            .map(l => ({ player_id: l.player_id, at: l.at })),
          shields: arr(e.shields).slice(0, LIMIT.shields)
            .filter(x => isObj(x) && isId(x.player_id) && isSlot(x.slot) && ts(x.shield_until) != null)
            .map(x => ({ player_id: x.player_id, slot: x.slot, shield_until: x.shield_until })),
          in_view: Array.isArray(e.in_view) ? e.in_view.slice(0, LIMIT.in_view).filter(isId) : null,
          pins: arr(e.pins).slice(0, LIMIT.in_view).filter(p => isObj(p) && isId(p.id) && isLat(p.lat) && isLng(p.lng))
            .map(p => ({ id: p.id, lat: p.lat, lng: p.lng })),
          bounds: edges(e.bounds),
          shapes: arr(e.shapes).slice(0, LIMIT.shapes).map(shape).filter(Boolean)
        };
        const empty = out.as_of == null && !out.self && !out.players.length && !out.loops.length && !out.shields.length && !out.in_view && !out.shapes.length;
        return empty ? null : out;
      }
      case 'view': {
        const bounds = edges(e.bounds);
        return bounds ? { type: 'view', bounds } : null;
      }
      case 'shop': {
        const r = isObj(e.refill) ? e.refill : {};
        return {
          type: 'shop',
          lands: arr(e.lands).slice(0, 3).filter(l => isObj(l) && isSlot(l.slot))
            .map(l => ({ slot: l.slot, shield_until: ts(l.shield_until), lock_until: ts(l.lock_until) })),
          refill: { used: num(r.used), cap: num(r.cap), price: num(r.price) },
          resets_at: ts(e.resets_at), joker_next_at: ts(e.joker_next_at)
        };
      }
      case 'lands': {
        const lands = arr(e.lands).slice(0, LIMIT.lands).filter(l => isObj(l) && isId(l.player_id) && isSlot(l.slot))
          .map(l => ({ player_id: l.player_id, slot: l.slot, country_name: text(l.country_name, 40), shield_until: ts(l.shield_until) }));
        return lands.length ? { type: 'lands', lands } : null;
      }
      case 'season': {
        const ends_at = ts(e.ends_at);
        return ends_at == null ? null : { type: 'season', ends_at };
      }
      case 'alliances': {
        const pairs = arr(e.pairs).slice(0, LIMIT.pairs).filter(p => Array.isArray(p) && isId(p[0]) && isId(p[1])).map(p => [p[0], p[1]]);
        return pairs.length ? { type: 'alliances', pairs } : null;
      }
      default:
        return null;
    }
  }

  IDT.guards = { isObj, arr, num, ts, isId, isSlot, text, color, toMs, sanitize };
})(globalThis);
