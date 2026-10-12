'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rankFor, TABLE } = require('../support/load.js')('ranks.js').ranks;

test('thresholds are inclusive at the lower edge', () => {
  assert.equal(rankFor(0).name, 'Street');
  assert.equal(rankFor(0.99).name, 'Street');
  assert.equal(rankFor(1).name, 'Block');
  assert.equal(rankFor(14999.9).name, 'Region');
  assert.equal(rankFor(15000).name, 'State');
  assert.equal(rankFor(9e6).name, 'Superpower');
});

test('State refills in 66 minutes on a 160 km tank', () => {
  assert.deepEqual(rankFor(33464), { name: 'State', from: 15000, tank: 160, refillMin: 66 });
});

test('bad input is Street', () => {
  for (const bad of [null, undefined, NaN, -3, '500']) assert.equal(rankFor(bad).name, 'Street');
});

test('the table is sorted and has thirteen ranks', () => {
  assert.equal(TABLE.length, 13);
  for (let i = 1; i < TABLE.length; i++) assert.ok(TABLE[i].from > TABLE[i - 1].from);
});
