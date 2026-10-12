'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h3 = require('../vendor/h3-js.umd.js');
const IDT = require('../support/load.js')('project.js', 'people.js', 'heat.js');
const { people: P, heat, project } = IDT;

const file = fs.readFileSync(path.join(__dirname, '..', 'data', 'people-r6.bin'));
const data = P.decode(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const KHULNA = '863cf3c57ffffff';
// The edges the game asks for over Bengal, and a laptop-sized map canvas.
const BENGAL = { west: 86.25, south: 21.5, east: 91.6, north: 24.4 };
const BOX = { left: 0, top: 0, width: 1280, height: 800 };

test('the hexagons in a rectangle come with their people and people per km²', () => {
  const list = heat.cells(h3, data, BENGAL);
  const khulna = list.find(c => c.id === KHULNA);
  assert.ok(list.length > 3000 && list.length < 6000, 'count ' + list.length);
  assert.equal(khulna.people, 455625);
  assert.ok(khulna.density > 11400 && khulna.density < 11600, 'density ' + khulna.density);
  assert.equal(khulna.ring.length, 12, 'six corners, latitude then longitude');
  assert.ok(Math.abs(khulna.ring[0] - 22.8) < 0.1 && Math.abs(khulna.ring[1] - 89.55) < 0.1);
  assert.ok(list.every(c => c.people > 0), 'only hexagons that hold people');
});

test('a rectangle wider than one strip gives no hexagon twice and leaves no gap', () => {
  const list = heat.cells(h3, P.coarser(data, 3), { west: 60, east: 150, south: 10, north: 40 });
  assert.equal(new Set(list.map(c => c.id)).size, list.length);
  const lngs = list.map(c => c.ring[1]);
  for (const edge of [95, 125]) assert.ok(lngs.some(l => Math.abs(l - edge) < 1.5), 'hexagons at the strip edge near ' + edge);
});

test('a rectangle across the date line gives hexagons on both sides', () => {
  const list = heat.cells(h3, P.coarser(data, 4), { west: 176, east: 184, south: -20, north: -15 });
  assert.ok(list.some(c => c.ring[1] > 170), 'Fiji, east of the line');
  assert.ok(list.some(c => c.ring[1] < -170), 'Fiji, west of the line');
});

test('the whole world at the largest size', () => {
  const two = P.coarser(data, 2);
  const list = heat.cells(h3, two, { west: -300, east: 300, south: -89, north: 89 });
  assert.equal(new Set(list.map(c => c.id)).size, list.length);
  assert.ok(list.length > 0.95 * two.keys.length, list.length + ' of ' + two.keys.length);
});

test('a rectangle beyond 85 degrees gives nothing', () => {
  assert.deepEqual(heat.cells(h3, data, { west: 0, east: 10, south: 86, north: 89 }), []);
});

test('corners and areas are remembered between calls', () => {
  let asked = 0;
  const counting = Object.assign({}, h3, { cellToBoundary: id => { asked++; return h3.cellToBoundary(id); } });
  const kept = new Map(), rect = { west: 89, east: 90, south: 22.5, north: 23 };
  const first = heat.cells(counting, data, rect, kept);
  assert.equal(asked, first.length);
  heat.cells(counting, data, rect, kept);
  assert.equal(asked, first.length);
});


// A stand-in for the page: one map canvas and whatever canvas the layer makes.
function page(box) {
  const paths = [];
  let path = null;
  const ctx = {
    fillStyle: '', setTransform() {}, clearRect() {}, closePath() {},
    beginPath() { path = { min: Infinity, max: -Infinity, fill: null }; },
    moveTo(x) { path.min = Math.min(path.min, x); path.max = Math.max(path.max, x); },
    lineTo(x) { path.min = Math.min(path.min, x); path.max = Math.max(path.max, x); },
    fill() { path.fill = this.fillStyle; paths.push(path); }
  };
  const made = [];
  // What the game itself moves with the map: its pins, one of them off screen, and the scale bar.
  const pins = ['translate(100px, 200px)', 'translate(300px, 400px)', 'translate(-9000px, 50px)'].map(transform => ({ style: { transform } }));
  const bar = { style: { width: '65px' }, textContent: '50 km' }, view = { devicePixelRatio: 1 };
  const doc = {
    defaultView: view,
    querySelector: sel => (sel === '.maplibregl-ctrl-scale' ? bar : null),
    createElement() {
      const canvas = { id: '', style: {}, width: 0, height: 0, setAttribute() {}, getContext: () => ctx, remove() { if (map) map.nextElementSibling = null; } };
      made.push(canvas);
      return canvas;
    }
  };
  const map = box && {
    offsetLeft: 0, offsetTop: 0, nextElementSibling: null, ownerDocument: doc,
    parentElement: { querySelectorAll: sel => (sel === '.maplibregl-marker' ? pins : []) },
    after(el) { this.nextElementSibling = el; },
    getBoundingClientRect: () => box
  };
  return { doc, map, paths, made, pins, bar, view };
}
const withH3 = lib => { globalThis.h3 = lib; };

test('the layer is drawn after the map canvas, at its size, with the densest hexagon darkest', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  const info = layer.render(BENGAL, data);
  assert.equal(info.state, 'on');
  assert.equal(info.res, 6);
  assert.equal(info.name, '7 km');
  assert.ok(info.lo > 50 && info.lo < 400 && info.hi > 3000 && info.hi < 30000, JSON.stringify(info));
  const canvas = pg.map.nextElementSibling;
  assert.equal(canvas.id, 'inkdom-timers-people');
  assert.equal(canvas.style.pointerEvents, 'none');
  assert.deepEqual([canvas.style.left, canvas.style.top, canvas.style.width, canvas.style.height], ['0px', '0px', '1280px', '800px']);
  assert.deepEqual([canvas.width, canvas.height], [1280, 800]);
  assert.ok(pg.paths.length > 1000, 'paths ' + pg.paths.length);
  assert.ok(pg.paths.some(p => p.fill === 'rgba(16,21,28,0.780)'));
  assert.ok(pg.paths.every(p => p.max - p.min < 40), 'hexagons are about 25 pixels across here');
});

