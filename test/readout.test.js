'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../support/load.js')('readout.js').readout;

test('the label seen on 2026-10-09', () => {
  assert.deepEqual(parse('Ink 66.3, full 41m'), { minutes: 41 });
});

test('hours, thousands separators and a full tank', () => {
  assert.deepEqual(parse('Ink 12, full 1h 5m'), { minutes: 65 });
  assert.deepEqual(parse('Ink 12, full 2h'), { minutes: 120 });
  assert.deepEqual(parse('Ink 1,204.5, full in 3m'), { minutes: 3 });
  assert.deepEqual(parse('Ink 172.8, full'), { minutes: 0 });
  assert.deepEqual(parse('Ink 172.8, full now'), { minutes: 0 });
});

test('a label without the full part, or another label, is not a reading', () => {
  for (const bad of ['Ink 66.3', 'Notifications, 1 new', 'Ink', '', null, 5]) assert.equal(parse(bad), null);
});
