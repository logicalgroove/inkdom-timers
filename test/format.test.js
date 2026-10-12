'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../support/load.js')('format.js').format;

const T = 1_800_000_000_000; // Fri 15 Jan 2027 08:00:00 UTC
const H = 3600000;

test('countdown', () => {
  assert.equal(F.countdown(0), '0:00:00');
  assert.equal(F.countdown(-5000), '0:00:00');
  assert.equal(F.countdown(683000), '0:11:23');
  assert.equal(F.countdown(3672000), '1:01:12');
  assert.equal(F.countdown(999), '0:00:01');
  assert.equal(F.countdown(11 * 24 * H + 2 * H), '11d 2h');
});

test('clock adds the weekday on another day', () => {
  assert.equal(F.clock(T + 3 * H, T), '11:00');
  assert.equal(F.clock(T + 16 * H, T), 'Sat 00:00');
  assert.equal(F.clock(T - 9 * H, T), 'Thu 23:00');
});

test('hm, hms and date', () => {
  assert.equal(F.hm(T + 5 * 60000), '08:05');
  assert.equal(F.hms(T + 7000), '08:00:07');
  assert.equal(F.date(T), 'Fri 15 Jan');
});

// The game's own cards say "03:31 PM". The panel never does: every clock time is 24-hour HH:MM, built from
// getHours and getMinutes, so it does not depend on the browser's language or region settings.
test('clock times are 24-hour HH:MM at every hour of the day, with no am or pm', () => {
  const midnight = T - 8 * H; // Fri 15 Jan 2027 00:00 UTC
  for (let hour = 0; hour < 24; hour++) {
    const at = midnight + hour * H + 31 * 60000;
    const want = String(hour).padStart(2, '0') + ':31';
    assert.equal(F.hm(at), want);
    assert.equal(F.clock(at, midnight), want);
    assert.equal(F.hms(at), want + ':00');
    assert.equal(/[ap]\.?m/i.test(F.clock(at, midnight) + F.hms(at) + F.clock(at + 24 * H, midnight)), false);
  }
  assert.equal(F.clock(midnight + 15 * H + 31 * 60000, midnight), '15:31');
  assert.equal(F.clock(midnight + 39 * H + 31 * 60000, midnight), 'Sat 15:31');
});

test('counts get thousands separators and no decimals', () => {
  assert.equal(F.count(455625), '455,625');
  assert.equal(F.count(1949226), '1,949,226');
  assert.equal(F.count(999), '999');
  assert.equal(F.count(11496.6), '11,497');
  assert.equal(F.count(0), '0');
});

test('two significant figures', () => {
  assert.equal(F.sig2(6846), 6800);
  assert.equal(F.sig2(11497), 11000);
  assert.equal(F.sig2(999), 1000);
  assert.equal(F.sig2(95), 95);
  assert.equal(F.sig2(88.4), 88);
  assert.equal(F.sig2(9.6), 10);
  assert.equal(F.sig2(0.4), 0);
});
