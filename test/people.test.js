'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../support/load.js')('people.js').people;

const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, 'got ' + got + ', want ' + want);
// Khulna's hexagon and the larger hexagons that hold it, from the H3 library on 2026-10-11.
const KHULNA = '863cf3c57ffffff', KEY6 = 7989130;
const PARENTS = { 5: '853cf3c7fffffff', 4: '843cf3dffffffff', 3: '833cf3fffffffff', 2: '823cf7fffffffff' };
const sample = () => P.encode([5, 8, 9, 16, 4000000], [10, 1, 300, 7, 1949226]);

test('a packed file comes back as the keys and people that went in', () => {
  const level = P.decode(sample().buffer);
  assert.equal(level.res, 6);
  assert.deepEqual(Array.from(level.keys), [5, 8, 9, 16, 4000000]);
  assert.deepEqual(Array.from(level.people), [10, 1, 300, 7, 1949226]);
});

test('the header is 12 bytes: IDTP, version 1, resolution 6, two zeros, the count', () => {
  assert.deepEqual(Array.from(sample().slice(0, 12)), [0x49, 0x44, 0x54, 0x50, 1, 6, 0, 0, 5, 0, 0, 0]);
  assert.deepEqual(Array.from(P.decode(P.encode([], []).buffer).keys), []);
});

test('a file that is not the expected one throws', () => {
  const edit = (i, v) => { const b = sample(); b[i] = v; return b.buffer; };
  assert.throws(() => P.decode(new ArrayBuffer(0)), /not the expected file/);
  assert.throws(() => P.decode(edit(0, 0x58)), /not the expected file/);
  assert.throws(() => P.decode(edit(4, 2)), /format version 2/);
  assert.throws(() => P.decode(edit(5, 5)), /resolution 5/);
  assert.throws(() => P.decode(edit(8, 6)), /cut short/, 'the count says more than there is');
  assert.throws(() => P.decode(edit(8, 4)), /too many/, 'the count says fewer than there is');
  assert.throws(() => P.decode(sample().slice(0, -1).buffer), /cut short/);
});

test('a repeated key or a key past 25 bits throws', () => {
  const twice = Uint8Array.from([0x49, 0x44, 0x54, 0x50, 1, 6, 0, 0, 2, 0, 0, 0, 5, 1, 0, 1]);
  assert.throws(() => P.decode(twice.buffer), /out of order/);
  const far = Uint8Array.from([0x49, 0x44, 0x54, 0x50, 1, 6, 0, 0, 1, 0, 0, 0, 0x80, 0x80, 0x80, 0x10, 1]);
  assert.throws(() => P.decode(far.buffer), /out of range/);
  assert.throws(() => P.encode([5, 5], [1, 1]), /must ascend/);
});

test('larger hexagons sum their children and stay in order', () => {
  const level = P.decode(sample().buffer);
  const five = P.coarser(level, 5);
  assert.equal(five.res, 5);
  assert.deepEqual(Array.from(five.keys), [0, 1, 2, 500000]);
  assert.deepEqual(Array.from(five.people), [10, 301, 7, 1949226]);
  const two = P.coarser(level, 2);
  assert.deepEqual(Array.from(two.keys), [0, 976]);
  assert.deepEqual(Array.from(two.people), [318, 1949226]);
});

test('find returns the people of a key, and 0 for a key that is not there', () => {
  const level = P.decode(sample().buffer);
  assert.equal(P.find(level, 5), 10);
  assert.equal(P.find(level, 4000000), 1949226);
  assert.equal(P.find(level, 6), 0);
  assert.equal(P.find(level, 0), 0);
  assert.equal(P.find(P.decode(P.encode([], []).buffer), 5), 0);
});

test('keys and H3 ids turn into each other at every resolution', () => {
  assert.equal(P.keyOf(KHULNA), KEY6);
  assert.equal(P.cellOf(KEY6, 6), KHULNA);
  for (const res of [5, 4, 3, 2]) {
    const key = KEY6 >>> (3 * (6 - res));
    assert.equal(P.keyOf(PARENTS[res]), key, 'keyOf at ' + res);
    assert.equal(P.cellOf(key, res), PARENTS[res], 'cellOf at ' + res);
  }
});

test('the hexagon size follows the zoom: the smallest that is 8 pixels across', () => {
  const small = 1000 * 1000;
  for (const [res, across] of [[6, 7.45], [5, 19.7], [4, 52.1], [3, 138]]) {
    assert.equal(P.resFor(8.001 / across, small), res, 'just enough for ' + res);
    assert.equal(P.resFor(7.999 / across, small), res - 1, 'just short of ' + res);
  }
  assert.equal(P.resFor(0.001, small), 2);
  assert.equal(P.resFor(50, small), 6);
});

test('a size that would put more than 25,000 hexagons on screen is passed over', () => {
  // 10 px hexagons take 65 square pixels each: 25,000 of them fill 1,625,000 square pixels.
  assert.equal(P.resFor(10 / 7.45, 1625000), 6);
  assert.equal(P.resFor(10 / 7.45, 1626000), 5);
});

test('the shading scale is the 5th and 99th percentile of what is in view', () => {
  const hundred = Array.from({ length: 100 }, (_, i) => 100 - i);
  assert.deepEqual(P.scale(hundred), { lo: 6, hi: 100 });
  assert.deepEqual(P.scale([7]), { lo: 7, hi: 7 });
  assert.deepEqual(P.scale([0, 3, 0, 9]), { lo: 3, hi: 9 }, 'empty hexagons do not count');
  assert.equal(P.scale([]), null);
});

test('opacity runs from 0.04 at the low end to 0.78 at the high end', () => {
  const s = { lo: 100, hi: 10000 };
  near(P.alpha(100, s), 0.04, 1e-9);
  near(P.alpha(50, s), 0.04, 1e-9);
  near(P.alpha(10000, s), 0.78, 1e-9);
  near(P.alpha(99999, s), 0.78, 1e-9);
  near(P.alpha(1000, s), 0.04 + 0.74 * Math.pow(0.5, 2.2), 1e-9);
  assert.equal(P.alpha(500, { lo: 500, hi: 500 }), 0.4);
  assert.equal(P.alpha(0, s), 0);
  assert.equal(P.alpha(500, null), 0);
});

const answer = (ok, buffer) => () => Promise.resolve({ ok, status: ok ? 200 : 404, arrayBuffer: () => Promise.resolve(buffer) });

test('loading gives the unpacked file', async () => {
  const level = await P.load(() => 'data/people-r6.bin', answer(true, sample().buffer));
  assert.deepEqual(Array.from(level.keys), [5, 8, 9, 16, 4000000]);
  assert.deepEqual(Array.from(level.people), [10, 1, 300, 7, 1949226]);
});

test('loading fails with a rejection, never an exception, whatever goes wrong', async () => {
  // The first case is an old tab after the extension was reloaded: asking for the file's address throws.
  const boom = () => { throw new Error('Extension context invalidated.'); };
  for (const [url, fetcher, why] of [
    [boom, answer(true, sample().buffer), /context invalidated/],
    [() => 'x', boom, /context invalidated/],
    [() => 'x', () => Promise.reject(new Error('offline')), /offline/],
    [() => 'x', answer(false, sample().buffer), /status 404/],
    [() => 'x', answer(true, new ArrayBuffer(3)), /not the expected file/]
  ]) {
    let pending;
    assert.doesNotThrow(() => { pending = P.load(url, fetcher); });
    await assert.rejects(pending, why);
  }
});