test('an unchanged view is not drawn again, a new one is', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  const first = layer.render(BENGAL, data), n = pg.paths.length;
  assert.equal(layer.render(Object.assign({}, BENGAL), data), first);
  assert.equal(pg.paths.length, n);
  layer.render(Object.assign({}, BENGAL, { west: 86.5 }), data);
  assert.ok(pg.paths.length > n);
  assert.equal(pg.made.length, 1, 'one canvas, reused');
});

test('a map canvas that was re-made or resized gets the layer back, at the new size', () => {
  withH3(h3);
  const box = Object.assign({}, BOX), pg = page(box), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  layer.render(BENGAL, data);
  const canvas = pg.map.nextElementSibling, n = pg.paths.length;
  pg.map.nextElementSibling = null;
  layer.render(BENGAL, data);
  assert.equal(pg.map.nextElementSibling, canvas, 'put back beside the map');
  assert.equal(pg.paths.length, n, 'the same view is not drawn again');
  box.width = 1000;
  layer.render(BENGAL, data);
  assert.deepEqual([canvas.style.width, canvas.width], ['1000px', 1000]);
  assert.ok(pg.paths.length > n, 'drawn again for the new size');
});

test('zooming out moves to larger hexagons', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  assert.equal(layer.render({ west: 70, south: 13, east: 100, north: 31 }, data).res, 5);
  const world = layer.render({ west: -170, south: -60, east: 170, north: 75 }, data);
  assert.equal(world.res, 2);
  assert.equal(world.name, '370 km');
});

test('at the widest view no hexagon is smeared across the screen', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  assert.equal(layer.render({ west: -234, south: -80, east: 234, north: 84 }, data).state, 'on');
  assert.ok(pg.paths.length > 500, 'paths ' + pg.paths.length);
  assert.ok(pg.paths.every(p => p.max - p.min < 320), 'widest ' + Math.max(...pg.paths.map(p => p.max - p.min)));
});

test('open sea: the layer is on and empty, and the scale has no numbers', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  const info = layer.render({ west: -142, south: -2, east: -138, north: 2 }, data);
  assert.deepEqual([info.state, info.lo, info.hi], ['on', null, null]);
  assert.equal(pg.paths.length, 0);
});

