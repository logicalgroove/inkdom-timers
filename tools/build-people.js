'use strict';
// Packs Kontur's 3 km population hexagons into data/people-r6.bin. Developer tool, not shipped code.
//   node tools/build-people.js /path/to/kontur_population_20231101_r6.gpkg
// The .gpkg is a SQLite file; it is read through the sqlite3 command so the project keeps no dependencies.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const people = require('../support/load.js')('people.js').people;

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('usage: node tools/build-people.js <path to the .gpkg>');
  process.exit(2);
}
const out = path.join(__dirname, '..', 'data', 'people-r6.bin');
const rows = [];
const fail = msg => { console.error(msg); process.exit(1); };

const sql = spawn('sqlite3', ['-readonly', source, 'select h3, cast(population as integer) from population;'], { stdio: ['ignore', 'pipe', 'inherit'] });
sql.on('error', () => fail('could not run sqlite3: is it on the path?'));
readline.createInterface({ input: sql.stdout }).on('line', line => {
  const [id, n] = line.split('|'), count = Number(n);
  if (!/^86[0-9a-f]{13}$/.test(id)) fail('not a resolution 6 hexagon: ' + line);
  if (!Number.isInteger(count) || count < 1) fail('not a whole number of people: ' + line);
  rows.push([people.keyOf(id), count]);
});
sql.on('close', code => {
  if (code !== 0) fail('sqlite3 ended with code ' + code);
  rows.sort((a, b) => a[0] - b[0]);
  const bytes = people.encode(rows.map(r => r[0]), rows.map(r => r[1]));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  const total = rows.reduce((sum, r) => sum + r[1], 0);
  console.log('hexagons ' + rows.length + ', people ' + total + ', bytes ' + bytes.length +
    ', sha256 ' + crypto.createHash('sha256').update(bytes).digest('hex'));
});
