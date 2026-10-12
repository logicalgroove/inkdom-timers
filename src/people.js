(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  const MAGIC = [0x49, 0x44, 0x54, 0x50]; // "IDTP"
  const VERSION = 1, RES = 6, MIN_RES = 2, MAX_KEY = 0x1ffffff;
  // How far across a hexagon is at each H3 resolution, in km: twice the average edge.
  const ACROSS = { 2: 365, 3: 138, 4: 52.1, 5: 19.7, 6: 7.45 };
  const NAMES = { 2: '370 km', 3: '140 km', 4: '50 km', 5: '20 km', 6: '7 km' };
  const MIN_PX = 8, MAX_ON_SCREEN = 25000;

  // The packed file: 12 header bytes, then per hexagon the step from the previous key and the people, as varints.
  function decode(buffer) {
    const b = new Uint8Array(buffer);
    if (b.length < 12 || MAGIC.some((c, i) => b[i] !== c)) throw new Error('people data: not the expected file');
    if (b[4] !== VERSION) throw new Error('people data: format version ' + b[4]);
    if (b[5] !== RES) throw new Error('people data: resolution ' + b[5]);
    const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(8, true);
    const keys = new Uint32Array(n), people = new Uint32Array(n);
    let at = 12, key = 0;
    const varint = () => {
      let v = 0, scale = 1, byte;
      do {
        if (at >= b.length) throw new Error('people data: cut short');
        byte = b[at++];
        v += (byte & 0x7f) * scale;
        scale *= 128;
      } while (byte & 0x80);
      return v;
    };
    for (let i = 0; i < n; i++) {
      const step = varint();
      if (i > 0 && step === 0) throw new Error('people data: keys out of order');
      key += step;
      if (key > MAX_KEY) throw new Error('people data: key out of range');
      keys[i] = key;
      people[i] = varint();
    }
    if (at !== b.length) throw new Error('people data: ' + (b.length - at) + ' bytes too many');
    return { res: RES, keys, people };
  }

  // Reads and unpacks the packed file. Whatever goes wrong, in url(), in fetcher() or in the file itself,
  // the promise rejects: nothing is thrown at the caller.
  function load(url, fetcher) {
    return Promise.resolve()
      .then(() => fetcher(url()))
      .then(res => {
        if (!res.ok) throw new Error('people data: status ' + res.status);
        return res.arrayBuffer();
      })
      .then(decode);
  }

  // keys ascending and unique. Used by the build tool and the tests.
  function encode(keys, people) {
    const n = keys.length, out = MAGIC.concat([VERSION, RES, 0, 0, n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24]);
    const varint = v => {
      while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); }
      out.push(v);
    };
    let prev = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0 && keys[i] <= prev) throw new Error('people data: keys must ascend');
      varint(keys[i] - prev);
      varint(people[i]);
      prev = keys[i];
    }
    return Uint8Array.from(out);
  }

  // A larger hexagon's key is the start of its children's keys, so one pass over the sorted keys sums them.
  function coarser(level, res) {
    const shift = 3 * (level.res - res), n = level.keys.length;
    const keys = new Uint32Array(n), people = new Uint32Array(n);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const k = level.keys[i] >>> shift;
      if (m > 0 && keys[m - 1] === k) people[m - 1] += level.people[i];
      else { keys[m] = k; people[m] = level.people[i]; m++; }
    }
    return { res, keys: keys.slice(0, m), people: people.slice(0, m) };
  }

  function find(level, key) {
    let lo = 0, hi = level.keys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, k = level.keys[mid];
      if (k === key) return level.people[mid];
      if (k < key) lo = mid + 1;
      else hi = mid - 1;
    }
    return 0;
  }

  // The part of an H3 id that varies at its own resolution: the base cell, then one 3 bit digit per step.
  // id is 15 hex digits. No BigInt here: this runs once per hexagon on screen.
  function keyOf(id) {
    const high = parseInt(id.slice(0, -8), 16), low = parseInt(id.slice(-8), 16);
    const res = (high >>> 20) & 15, shift = 45 - 3 * res, top = high & 0xfffff;
    return shift >= 32 ? top >>> (shift - 32) : top * Math.pow(2, 32 - shift) + (low >>> shift);
  }
  function cellOf(key, res) {
    const low = BigInt(45 - 3 * res);
    return ((1n << 59n) | (BigInt(res) << 52n) | (BigInt(key) << low) | ((1n << low) - 1n)).toString(16);
  }

  // The smallest hexagons that are at least MIN_PX across and at most MAX_ON_SCREEN on a canvas of pixelArea.
  function resFor(pxPerKm, pixelArea) {
    for (let res = RES; res > MIN_RES; res--) {
      const px = ACROSS[res] * pxPerKm;
      if (px >= MIN_PX && pixelArea / (0.65 * px * px) <= MAX_ON_SCREEN) return res;
    }
    return MIN_RES;
  }

  // The shading is fitted to what is on screen: lo is the emptiest twentieth, hi the fullest hundredth.
  function scale(densities) {
    const d = Array.from(densities).filter(v => v > 0).sort((a, b) => a - b);
    if (!d.length) return null;
    const at = p => d[Math.min(d.length - 1, Math.floor(d.length * p))];
    return { lo: at(0.05), hi: at(0.99) };
  }
  function alpha(density, s) {
    if (!s || !(density > 0)) return 0;
    if (!(s.hi > s.lo)) return 0.4;
    const t = Math.min(1, Math.max(0, (Math.log(density) - Math.log(s.lo)) / (Math.log(s.hi) - Math.log(s.lo))));
    return 0.04 + 0.74 * Math.pow(t, 2.2);
  }

  IDT.people = { RES, MIN_RES, ACROSS, NAMES, MIN_PX, MAX_ON_SCREEN, decode, load, encode, coarser, find, keyOf, cellOf, resFor, scale, alpha };
})(globalThis);
