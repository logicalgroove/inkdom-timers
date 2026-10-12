'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// In the page's world reduce.js and tap.js are the only files there are. This file loads nothing else.
test('reduce.js and tap.js load and work with no other module present', () => {
  const IDT = require('../support/load.js')('reduce.js', 'tap.js');
  assert.equal(IDT.guards, undefined);
  assert.equal(IDT.reduce.kindOf('/api/read'), 'read');
  const fx = require('../support/fixtures.js');
  const events = IDT.reduce.reduce('read', fx.viewMembers());
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].in_view, [fx.P1, fx.P2, fx.ME]);
  assert.equal(typeof IDT.tap.install, 'function');
});

test('before the own record has been seen, a map answer sets no self at all', () => {
  const IDT = require('../support/load.js')('reduce.js');
  const fx = require('../support/fixtures.js');
  const events = IDT.reduce.reduce('tick', fx.tick());
  assert.equal(events[0].self, null);
  assert.deepEqual(events[0].players.map(p => p.id), [fx.P1, fx.P2, fx.ME]);
});
