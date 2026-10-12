'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// Chrome runs a content-script file once per frame for an extension. A file listed in two entries runs only in
// the first one's world, and the other world silently goes without it (seen on 2026-10-09 with guards.js).
test('no script file is listed in more than one content script entry', () => {
  const seen = new Map();
  manifest.content_scripts.forEach((entry, i) => {
    for (const file of entry.js) {
      assert.equal(seen.has(file), false, file + ' is in entries ' + seen.get(file) + ' and ' + i);
      seen.set(file, i);
    }
  });
});

test('every listed script exists', () => {
  for (const entry of manifest.content_scripts) for (const file of entry.js) assert.ok(fs.existsSync(path.join(root, file)), file);
});

test('the page-world entry holds only the tap and its reducers, and runs first', () => {
  const page = manifest.content_scripts.filter(e => e.world === 'MAIN');
  assert.equal(page.length, 1);
  assert.deepEqual(page[0].js, ['src/reduce.js', 'src/tap.js']);
  for (const entry of manifest.content_scripts) assert.equal(entry.run_at, 'document_start');
});

test('the H3 library is the pinned, unmodified file', () => {
  const bytes = fs.readFileSync(path.join(root, 'vendor/h3-js.umd.js'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '4180c39bcf5e6bb8f1f236d8a245e51416a0109a3195a475f442ef0a290ca08a');
  for (const file of ['vendor/h3-js.LICENSE', 'vendor/h3-js.NOTICE']) assert.ok(fs.existsSync(path.join(root, file)), file);
});

test('the extension world loads H3 first, and the layer after what it uses', () => {
  const own = manifest.content_scripts.filter(e => e.world !== 'MAIN');
  assert.equal(own.length, 1);
  const at = file => own[0].js.indexOf(file);
  assert.equal(at('vendor/h3-js.umd.js'), 0);
  for (const before of ['src/project.js', 'src/people.js']) assert.ok(at(before) >= 0 && at(before) < at('src/heat.js'), before);
  assert.ok(at('src/heat.js') < at('src/content.js'));
});

test('the people data is the one file the game page may read, and it is there', () => {
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: ['data/people-r6.bin'], matches: ['https://inkdom.io/*'] }]);
  assert.ok(fs.existsSync(path.join(root, 'data/people-r6.bin')));
});

test('still one permission, and version 0.5.0', () => {
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.version, '0.5.0');
});

// Firefox: Manifest V3 needs a fixed add-on id, and addons.mozilla.org refuses a new upload without a data
// collection declaration. Content scripts in the page world need Firefox 128; the declaration is understood from
// 140 on desktop and 142 on Android, and web-ext lint warns below those.
test('the Firefox block names the add-on, Firefox 140 on desktop and 142 on Android, and no data collection', () => {
  assert.deepEqual(manifest.browser_specific_settings, {
    gecko: { id: 'inkdom-timers@logicalgroove.github.io', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
    gecko_android: { strict_min_version: '142.0' }
  });
});

test('package.json carries the same version as the manifest', () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, manifest.version);
});

// The Chrome Web Store refuses an upload whose description is longer.
test('the description is at most 132 characters', () => {
  assert.ok(manifest.description.length <= 132, manifest.description.length + ' characters');
});

test('each of the four icons is a PNG of the size it is listed under', () => {
  assert.deepEqual(Object.keys(manifest.icons || {}), ['16', '32', '48', '128']);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.toString('latin1', 1, 4), 'PNG', file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [Number(size), Number(size)], file);
  }
});