test('no map canvas or no view yet: waiting, and no canvas left behind', () => {
  withH3(h3);
  const none = page(null);
  assert.deepEqual(heat.create(none.doc, { mapCanvas: () => null }).render(BENGAL, data), { state: 'waiting' });
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  layer.render(BENGAL, data);
  assert.deepEqual(layer.render(null, data), { state: 'waiting' });
  assert.equal(pg.map.nextElementSibling, null);
  assert.deepEqual(layer.render(BENGAL, data).state, 'on');
});

test('if H3 fails the layer says so, does not retry the same view, and tries the next one', () => {
  let calls = 0;
  withH3(Object.assign({}, h3, { polygonToCells() { calls++; throw new Error('boom'); } }));
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  assert.deepEqual(layer.render(BENGAL, data), { state: 'h3' });
  assert.deepEqual(layer.render(BENGAL, data), { state: 'h3' });
  assert.equal(calls, 1);
  assert.equal(layer.at(640, 400), null);
  withH3(h3);
  assert.equal(layer.render(Object.assign({}, BENGAL, { west: 86.5 }), data).state, 'on');
});

test('the hexagon under the pointer', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  assert.equal(layer.at(640, 400), null, 'nothing drawn yet');
  layer.render(BENGAL, data);
  const khulna = project.toScreen(BENGAL, BOX, 22.82, 89.55), forest = project.toScreen(BENGAL, BOX, 22.0, 89.3);
  const here = layer.at(khulna.x, khulna.y);
  assert.equal(here.people, 455625);
  assert.ok(here.density > 11400 && here.density < 11600);
  assert.deepEqual(layer.at(forest.x, forest.y), { people: 0, density: 0 });
  layer.remove();
  assert.equal(layer.at(khulna.x, khulna.y), null);
});

test('the pointer reads the size that is drawn', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  const wide = { west: 70, south: 13, east: 100, north: 31 };
  layer.render(wide, data);
  const at = project.toScreen(wide, BOX, 22.82, 89.55), here = layer.at(at.x, at.y);
  assert.ok(here.people > 455625, 'the 20 km hexagon holds more than the 7 km one: ' + here.people);
});

test('the map has moved when the scale bar changes width or every pin shifts', () => {
  const a = {}, b = {}, c = {};
  const at = (scale, list) => ({ scale, pins: new Map(list) });
  const here = at('65px', [[a, 't1'], [b, 't2']]);
  assert.equal(heat.moved(here, at('65px', [[a, 't1'], [b, 't2']])), false);
  assert.equal(heat.moved(here, at('80px', [[a, 't1'], [b, 't2']])), true, 'a zoom');
  assert.equal(heat.moved(here, at('65px', [[a, 'u1'], [b, 'u2']])), true, 'a pan');
  assert.equal(heat.moved(here, at('65px', [[a, 'u1'], [b, 't2']])), false, 'one pin put somewhere else by the game');
  assert.equal(heat.moved(here, at('65px', [[c, 'x']])), false, 'the pins were made anew');
  assert.equal(heat.moved(at('65px', []), at('65px', [])), false, 'no pins');
  assert.equal(heat.moved(at('65px', [[a, 't1']]), at('65px', [[a, 'u1']])), true, 'the only pin shifted');
  assert.equal(heat.moved(null, here), false);
});

