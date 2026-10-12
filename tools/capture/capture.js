(function () {
  'use strict';
  // Development only. Records what the game fetches, when, and in what shape, plus a timeline of
  // what the player did, so requests can be matched to actions. No names, no tokens, no string values.
  const S = window.__idtSummarize;
  const t0 = performance.now();
  const sec = () => Math.round((performance.now() - t0) / 100) / 10;
  const push = (list, item, max) => { if (list.length < max) list.push(item); };
  const cap = { v: 3, started: new Date().toISOString(), loads: 1, ticks: [], calls: {}, ws: {}, actions: [], labels: [] };
  try {
    cap.loads = Number(sessionStorage.getItem('idt-capture-loads') || 0) + 1;
    sessionStorage.setItem('idt-capture-loads', String(cap.loads));
  } catch (_) {}
  try { performance.setResourceTimingBufferSize(3000); } catch (_) {}

  // Two families of calls: the Supabase backend, and the game's own cached reads under /api/.
  const SUPA = /\/(rest|functions|storage)\/v1\//;
  const orig = window.fetch;
  window.fetch = function (input, init) {
    const p = orig.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const body = init && typeof init.body === 'string' ? init.body : '';
      const t = sec();
      let u = null;
      try { u = new URL(url, location.href); } catch (_) {}
      if (u && u.host === location.host && u.pathname.startsWith('/api/')) {
        const key = 'api:' + u.pathname.replace(/\d+/g, 'N');
        const c = cap.calls[key] || (cap.calls[key] = { n: 0, times: [], paths: [], reqs: [], samples: [] });
        c.n++;
        push(c.times, t, 60);
        if (!c.paths.includes(u.pathname + u.search)) push(c.paths, u.pathname + u.search, 4);
        if (body) { try { push(c.reqs, S.sample(JSON.parse(body)), 2); } catch (_) {} }
        if (!/\.pbf$/.test(u.pathname) && u.pathname !== '/api/errors') {
          p.then(r => { c.cache = r.headers.get('cache-control'); return r.clone().json(); })
            .then(json => {
              const one = S.sample(json), text = JSON.stringify(one);
              if (!c.samples.some(x => JSON.stringify(x) === text)) push(c.samples, one, 3);
            }).catch(() => {});
        }
      } else if (SUPA.test(url) && !/\/portraits\//.test(url)) {
        const path = url.split('?')[0].replace(/^.*\/(rest|functions|storage)\/v1\//, '$1:').replace(/^rest:/, '');
        const q = S.query(url), b = S.body(body);
        const key = path + ' ?' + q.replace(/=[^&]*/g, '');
        const c = cap.calls[key] || (cap.calls[key] = { n: 0, times: [], queries: [], bodies: [], shapes: [] });
        c.n++;
        push(c.times, t, 40);
        if (q && !c.queries.includes(q)) push(c.queries, q, 3);
        if (b && !c.bodies.includes(b)) push(c.bodies, b, 3);
        p.then(r => r.clone().json()).then(json => {
          if (path === 'rpc/world_tick2') push(cap.ticks, S.tick(body, json, t, document.visibilityState), 100);
          const s = S.shape(json);
          if (!c.shapes.includes(s)) push(c.shapes, s, 3);
        }).catch(() => {});
      }
    } catch (_) {}
    return p;
  };

  // Live channel: listen on any socket the page sends on. The constructor is left alone.
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function () {
    try {
      if (!this.__idtSeen) {
        this.__idtSeen = true;
        this.addEventListener('message', ev => {
          try {
            const m = JSON.parse(ev.data);
            const topic = String(Array.isArray(m) ? m[2] : m.topic).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>');
            const event = Array.isArray(m) ? m[3] : m.event;
            const payload = Array.isArray(m) ? m[4] : m.payload;
            const key = topic + ' / ' + event + (payload && payload.event ? ' / ' + payload.event : '');
            const w = cap.ws[key] || (cap.ws[key] = { n: 0, times: [], shape: S.shape(payload) });
            w.n++;
            push(w.times, sec(), 20);
          } catch (_) {}
        });
      }
    } catch (_) {}
    return send.apply(this, arguments);
  };

  // What the player did, and when.
  const act = (kind, detail) => push(cap.actions, [sec(), kind, detail || ''], 200);
  let wheelAt = -10;
  addEventListener('pointerup', ev => {
    const el = ev.target && ev.target.closest ? ev.target.closest('button,[role=button],a') : null;
    if (el) act('click', (el.getAttribute('aria-label') || '').slice(0, 30));
    else act(ev.target && ev.target.tagName === 'CANVAS' ? 'map' : 'other');
  }, true);
  addEventListener('wheel', () => { const t = sec(); if (t - wheelAt > 1) act('wheel'); wheelAt = t; }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => act('vis', document.visibilityState));
  addEventListener('focus', () => act('focus'));
  addEventListener('blur', () => act('blur'));

  // The folded sidebar labels its ink readout "Ink 66.3, full 41m". Unfolded, that label is absent,
  // so whatever else mentions ink is recorded instead.
  const note = (kind, label) => {
    const shape = kind + ': ' + label.replace(/\d[\d.,]*\d|\d/g, 'N');
    if (cap.labels.length < 20 && !cap.labels.some(l => l.shape === shape)) cap.labels.push({ shape, example: label, t: sec() });
  };
  setInterval(() => {
    const el = document.querySelector('[aria-label^="Ink "]');
    if (el) { note('folded', el.getAttribute('aria-label')); return; }
    for (const e of document.querySelectorAll('[aria-label*="ink" i]')) note('other', e.getAttribute('aria-label').slice(0, 100));
  }, 1000);

  window.__idtCapture = () => {
    const res = {};
    for (const e of performance.getEntriesByType('resource')) {
      try {
        const u = new URL(e.name);
        if (/openfreemap|google/.test(u.host)) continue;
        const k = e.initiatorType + ' ' + u.host.replace(/^[a-z0-9]{20}\./, '<project>.') +
          u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>').replace(/\d+/g, 'N');
        res[k] = (res[k] || 0) + 1;
      } catch (_) {}
    }
    return JSON.stringify(Object.assign({}, cap, { ended: sec(), visible: document.visibilityState, focused: document.hasFocus(), resources: res }));
  };

  addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('button');
    b.textContent = 'Copy capture';
    b.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2147483000;font:600 13px system-ui;padding:6px 12px;background:#131a23;color:#fff;border:2px solid #fff;border-radius:6px;cursor:pointer';
    b.addEventListener('click', () => {
      navigator.clipboard.writeText(window.__idtCapture()).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Copy failed'; });
    });
    document.body.appendChild(b);
  });
})();
