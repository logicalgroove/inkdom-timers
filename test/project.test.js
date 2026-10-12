'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toScreen, pathOf, fromScreen, rectOf, pxPerKm, PAD } = require('../support/load.js')('project.js').project;

const near = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, (msg || '') + ' got ' + got + ', want ' + want);

// Measured in the live game on 2026-10-09: the game's "who is in view" question carried these edges while the map
// canvas was 1728 x 998, and a ring drawn at the answer's points with this maths sat exactly on two avatars.
const LIVE = { west: 86.25849, south: 21.52904, east: 91.59781, north: 24.36845 };
const SIZE = { width: 1728, height: 998 };

test('the game asks for a view 30% larger than the screen', () => {
  assert.equal(PAD, 1.3);
});

test('a point from the live measurement lands where it was seen', () => {
  const at = toScreen(LIVE, SIZE, 22.9560145, 89.1301109744522);
  near(at.x, 949, 1.5, 'x');
  near(at.y, 500, 1.5, 'y');
});

test('the middle of the asked area is the middle of the screen, and the screen edge is 15% in', () => {
  const b = { west: 10, south: -5, east: 20, north: 5 };
  const mid = toScreen(b, { width: 1000, height: 800 }, 0, 15);
  near(mid.x, 500, 0.001);
  near(mid.y, 400, 0.001);
  near(toScreen(b, { width: 1000, height: 800 }, 0, 10 + 10 * (0.15 / 1.3)).x, 0, 0.001, 'left edge');
  near(toScreen(b, { width: 1000, height: 800 }, 0, 20 - 10 * (0.15 / 1.3)).x, 1000, 0.001, 'right edge');
  assert.ok(toScreen(b, { width: 1000, height: 800 }, 4, 15).y < 400, 'north is up');
});

test('latitude follows the Mercator scale, not a straight line', () => {
  const b = { west: 0, south: 0, east: 10, north: 60 };
  assert.ok(toScreen(b, { width: 100, height: 100 }, 30, 5).y > 50, 'the half-way latitude sits below the middle');
});

test('a view across the date line', () => {
  const b = { west: 170, south: -10, east: -170, north: 10 };
  near(toScreen(b, { width: 1000, height: 500 }, 0, 180).x, 500, 0.001);
  near(toScreen(b, { width: 1000, height: 500 }, 0, -175).x, 825, 0.001);
});

test('a point west of the asked area is left of the screen, and one east of it is right', () => {
  const b = { west: 10, south: -5, east: 20, north: 5 };
  assert.ok(toScreen(b, { width: 1000, height: 800 }, 0, 4).x < 0, 'west stays on the left');
  assert.ok(toScreen(b, { width: 1000, height: 800 }, 0, 27).x > 1000, 'east stays on the right');
});

test('a land outline becomes one closed path per ring, in screen pixels', () => {
  const b = { west: 10, south: -5, east: 20, north: 5 }, size = { width: 1000, height: 800 };
  const square = [14, -1, 16, -1, 16, 1, 14, 1, 14, -1];
  const out = pathOf([square, [14.5, 0, 15.5, 0, 15, 0.5]], b, size);
  assert.equal((out.d.match(/M/g) || []).length, 2);
  assert.equal((out.d.match(/Z/g) || []).length, 2);
  assert.ok(out.d.startsWith('M' + toScreen(b, size, -1, 14).x.toFixed(1) + ' ' + toScreen(b, size, -1, 14).y.toFixed(1) + 'L'));
  assert.equal(out.n, 8);
  near(out.cx, 500, 30, 'middle of what is on screen, x');
  near(out.cy, 400, 30, 'middle of what is on screen, y');
});

