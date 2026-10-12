(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    if (input && typeof input.href === 'string') return input.href;
    return null;
  }

  function install(win, reducer) {
    const orig = win.fetch;
    if (typeof orig !== 'function') return false;
    const kindOf = reducer.kindOf, reduce = reducer.reduce;
    const post = msg => {
      try { win.postMessage(Object.assign({ source: 'inkdom-timers', v: 1 }, msg), win.location.origin); } catch (_) {}
    };

    // The original promise is returned as is. Of the request, only the address is looked at, with one
    // exception: for the game's /api/read the body text is passed on, so the reducer can take the four
    // map edges out of a "who is in view" question. Headers are never touched.
    // The edges are posted as soon as the question is sent: the map is already there, and the layer
    // need not wait for the answer.
    win.fetch = function () {
      const p = orig.apply(this, arguments);
      try {
        const kind = kindOf(urlOf(arguments[0]));
        if (kind) {
          const init = kind === 'read' ? arguments[1] : null;
          const body = init != null && typeof init === 'object' && typeof init.body === 'string' ? init.body : null;
          const bounds = body == null ? null : reducer.boundsOf(body);
          if (bounds) post({ events: [{ type: 'view', bounds }] });
          p.then(res => {
            if (!res || !res.ok) return undefined;
            return res.clone().json().then(json => {
              const events = reduce(kind, json, body);
              if (events.length) post({ events });
              else if (kind === 'tick') post({ miss: 'tick' });
            });
          }).catch(() => {});
        }
      } catch (_) {}
      return p;
    };
    return true;
  }

  IDT.tap = { install };

  // In the game page: wrap fetch, then remove the namespace so the page is left with no trace of it.
  if (typeof document !== 'undefined' && IDT.reduce) {
    install(g, IDT.reduce);
    delete g[KEY];
  }
})(globalThis);
