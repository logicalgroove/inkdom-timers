'use strict';
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../support/load.js')('format.js').format;

// Times are shown on the clock of the computer the game is played on, whatever zone that is.
test('clock times follow the computer\'s own time zone', () => {
  const T = 1_800_000_000_000; // 08:00 UTC on Fri 15 Jan 2027, which is 03:00 in New York
  assert.equal(F.hm(T), '03:00');
  assert.equal(F.clock(T + 12.5 * 3600000, T), '15:30');
  assert.equal(F.clock(T + 21 * 3600000, T), 'Sat 00:00');
  assert.equal(F.date(T - 4 * 3600000), 'Thu 14 Jan');
});
