'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IDT = require('../support/load.js')('guards.js', 'reduce.js', 'tap.js');
const fx = require('../support/fixtures.js');

const TICK_URL = 'https://abc.supabase.co/rest/v1/rpc/world_tick2';
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const json = (body, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

function fakeWindow(respond) {
  const win = {
    calls: [], posted: [],
    location: { origin: 'https://inkdom.io' },
    fetch(...args) { win.calls.push({ self: this, args }); return respond(...args); },
    postMessage(msg, origin) { win.posted.push({ msg, origin }); }
  };
  IDT.tap.install(win, IDT.reduce);
  return win;
}

test('loading the file in Node installs nothing and keeps the namespace', () => {
  assert.equal(typeof IDT.tap.install, 'function');
  assert.equal(typeof IDT.reduce.reduce, 'function');
});

test('the caller gets the original response with its body unread', async () => {
  const win = fakeWindow(json(fx.tick()));
  const res = await win.fetch(TICK_URL);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).as_of, fx.iso(fx.T));
});

test('arguments and this pass through untouched', async () => {
  const win = fakeWindow(json({}));
  const init = { method: 'POST' };
  await win.fetch.call(win, TICK_URL, init);
  assert.equal(win.calls[0].self, win);
  assert.equal(win.calls[0].args.length, 2);
  assert.equal(win.calls[0].args[1], init);
});

test('the request init is never read', async () => {
  const win = fakeWindow(json(fx.tick()));
  const boom = () => { throw new Error('init was read'); };
  await win.fetch(TICK_URL, new Proxy({}, { get: boom, has: boom, ownKeys: boom, getOwnPropertyDescriptor: boom }));
  await settle();
  assert.equal(win.posted.length, 1);
});

test("for the game's view question the body is read, nothing else of the request, and the edges ride along", async () => {
  const win = fakeWindow(json(fx.viewMembers()));
  const body = JSON.stringify({ fn: 'view_members', args: { minx: 86.25, miny: 21.5, maxx: 91.6, maxy: 24.4 } });
  const boom = prop => { throw new Error('read ' + String(prop)); };
  const init = new Proxy({ body, headers: { authorization: 'secret' } }, { get: (target, prop) => (prop === 'body' ? target.body : boom(prop)), has: (t, prop) => boom(prop), ownKeys: () => boom('keys') });
  await win.fetch('/api/read', init);
  await settle();
  assert.deepEqual(win.posted[0].msg.events[0].bounds, { west: 86.25, south: 21.5, east: 91.6, north: 24.4 });
  assert.equal(JSON.stringify(win.posted).includes('secret'), false);
});

test('a view question whose body is not text gives the view without edges', async () => {
  const win = fakeWindow(json(fx.viewMembers()));
  await win.fetch('/api/read', { method: 'POST', body: new Uint8Array([1, 2, 3]) });
  await win.fetch('/api/read');
  await settle();
  assert.deepEqual(win.posted.map(p => p.msg.events[0].bounds), [null, null]);
});

test('a map refresh is posted once, to the page origin, as a world event', async () => {
  const win = fakeWindow(json(fx.tick()));
  await win.fetch(TICK_URL);
  await settle();
  assert.equal(win.posted.length, 1);
  assert.equal(win.posted[0].origin, 'https://inkdom.io');
  assert.equal(win.posted[0].msg.source, 'inkdom-timers');
  assert.equal(win.posted[0].msg.v, 1);
  assert.deepEqual(win.posted[0].msg.events.map(e => e.type), ['world']);
});

test('a map refresh that is not understood posts a miss', async () => {
  const win = fakeWindow(json({ renamed: true }));
  await win.fetch(TICK_URL);
  await settle();
  assert.deepEqual(win.posted.map(p => p.msg), [{ source: 'inkdom-timers', v: 1, miss: 'tick' }]);
});

test('a Request-like object and a URL object are recognised', async () => {
  const win = fakeWindow(json(fx.tick()));
  await win.fetch({ url: TICK_URL });
  await win.fetch(new URL(TICK_URL));
  await settle();
  assert.equal(win.posted.length, 2);
});

test('other URLs, failed responses and non-JSON bodies post nothing', async () => {
  const cases = [
    ['https://abc.supabase.co/rest/v1/rpc/my_state', json({ economy: { wallet: 5 } })],
    ['/api/boards/v1/2/rulers/5.json', json({ rows: [{ player_id: fx.ME }] })],
    ['https://abc.supabase.co/rest/v1/alliance_members?player_id=eq.x', json([{ alliance_id: fx.AL, role: 'member' }])],
    [TICK_URL, json(fx.tick(), 500)],
    [TICK_URL, () => Promise.resolve(new Response('<html>', { status: 200 }))]
  ];
  for (const [url, respond] of cases) {
    const win = fakeWindow(respond);
    await win.fetch(url);
    await settle();
    assert.equal(win.posted.length, 0, url);
  }
});

test('a rejected fetch rejects for the caller and nothing else happens', async () => {
  const offline = new Error('offline');
  const win = fakeWindow(() => Promise.reject(offline));
  await assert.rejects(win.fetch(TICK_URL), offline);
  await settle();
  assert.equal(win.posted.length, 0);
});

test('a throwing postMessage never reaches the caller', async () => {
  const win = fakeWindow(json(fx.tick()));
  win.postMessage = () => { throw new Error('blocked'); };
  const res = await win.fetch(TICK_URL);
  await settle();
  assert.equal(res.ok, true);
});

test('a same-origin /api/read answer that is not understood is not a miss', async () => {
  const win = fakeWindow(json({ fn: 'something_else', rows: [] }));
  await win.fetch('/api/read', { method: 'POST' });
  await settle();
  assert.equal(win.posted.length, 0);
});

test('view_members through /api/read is posted as a world event', async () => {
  const win = fakeWindow(json(fx.viewMembers()));
  await win.fetch('/api/read', { method: 'POST' });
  await settle();
  assert.deepEqual(win.posted[0].msg.events[0].in_view, [fx.P1, fx.P2, fx.ME]);
});

test('a window without fetch is left alone', () => {
  assert.equal(IDT.tap.install({ location: { origin: 'x' }, postMessage() {} }, IDT.reduce), false);
});
