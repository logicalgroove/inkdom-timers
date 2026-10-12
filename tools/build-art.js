'use strict';
// Renders the icon artwork in store/ to the PNG files the manifest lists. Needs the `rsvg-convert` command.
//   node tools/build-art.js
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
// The 128 pixel icon keeps the 16 clear pixels on each side that the Chrome Web Store asks for.
// The small ones fill their square, with a dot where the drop would be too small to read.
const ART = [
  ['store/icon-small.svg', 16], ['store/icon-small.svg', 32], ['store/icon-small.svg', 48], ['store/icon.svg', 128]
];
for (const [from, size] of ART) {
  const to = 'icons/icon-' + size + '.png';
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', path.join(root, to), path.join(root, from)]);
  console.log(to);
}
