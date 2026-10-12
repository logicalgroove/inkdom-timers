'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../support/load.js')('people.js').people;

// Kontur Population, 3 km hexagons, release 2023-11-01, as measured on 2026-10-11.
const file = fs.readFileSync(path.join(__dirname, '..', 'data', 'people-r6.bin'));
const level = P.decode(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

test('the shipped data is the whole 2023-11-01 release', () => {
  assert.equal(file.length, 5289666);
  assert.equal(level.keys.length, 2016971);
  let total = 0;
  for (const n of level.people) total += n;
  assert.equal(total, 8031924024);
});

test("Khulna's hexagon holds 455,625 people", () => {
  assert.equal(P.find(level, P.keyOf('863cf3c57ffffff')), 455625);
});

test('the largest hexagons still add up to everyone', () => {
  const two = P.coarser(level, 2);
  let total = 0;
  for (const n of two.people) total += n;
  assert.equal(total, 8031924024);
  assert.ok(two.keys.length < 5882, 'there are 5,882 resolution 2 hexagons in the world');
});
