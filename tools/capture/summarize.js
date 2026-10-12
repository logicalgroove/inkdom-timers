(function (g) {
  'use strict';
  const tail = v => (typeof v === 'string' ? v.slice(-6) : null);
  const len = v => (Array.isArray(v) ? v.length : v == null ? null : typeof v);

  function tick(reqBody, json, tSec, visibility) {
    let req = {};
    try { req = JSON.parse(reqBody) || {}; } catch (_) {}
    const j = json && typeof json === 'object' ? json : {};
    const ids = (a, k) => (Array.isArray(a) ? a.map(x => tail(x && x[k])) : null);
    return {
      t: tSec, vis: visibility,
      full: req.p_full === true, since: req.p_since ?? null, view_since: req.p_view_since ?? null,
      width: typeof req.maxx === 'number' && typeof req.minx === 'number' ? Math.round((req.maxx - req.minx) * 100) / 100 : null,
      keys: Object.keys(j).sort().join(','),
      geo: len(j.geo), view: ids(j.view, 'id'), pins: ids(j.pins, 'id'),
      shields: Array.isArray(j.shields) ? j.shields.map(s => tail(s && s.player_id) + ':' + (s && s.slot)) : null,
      claims: len(j.claims), directory: len(j.directory), rulers: len(j.rulers)
    };
  }

  function rows(json) {
    const a = Array.isArray(json) ? json : [];
    const first = a[0] && typeof a[0] === 'object' ? a[0] : {};
    const shape = {};
    for (const k of Object.keys(first)) shape[k] = first[k] === null ? 'null' : Array.isArray(first[k]) ? 'array' : typeof first[k];
    return { n: a.length, first: shape };
  }

  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array(' + v.length + ')' : typeof v);

  function shape(json) {
    const obj = o => '{' + Object.keys(o).slice(0, 40).map(k => k + ':' + typeOf(o[k])).join(', ') + '}';
    if (Array.isArray(json)) {
      const first = json[0];
      return 'array(' + json.length + ')' + (first && typeof first === 'object' && !Array.isArray(first) ? ' of ' + obj(first) : '');
    }
    if (json && typeof json === 'object') return obj(json);
    return typeOf(json);
  }

  function query(url) {
    let u;
    try { u = new URL(url, 'https://x.invalid'); } catch (_) { return ''; }
    const out = [];
    for (const [k, v] of u.searchParams) {
      if (k === 'select') { out.push('select'); continue; }
      const ids = (v.match(UUID) || []).length;
      const val = ids > 1 ? v.replace(/\(.*\)/, '(' + ids + ' ids)') : v.replace(UUID, '<id>');
      out.push(k + '=' + val.slice(0, 40));
    }
    return out.join('&');
  }

  function body(str) {
    let b;
    try { b = JSON.parse(str); } catch (_) { return ''; }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return '';
    return Object.keys(b).slice(0, 30).map(k => {
      const v = b[k];
      if (typeof v === 'number') return k + ':' + Math.round(v * 100) / 100;
      if (typeof v === 'boolean') return k + ':' + v;
      if (typeof v === 'string') return k + ':' + (IS_UUID.test(v) ? '<id>' : 'str');
      return k + ':' + typeOf(v);
    }).join(' ');
  }

  // A masked sample: keeps structure, numbers, dates, colours and short codes; hides names, ids and long text.
  const MASK_KEY = /name|monogram|body|title|text|label|message/i;
  function sample(v, key, depth) {
    depth = depth || 0;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      if (IS_UUID.test(v)) return 'id_' + v.slice(-6);
      if (/^\d{4}-\d\d-\d\dT/.test(v) || /^#[0-9a-f]{6}$/i.test(v)) return v;
      if (key && MASK_KEY.test(key)) return 'str(' + v.length + ')';
      return v.length <= 16 ? v : 'str(' + v.length + ')';
    }
    if (Array.isArray(v)) return v.length ? { _n: v.length, _0: sample(v[0], key, depth + 1) } : { _n: 0 };
    if (typeof v === 'object') {
      if (depth >= 5) return 'object';
      const out = {};
      for (const k of Object.keys(v).slice(0, 40)) out[k] = sample(v[k], k, depth + 1);
      return out;
    }
    return typeof v;
  }

  g.__idtSummarize = { tick, rows, shape, query, body, sample };
})(globalThis);
