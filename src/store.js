(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});
  const { isObj, num, ts, isId, text, color, sanitize } = IDT.guards;

  const KEEP_MS = 48 * 3600 * 1000;
  const MAX_SHAPES = 400; // land outlines held at once; past that, only players in view, pinned or just sent are kept
  const LAND_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[123]$/i;

  function empty() {
    return {
      v: 1,
      self: { id: null, score_km2: null, ink: null, ink_updated_at: null, full_at: null, full_seen_at: null },
      shop: { lands: [], refill: { used: null, cap: null, price: null }, resets_at: null, joker_next_at: null },
      season: { ends_at: null },
      players: {},      // every player the game has told us about; seen_at is the last time they were on screen
      lands: {},        // playerId:slot -> { shield_until, country_name, seen_at }
      alliance_of: {},
      pinned: [],
      in_view: [],      // who the game says is in the current map view
      pins: {},         // id -> { lat, lng }: a point inside each of those players' land
      bounds: null,     // the map edges the game asked that view for
      shapes: {},       // id -> rings: the land outline of each player sent in full; memory only
      view_at: null,    // the server time that view is from
      last_tick_at: null,
      offset_ms: 0,     // server time minus this computer's time
      offset_live: false // false until this page load has seen a server time
    };
  }

  function upsertLand(state, playerId, slot, patch, seenAt) {
    const key = playerId + ':' + slot;
    const land = state.lands[key] || { shield_until: null, country_name: '', seen_at: seenAt };
    if (patch.shield_until != null && (land.shield_until == null || patch.shield_until > land.shield_until)) land.shield_until = patch.shield_until;
    if (patch.country_name) land.country_name = patch.country_name;
    land.seen_at = seenAt;
    state.lands[key] = land;
  }

  function mergePlayer(state, p) {
    const cur = state.players[p.id] || (state.players[p.id] = {
      id: p.id, name: '', color: p.color, monogram: '', score_km2: null, last_loop_at: null, first_loop_at: null, seen_at: null
    });
    if (p.name) cur.name = p.name;
    if (p.monogram) cur.monogram = p.monogram;
    cur.color = p.color;
    if (p.score_km2 != null) cur.score_km2 = p.score_km2;
    if (p.last_loop_at != null && (cur.last_loop_at == null || p.last_loop_at > cur.last_loop_at)) cur.last_loop_at = p.last_loop_at;
    if (p.first_loop_at != null) cur.first_loop_at = p.first_loop_at;
  }

  // Mutates and returns state. localNow is this computer's clock in epoch milliseconds.
  // Every event is an upsert: a player or shield missing from a response is left as it was.
  // Only in_view replaces what was there, because it is the game's full answer for the current view.
  function apply(state, e, localNow) {
    switch (e.type) {
      case 'world': {
        if (e.as_of != null) {
          // as_of is when the data was current, and cached answers can be a minute and a half old.
          // The freshest answer gives the largest difference, so within a page the offset only tightens upward.
          const candidate = e.as_of - localNow;
          if (!state.offset_live || candidate > state.offset_ms) state.offset_ms = candidate;
          state.offset_live = true;
          if (state.last_tick_at == null || e.as_of > state.last_tick_at) state.last_tick_at = e.as_of;
        }
        const serverNow = localNow + state.offset_ms;
        if (e.self) {
          // Another id means another account, or a saved record that was wrong. Start the own record over.
          if (state.self.id != null && e.self.id !== state.self.id) state.self = empty().self;
          for (const k of ['id', 'score_km2', 'ink', 'ink_updated_at']) if (e.self[k] != null) state.self[k] = e.self[k];
        }
        if (state.self.id) delete state.players[state.self.id];
        for (const s of e.shapes || []) if (s.id !== state.self.id) state.shapes[s.id] = s.rings;
        if (Object.keys(state.shapes).length > MAX_SHAPES) {
          const keep = new Set(state.in_view.concat(state.pinned, (e.shapes || []).map(s => s.id)));
          for (const id of Object.keys(state.shapes)) if (!keep.has(id)) delete state.shapes[id];
        }
        for (const p of e.players) if (p.id !== state.self.id) mergePlayer(state, p);
        for (const l of e.loops) {
          const cur = state.players[l.player_id];
          if (cur && (cur.last_loop_at == null || l.at > cur.last_loop_at)) cur.last_loop_at = l.at;
        }
        for (const s of e.shields) upsertLand(state, s.player_id, s.slot, s, serverNow);
        if (e.in_view && (state.view_at == null || e.as_of == null || e.as_of >= state.view_at)) {
          state.view_at = e.as_of;
          state.in_view = e.in_view.filter(id => id !== state.self.id);
          state.pins = {};
          for (const p of e.pins || []) state.pins[p.id] = { lat: p.lat, lng: p.lng };
          state.bounds = e.bounds || null;
          for (const id of state.in_view) if (state.players[id]) state.players[id].seen_at = serverNow;
        }
        break;
      }
      case 'view':
        // The game has just asked who is in a view: the map is there now, before the answer says who.
        state.bounds = e.bounds;
        break;
      case 'lands':
        for (const l of e.lands) upsertLand(state, l.player_id, l.slot, l, localNow + state.offset_ms);
        break;
      case 'shop':
        state.shop = { lands: e.lands, refill: e.refill, resets_at: e.resets_at, joker_next_at: e.joker_next_at };
        break;
      case 'season':
        state.season = { ends_at: e.ends_at };
        break;
      case 'alliances':
        for (const [playerId, allianceId] of e.pairs) state.alliance_of[playerId] = allianceId;
        break;
      case 'readout':
        state.self.full_at = e.full_at;
        state.self.full_seen_at = localNow;
        break;
      case 'pin': {
        const i = state.pinned.indexOf(e.id);
        if (e.on && i < 0 && state.players[e.id]) state.pinned.push(e.id);
        if (!e.on && i >= 0) state.pinned.splice(i, 1);
        break;
      }
    }
    return state;
  }

  // What goes to chrome.storage: the players seen on screen in the last 48 hours or pinned, their lands,
  // and the player's own. The directory, the alliance list and the current view are reloaded with the page.
  function serialize(state) {
    const s = state.self, now = state.last_tick_at, players = {}, lands = {};
    for (const [id, p] of Object.entries(state.players)) {
      if (state.pinned.includes(id) || (p.seen_at != null && now != null && now - p.seen_at <= KEEP_MS)) players[id] = p;
    }
    for (const [key, land] of Object.entries(state.lands)) {
      const id = key.slice(0, 36);
      if (id === s.id || players[id]) lands[key] = land;
    }
    return {
      v: 1,
      self: { id: s.id, score_km2: s.score_km2, ink: s.ink, ink_updated_at: s.ink_updated_at },
      shop: state.shop, season: state.season, players, lands, pinned: state.pinned.filter(id => players[id]),
      last_tick_at: state.last_tick_at, offset_ms: state.offset_ms
    };
  }

  function revive(raw) {
    const state = empty();
    if (!isObj(raw) || raw.v !== 1) return state;
    if (isObj(raw.self) && isId(raw.self.id)) {
      Object.assign(state.self, { id: raw.self.id, score_km2: num(raw.self.score_km2), ink: num(raw.self.ink), ink_updated_at: ts(raw.self.ink_updated_at) });
    }
    const shop = sanitize(Object.assign({}, isObj(raw.shop) ? raw.shop : {}, { type: 'shop' }));
    state.shop = { lands: shop.lands, refill: shop.refill, resets_at: shop.resets_at, joker_next_at: shop.joker_next_at };
    state.season.ends_at = isObj(raw.season) ? ts(raw.season.ends_at) : null;
    for (const [id, p] of Object.entries(isObj(raw.players) ? raw.players : {})) {
      if (!isId(id) || !isObj(p)) continue;
      state.players[id] = {
        id, name: text(p.name, 40), color: color(p.color), monogram: text(p.monogram, 4), score_km2: num(p.score_km2),
        last_loop_at: ts(p.last_loop_at), first_loop_at: ts(p.first_loop_at), seen_at: ts(p.seen_at)
      };
    }
    for (const [key, l] of Object.entries(isObj(raw.lands) ? raw.lands : {})) {
      if (!LAND_KEY.test(key) || !isObj(l) || ts(l.seen_at) == null) continue;
      state.lands[key] = { shield_until: ts(l.shield_until), country_name: text(l.country_name, 40), seen_at: l.seen_at };
    }
    state.pinned = (Array.isArray(raw.pinned) ? raw.pinned : []).filter(id => isId(id) && state.players[id]);
    state.last_tick_at = ts(raw.last_tick_at);
    state.offset_ms = num(raw.offset_ms) || 0;
    return state;
  }

  // area() returns chrome.storage.local. The returned function writes to it and resolves to whether that worked.
  // It never throws: in a tab left over from before an update or a removal, chrome.storage itself does.
  function saver(area) {
    return items => {
      try {
        return area().set(items).then(() => true, () => false);
      } catch (_) {
        return Promise.resolve(false);
      }
    };
  }

  IDT.store = { empty, apply, serialize, revive, saver };
})(globalThis);
