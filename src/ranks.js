(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});

  // Season 2: name, land from (km2), base tank (km), empty to full (minutes).
  const TABLE = [
    ['Street', 0, 6, 1], ['Block', 1, 10, 1], ['Neighborhood', 5, 14, 1], ['District', 12, 22, 1],
    ['Town', 40, 34, 3], ['City', 150, 50, 6], ['Metropolis', 500, 72, 13], ['County', 1500, 95, 23],
    ['Region', 5000, 125, 40], ['State', 15000, 160, 66], ['Nation', 50000, 200, 102],
    ['Empire', 150000, 250, 162], ['Superpower', 500000, 310, 252]
  ].map(([name, from, tank, refillMin]) => ({ name, from, tank, refillMin }));

  function rankFor(km2) {
    const n = typeof km2 === 'number' && Number.isFinite(km2) && km2 > 0 ? km2 : 0;
    let rank = TABLE[0];
    for (const row of TABLE) if (n >= row.from) rank = row;
    return rank;
  }

  IDT.ranks = { TABLE, rankFor };
})(globalThis);
