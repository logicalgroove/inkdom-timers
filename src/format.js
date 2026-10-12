(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');

  function countdown(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s >= 86400) return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
    return Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }
  function hm(at) {
    const d = new Date(at);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function hms(at) {
    return hm(at) + ':' + pad(new Date(at).getSeconds());
  }
  function clock(at, now) {
    const d = new Date(at);
    return d.toDateString() === new Date(now).toDateString() ? hm(at) : DAYS[d.getDay()] + ' ' + hm(at);
  }
  function date(at) {
    const d = new Date(at);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  // 455625 -> "455,625", the same in every locale.
  function count(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  // Two significant figures: 6846 -> 6800, 88.4 -> 88. Under 10, the nearest whole number.
  function sig2(n) {
    if (!(n >= 10)) return Math.round(n);
    const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  }

  IDT.format = { countdown, hm, hms, clock, date, count, sig2 };
})(globalThis);
