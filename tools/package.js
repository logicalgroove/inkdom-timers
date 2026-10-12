'use strict';
// Builds the zip that is uploaded to the Chrome Web Store: the manifest and the folders it loads from, nothing
// else. Needs the `zip` command.
//   node tools/package.js            writes dist/inkdom-timers-<version>.zip and prints its path
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const FOLDERS = ['src', 'vendor', 'data', 'icons'];

function walk(root, dir, out) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = dir + '/' + entry.name;
    if (entry.isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

// Every file that ships, as paths from root with forward slashes, sorted.
function list(root) {
  const out = ['manifest.json'];
  for (const dir of FOLDERS) walk(root, dir, out);
  return out.sort();
}

function build(root, outDir) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
  const zip = path.join(outDir, 'inkdom-timers-' + version + '.zip');
  fs.mkdirSync(outDir, { recursive: true });
  // zip adds to an archive that is already there, so a file since removed would stay in it.
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-q', '-X', zip, '-@'], { cwd: root, input: list(root).join('\n') + '\n' });
  return zip;
}

module.exports = { list, build };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const zip = build(root, path.join(root, 'dist'));
  console.log(path.relative(root, zip) + '  ' + (fs.statSync(zip).size / 1048576).toFixed(1) + ' MB, ' + list(root).length + ' files');
}
