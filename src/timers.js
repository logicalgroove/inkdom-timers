(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});
  const { rankFor } = IDT.ranks;

  const HOUR = 3600 * 1000;
  const LOCK_MS = 15 * HOUR; // a land can be shielded again 23 h after purchase: 8 h of shield, then 15 h open
  const SAFE_MS = 6 * HOUR;  // new-player protection after the first loop
  const VIEW_WAIT_MS = 20 * 1000; // timed data but no map view for this long, with the tab in front, is worth a note
  const ORDER = { window: 1, shield: 2, free: 3, unknown: 4, safe: 5 };

  // Server time in, server time out.
  function landState(land, t, safeUntil) {
    if (safeUntil != null && safeUntil > t) return { state: 'safe', until: safeUntil };
    if (!land) return { state: 'unknown', until: null };
    if (land.shield_until == null) return { state: 'free', until: null };
    if (land.shield_until > t) return { state: 'shield', until: land.shield_until };
    if (land.shield_until + LOCK_MS > t) return { state: 'window', until: land.shield_until + LOCK_MS };
    return { state: 'free', until: null };
  }

  // Assumes the last loop emptied the tank, so the real figure is usually higher.
  function inkEstimate(km2, lastLoopAt, t) {
    if (lastLoopAt == null) return null;
    const refill = rankFor(km2).refillMin * 60000, gone = t - lastLoopAt;
    if (gone >= refill) return { full: true };
    return { full: false, pct: Math.max(0, Math.floor((100 * gone) / refill / 5) * 5), at: lastLoopAt + refill };
  }

  function ownInk(state, localNow, local) {
    const s = state.self;
    const refill_ms = s.score_km2 == null ? null : rankFor(s.score_km2).refillMin * 60000;
    const readoutIsCurrent = s.full_at != null && (s.ink_updated_at == null || s.full_seen_at == null || s.full_seen_at >= local(s.ink_updated_at));
    if (readoutIsCurrent) return { state: s.full_at <= localNow ? 'full' : 'filling', at: s.full_at, approx: false, refill_ms };
    if (s.ink != null && s.ink_updated_at != null && refill_ms != null) {
      const part = Math.min(1, Math.max(0, s.ink / rankFor(s.score_km2).tank));
      const at = local(s.ink_updated_at + refill_ms * (1 - part));
      return { state: at <= localNow ? 'full' : 'filling', at, approx: true, refill_ms };
    }
    return { state: 'unknown', at: null, approx: false, refill_ms };
  }

  // Every time in the result is on this computer's clock, so a countdown is time - Date.now().
  function view(state, localNow, flags) {
    const f = flags || {};
    const off = state.offset_ms, t = localNow + off;
    const local = ms => (ms == null ? null : ms - off);
    const selfId = state.self.id;
    const mine = slot => (selfId ? state.lands[selfId + ':' + slot] : undefined);

    let own = state.shop.lands.map(l => ({ slot: l.slot, shield_until: l.shield_until, lock_until: l.lock_until }));
    if (!own.length) {
      own = [1, 2, 3].filter(mine).map(slot => {
        const until = mine(slot).shield_until;
        return { slot, shield_until: until, lock_until: until == null ? null : until + LOCK_MS };
      });
    }
    const lands = own.sort((a, b) => a.slot - b.slot).map(l => {
      const name = (mine(l.slot) && mine(l.slot).country_name) || 'Land ' + l.slot;
      if (l.shield_until != null && l.shield_until > t) return { slot: l.slot, name, state: 'shield', until: local(l.shield_until), next: local(l.lock_until) };
      if (l.lock_until != null && l.lock_until > t) return { slot: l.slot, name, state: 'window', until: null, next: local(l.lock_until) };
      return { slot: l.slot, name, state: 'free', until: null, next: null };
    });

    // The list is who the game says is in the current map view, plus anyone pinned.
    const myAlliance = selfId ? state.alliance_of[selfId] : undefined;
    const onScreen = new Set(state.in_view);
    const rows = [];
    for (const id of new Set(state.in_view.concat(state.pinned))) {
      const p = state.players[id];
      if (!p || id === selfId) continue;
      const pinned = state.pinned.includes(id), inView = onScreen.has(id);
      const safeUntil = p.first_loop_at == null ? null : p.first_loop_at + SAFE_MS;
      const known = [1, 2, 3].filter(slot => state.lands[id + ':' + slot]);
      const pLands = (known.length ? known : [0]).map(slot => {
        const land = state.lands[id + ':' + slot];
        const s = landState(land, t, safeUntil);
        return { slot, label: known.length > 1 ? land.country_name || 'Land ' + slot : '', state: s.state, until: local(s.until) };
      });
      const best = pLands.reduce((a, b) => (ORDER[a.state] <= ORDER[b.state] ? a : b));
      const ally = myAlliance != null && state.alliance_of[id] === myAlliance;
      const est = inkEstimate(p.score_km2, p.last_loop_at, t);
      rows.push({
        id, name: p.name || p.monogram || '?', color: p.color, rank: rankFor(p.score_km2).name, ally, pinned,
        lands: pLands,
        ink: est == null ? null : est.full ? { full: true } : { full: false, pct: est.pct, at: local(est.at) },
        seen_min: inView || p.seen_at == null ? null : Math.max(0, Math.floor((t - p.seen_at) / 60000)),
        key: [pinned ? 0 : 1, ally ? 9 : ORDER[best.state], best.until == null ? Number.MAX_SAFE_INTEGER : best.until]
      });
    }
    rows.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.name.localeCompare(b.name));
    for (const r of rows) delete r.key;

    const joker = state.shop.joker_next_at;
    return {
      status: f.formatMiss ? 'format' : !f.sawTick ? 'waiting' : !f.sawView && f.viewWaitMs > VIEW_WAIT_MS ? 'noview' : 'ok',
      you: {
        ink: ownInk(state, localNow, local),
        lands,
        refills: { used: state.shop.refill.used, cap: state.shop.refill.cap, price: state.shop.refill.price, resets_at: local(state.shop.resets_at) },
        joker: { ready: joker == null || joker <= t, at: local(joker) },
        season: { ends_at: local(state.season.ends_at) }
      },
      neighbours: rows,
      open: rows.filter(r => !r.ally && r.lands.some(l => l.state === 'window')).length,
      map: { bounds: state.bounds, pins: state.pins, shapes: state.shapes }
    };
  }

  IDT.timers = { LOCK_MS, SAFE_MS, landState, inkEstimate, view };
})(globalThis);
