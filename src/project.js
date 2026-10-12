(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  // The game asks "who is in view" for an area 30% wider and taller than the map on screen, centred on it.
  // Measured live on 2026-10-09 against the scale bar; rings drawn with this factor sat exactly on avatars.
  const PAD = 1.3;
  const mercator = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

  // Turns the asked edges and the canvas size into a function from (lat, lng) to canvas pixels.
  // North is up; the map is not rotated. Returns null when there is nothing to project onto.
  function projector(bounds, size) {
    if (!bounds || !size || !(size.width > 0) || !(size.height > 0)) return null;
    const west = bounds.west, east = bounds.east <= west ? bounds.east + 360 : bounds.east; // a view across the date line
    const middle = (west + east) / 2, north = mercator(bounds.north), south = mercator(bounds.south);
    const kx = (size.width * PAD) / (east - west), ky = (size.height * PAD) / (north - south);
    const ox = (size.width * (PAD - 1)) / 2, oy = (size.height * (PAD - 1)) / 2;
    if (!Number.isFinite(kx) || !Number.isFinite(ky)) return null;
    return {
      // A longitude is taken the short way round from the middle of the view, so a point just west of the
      // view stays on the left and one just east of it stays on the right.
      x(lng) {
        let v = lng;
        while (v < middle - 180) v += 360;
        while (v > middle + 180) v -= 360;
        return (v - west) * kx - ox;
      },
      y(lat) { return (north - mercator(lat)) * ky - oy; },
      // The way back. lng is not wrapped: across the date line it runs past 180.
      lng(x) { return west + (x + ox) / kx; },
      lat(y) { return (Math.atan(Math.exp(north - (y + oy) / ky)) * 360) / Math.PI - 90; },
      pxPerDegree: kx
    };
  }

  // Where (lat, lng) falls, measured from the canvas's top left corner.
  function toScreen(bounds, size, lat, lng) {
    const p = projector(bounds, size);
    if (!p) return null;
    const x = p.x(lng), y = p.y(lat);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  // rings: a land shape as flat [lng, lat, lng, lat, ...] arrays. Returns one SVG path for all of them, how many
  // of its points are on screen, and the middle of those, which is where the name goes.
  function pathOf(rings, bounds, size) {
    const p = Array.isArray(rings) && rings.length ? projector(bounds, size) : null;
    if (!p) return null;
    let d = '', sx = 0, sy = 0, n = 0;
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        const x = p.x(ring[i]), y = p.y(ring[i + 1]);
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        if (x >= 0 && x <= size.width && y >= 0 && y <= size.height) { sx += x; sy += y; n++; }
      }
      d += 'Z';
    }
    return { d, n, cx: n ? sx / n : null, cy: n ? sy / n : null };
  }

  // The place under a point of the canvas, the inverse of toScreen. Longitude comes back within -180 to 180.
  function fromScreen(bounds, size, x, y) {
    const p = projector(bounds, size);
    if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const lat = p.lat(y), lng = ((((p.lng(x) + 180) % 360) + 360) % 360) - 180;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  // The part of the world that is on screen. east is above west even across the date line.
  function rectOf(bounds, size) {
    const p = projector(bounds, size);
    if (!p) return null;
    const rect = { west: p.lng(0), east: p.lng(size.width), south: p.lat(size.height), north: p.lat(0) };
    return Object.values(rect).every(Number.isFinite) ? rect : null;
  }

  // How many screen pixels one kilometre takes, east to west, at the middle of the screen.
  function pxPerKm(bounds, size) {
    const p = projector(bounds, size);
    if (!p) return null;
    const v = p.pxPerDegree / (111.32 * Math.cos((p.lat(size.height / 2) * Math.PI) / 180));
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  IDT.project = { PAD, projector, toScreen, pathOf, fromScreen, rectOf, pxPerKm };
})(globalThis);