test('the middle counts only the part of the outline that is on screen', () => {
  const b = { west: 10, south: -5, east: 20, north: 5 }, size = { width: 1000, height: 800 };
  const half = pathOf([[2, 0, 12.5, 0, 12.5, 1, 2, 1]], b, size);
  assert.equal(half.n, 2);
  near(half.cx, toScreen(b, size, 0, 12.5).x, 0.2);
  const gone = pathOf([[40, 0, 41, 0, 41, 1]], b, size);
  assert.equal(gone.n, 0);
  assert.equal(gone.cx, null);
  assert.ok(gone.d.length > 0);
});

test('no shape, no edges or no size gives no outline', () => {
  const b = { west: 10, south: -5, east: 20, north: 5 }, size = { width: 1000, height: 800 };
  for (const [rings, bounds, sz] of [[null, b, size], [[], b, size], [[[1, 2, 3, 4, 5, 6]], null, size], [[[1, 2, 3, 4, 5, 6]], b, null], [[[1, 2, 3, 4, 5, 6]], b, { width: 0, height: 5 }]]) {
    assert.equal(pathOf(rings, bounds, sz), null);
  }
});

test('missing edges, a missing size or a degenerate view give no position', () => {
  assert.equal(toScreen(null, SIZE, 1, 1), null);
  assert.equal(toScreen(LIVE, null, 1, 1), null);
  assert.equal(toScreen(LIVE, { width: 0, height: 10 }, 1, 1), null);
  assert.equal(toScreen({ west: 1, south: 2, east: 3, north: 2 }, SIZE, 2, 2), null);
  assert.equal(toScreen(LIVE, SIZE, NaN, 89), null);
});

test('a point on screen goes back to the place it came from', () => {
  for (const [lat, lng] of [[22.9560145, 89.1301109744522], [24.3, 86.3], [21.6, 91.5]]) {
    const at = toScreen(LIVE, SIZE, lat, lng), back = fromScreen(LIVE, SIZE, at.x, at.y);
    near(back.lat, lat, 1e-9, 'lat');
    near(back.lng, lng, 1e-9, 'lng');
  }
});

test('across the date line the place comes back within -180 to 180', () => {
  const b = { west: 170, south: -10, east: -170, north: 10 }, size = { width: 1000, height: 500 };
  near(fromScreen(b, size, 825, 250).lng, -175, 1e-9);
  near(fromScreen(b, size, 175, 250).lng, 175, 1e-9);
  near(fromScreen(b, size, 500, 250).lat, 0, 1e-9);
});

test('the rectangle on screen is the asked area without its 15% margins', () => {
  const r = rectOf({ west: 10, south: -5, east: 20, north: 5 }, { width: 1000, height: 800 });
  near(r.west, 10 + 10 * (0.15 / 1.3), 1e-9);
  near(r.east, 20 - 10 * (0.15 / 1.3), 1e-9);
  near(r.north, -r.south, 1e-9);
  assert.ok(r.north > 3.8 && r.north < 3.9, 'north ' + r.north);
  const across = rectOf({ west: 170, south: -10, east: -170, north: 10 }, { width: 1000, height: 500 });
  assert.ok(across.east > 180 && across.east > across.west, 'east runs past 180');
});

test('pixels per kilometre at the middle of the screen', () => {
  // 1728 px show 5.33932 / 1.3 degrees of longitude at latitude 22.96, where a degree is 102.5 km.
  near(pxPerKm(LIVE, SIZE), 4.105, 0.01);
  near(pxPerKm({ west: -10, south: -5, east: 10, north: 5 }, { width: 1000, height: 500 }), 1000 * 1.3 / 20 / 111.32, 1e-6);
});

test('no edges or no size gives no place, rectangle or scale', () => {
  assert.equal(fromScreen(null, SIZE, 1, 1), null);
  assert.equal(fromScreen(LIVE, SIZE, NaN, 1), null);
  assert.equal(rectOf(LIVE, null), null);
  assert.equal(rectOf(null, SIZE), null);
  assert.equal(pxPerKm(LIVE, { width: 0, height: 10 }), null);
});