test('how the map moved, from where its pins and scale bar went', () => {
  const a = {}, b = {}, c = {};
  const at = (scale, label, list) => ({ scale, label, pins: new Map(list) });
  const pin = (x, y) => 'translate(-50%, -50%) translate(' + x + 'px, ' + y + 'px) rotateX(0deg) rotateZ(0deg)';
  const here = at('65px', '50 km', [[a, pin(100, 200)], [b, pin(300, 400)], [c, pin(-9000, 50)]]);
  assert.deepEqual(heat.follow(here, at('65px', '50 km', [[a, pin(107, 203)], [b, pin(307, 403)], [c, pin(-8993, 53)]])), { k: 1, tx: 7, ty: 3 }, 'a pan');
  assert.deepEqual(heat.follow(here, at('130px', '50 km', [[a, pin(100, 200)], [b, pin(500, 600)], [c, pin(-18100, -100)]])), { k: 2, tx: -100, ty: -200 }, 'a zoom in, twice');
  assert.deepEqual(heat.follow(here, at('130px', '50 km', [[a, pin(100, 200)], [b, pin(500, 600)]])), { k: 2, tx: -100, ty: -200 }, 'a pin gone off the map is not needed');
  assert.deepEqual(heat.follow(here, at('130px', '50 km', [[a, pin(100, 200)]])), { k: 2, tx: -100, ty: -200 }, 'one pin: the zoom comes from the scale bar');
  assert.deepEqual(heat.follow(here, at('65px', '20 km', [[a, pin(100, 200)]])), { k: 2.5, tx: -150, ty: -300 }, 'the bar changed its figure instead of its width');
  assert.deepEqual(heat.follow(here, at('65px', '50 km', [[a, pin(100, 200)], [b, pin(300, 400)], [c, pin(-9000, 50)]])), { k: 1, tx: 0, ty: 0 }, 'nothing moved');
  assert.equal(heat.follow(here, at('65px', '50 km', [[a, pin(107, 203)], [b, pin(300, 400)], [c, pin(-8993, 53)]])), null, 'pins that disagree');
  assert.deepEqual(heat.follow(here, at('130px', '50 km', [[a, pin(100, 200)], [b, pin(300, 400)]])), { k: 1, tx: 0, ty: 0 }, 'two pins outrank the scale bar, which also changes with latitude');
  assert.equal(heat.follow(here, at('130px', '50 km', [])), null, 'a zoom with no pin to anchor it');
  assert.equal(heat.follow(here, at('130px', 'far', [[a, pin(100, 200)]])), null, 'one pin and a scale bar that cannot be read');
  assert.equal(heat.follow(here, at('65px', '50 km', [[a, 'none'], [b, pin(307, 403)], [c, pin(-8993, 53)]])), null, 'a pin that cannot be read');
  assert.equal(heat.follow(at('65px', '50 km', [[a, pin(1, 1)], [b, pin(2, 2)]]), at('65px', '50 km', [[a, pin(1, 1)], [b, pin(8, 8)]])), null, 'pins too close together to tell a zoom from');
});

const NEXT = Object.assign({}, BENGAL, { west: 86.5 });
// Pins that the game itself has moved apart: no pan or zoom of the map explains where they are, from where they
// started or from the other scattering.
const SCATTER = [[[7, 3], [17, 3], [27, 3]], [[9, 5], [60, 90], [5, 200]]];
const shift = (pg, which = 0) => pg.pins.forEach((p, i) => { p.style.transform = 'translate(' + SCATTER[which][i][0] + 'px, ' + SCATTER[which][i][1] + 'px)'; });
const slide = (pg, dx, dy) => pg.pins.forEach((p, i) => { p.style.transform = 'translate(' + ([100, 300, -9000][i] + dx) + 'px, ' + ([200, 400, 50][i] + dy) + 'px)'; });

test('a pan slides the layer along with the map instead of hiding it', () => {
  withH3(h3);
  const visible = [];
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map, onVisible: v => visible.push(v) });
  layer.render(BENGAL, data);
  const canvas = pg.map.nextElementSibling, khulna = project.toScreen(BENGAL, BOX, 22.82, 89.55);
  assert.equal(canvas.style.transformOrigin, '0 0');
  slide(pg, 40, -30);
  layer.check();
  assert.notEqual(canvas.style.visibility, 'hidden');
  assert.equal(canvas.style.transform, 'translate(40px, -30px) scale(1)');
  assert.equal(layer.at(khulna.x + 40, khulna.y - 30).people, 455625, 'the figure follows the slid drawing');
  assert.notEqual(layer.at(khulna.x, khulna.y).people, 455625, 'where Khulna was now shows another hexagon');
  slide(pg, 0, 0);
  layer.check();
  assert.equal(canvas.style.transform, '');
  assert.deepEqual(visible, [true, true], 'never hidden, and told of each slide so the figure under a still pointer is read again');
});

test('a zoom scales the layer around the pin that stayed put, until the next view is drawn', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  layer.render(BENGAL, data);
  const canvas = pg.map.nextElementSibling, khulna = project.toScreen(BENGAL, BOX, 22.82, 89.55);
  pg.bar.style.width = '130px';
  pg.pins[1].style.transform = 'translate(500px, 600px)';
  pg.pins[2].style.transform = 'translate(-18100px, -100px)';
  layer.check();
  assert.notEqual(canvas.style.visibility, 'hidden');
  assert.equal(canvas.style.transform, 'translate(-100px, -200px) scale(2)');
  assert.equal(layer.at(2 * khulna.x - 100, 2 * khulna.y - 200).people, 455625);
  layer.seen();
  assert.equal(layer.render(NEXT, data).state, 'on');
  assert.equal(canvas.style.transform, '', 'drawn afresh for where the map is');
  assert.notEqual(canvas.style.visibility, 'hidden');
});

