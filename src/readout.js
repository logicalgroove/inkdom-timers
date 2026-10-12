(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  // The game labels its ink readout for screen readers: "Ink 66.3, full 41m".
  const LABEL = /^Ink\s+[\d.,]+\s*,\s*full(?:\s+(?:in|now))?(?:\s+(\d+)\s*h)?(?:\s*(\d+)\s*m)?\s*$/i;

  function parse(label) {
    if (typeof label !== 'string') return null;
    const m = LABEL.exec(label.trim());
    if (!m) return null;
    return { minutes: (m[1] ? Number(m[1]) * 60 : 0) + (m[2] ? Number(m[2]) : 0) };
  }

  IDT.readout = { parse };
})(globalThis);
