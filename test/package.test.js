'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { list, build } = require('../tools/package.js');

const root = path.join(__dirname, '..');

// A small stand-in for the repository: the extension's own folders next to everything that must stay behind.
function tree(t, version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idt-pack-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = {
    'manifest.json': JSON.stringify({ manifest_version: 3, name: 'x', version }), 'src/a.js': 'a', 'src/deep/b.js': 'b',
    'vendor/lib.js': 'lib', 'data/d.bin': 'd', 'icons/i.png': 'i',
    'src/.DS_Store': 'x', 'README.md': 'x', 'package.json': '{}', 'test/a.test.js': 'x', 'docs/notes.md': 'x',
    'tools/capture/manifest.json': '{}', 'store/icon.svg': 'x', 'support/load.js': 'x', 'node_modules/m/index.js': 'x'
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}
const inZip = zip => execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n').sort();
const SHIPPED = ['data/d.bin', 'icons/i.png', 'manifest.json', 'src/a.js', 'src/deep/b.js', 'vendor/lib.js'];

test('only the manifest and the four extension folders are listed, without hidden files', t => {
  assert.deepEqual(list(tree(t, '9.8.7')), SHIPPED);
});

test('everything the manifest names is listed, and the H3 licence with it', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const named = [].concat(...manifest.content_scripts.map(e => e.js), ...manifest.web_accessible_resources.map(e => e.resources),
    Object.values(manifest.icons), ['vendor/h3-js.LICENSE', 'vendor/h3-js.NOTICE']);
  const shipped = new Set(list(root));
  for (const file of named) assert.ok(shipped.has(file), file);
});

test('the zip is named after the version and holds the listed files, manifest at the top', t => {
  const dir = tree(t, '9.8.7');
  const zip = build(dir, path.join(dir, 'dist'));
  assert.equal(path.relative(dir, zip), path.join('dist', 'inkdom-timers-9.8.7.zip'));
  assert.deepEqual(inZip(zip), SHIPPED);
});

test('a second build leaves nothing in the zip from the first', t => {
  const dir = tree(t, '9.8.7');
  build(dir, path.join(dir, 'dist'));
  fs.rmSync(path.join(dir, 'src/deep/b.js'));
  assert.deepEqual(inZip(build(dir, path.join(dir, 'dist'))), SHIPPED.filter(f => f !== 'src/deep/b.js'));
});