test('the layer hides the moment the map moves, and comes back if the map returns', () => {
  withH3(h3);
  const visible = [];
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map, onVisible: v => visible.push(v) });
  layer.render(BENGAL, data);
  const canvas = pg.map.nextElementSibling, khulna = project.toScreen(BENGAL, BOX, 22.82, 89.55);
  const was = pg.pins.map(p => p.style.transform);
  shift(pg);
  layer.check();
  assert.equal(canvas.style.visibility, 'hidden');
  assert.equal(layer.at(khulna.x, khulna.y), null, 'no figure for hexagons that are not shown');
  pg.pins.forEach((p, i) => { p.style.transform = was[i]; });
  layer.check();
  assert.equal(canvas.style.visibility, '');
  assert.equal(layer.at(khulna.x, khulna.y).people, 455625);
  assert.deepEqual(visible, [false, true]);
});

test('a move the pins cannot explain hides the layer, and the next view the game reports brings it back', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  layer.render(BENGAL, data);
  const canvas = pg.map.nextElementSibling;
  shift(pg);
  layer.check();
  assert.equal(canvas.style.visibility, 'hidden');
  assert.ok(!canvas.style.transform);
  layer.seen();
  assert.equal(layer.render(NEXT, data).state, 'on');
  assert.equal(canvas.style.visibility, '');
  layer.check();
  assert.equal(canvas.style.visibility, '', 'where the map is now is the new place to compare with');
});

test('a zoom with no pin on screen to anchor it hides the layer', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  pg.pins.length = 0;
  layer.render(BENGAL, data);
  pg.bar.style.width = '80px';
  layer.check();
  assert.equal(pg.map.nextElementSibling.style.visibility, 'hidden');
});

test('a view reported while the map was still moving, where it cannot be followed, stays hidden', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  layer.render(BENGAL, data);
  shift(pg);
  layer.check();
  layer.seen();
  shift(pg, 1);
  layer.render(NEXT, data);
  assert.equal(pg.map.nextElementSibling.style.visibility, 'hidden');
});

test('the same view reported again shows a hidden layer', () => {
  withH3(h3);
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  layer.render(BENGAL, data);
  shift(pg);
  layer.check();
  assert.equal(pg.map.nextElementSibling.style.visibility, 'hidden');
  layer.seen();
  layer.render(BENGAL, data);
  assert.equal(pg.map.nextElementSibling.style.visibility, '');
});

test('with no new view for 8 seconds the layer is shown again as it was', () => {
  withH3(h3);
  let clock = 1000;
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map, now: () => clock });
  layer.render(BENGAL, data);
  const canvas = pg.map.nextElementSibling;
  shift(pg);
  layer.check();
  clock += 7999;
  layer.render(BENGAL, data);
  assert.equal(canvas.style.visibility, 'hidden');
  clock += 1;
  layer.render(BENGAL, data);
  assert.equal(canvas.style.visibility, '');
  layer.check();
  assert.equal(canvas.style.visibility, '');
  shift(pg, 1);
  layer.check();
  assert.equal(canvas.style.visibility, 'hidden', 'and the next move hides it again');
});

test("the layer watches the styles of the map's pins and of the scale bar, once", () => {
  withH3(h3);
  const watching = [];
  let fire = null;
  const pg = page(BOX), layer = heat.create(pg.doc, { mapCanvas: () => pg.map });
  pg.view.MutationObserver = class {
    constructor(callback) { fire = callback; }
    observe(target, options) { watching.push([target, options]); }
    disconnect() {}
  };
  layer.render(BENGAL, data);
  layer.render(NEXT, data);
  assert.equal(watching.length, 2);
  assert.equal(watching[0][0], pg.map.parentElement);
  assert.deepEqual(watching[0][1], { attributes: true, attributeFilter: ['style'], subtree: true });
  assert.equal(watching[1][0], pg.bar);
  shift(pg);
  fire([]);
  assert.equal(pg.map.nextElementSibling.style.visibility, 'hidden');
});
