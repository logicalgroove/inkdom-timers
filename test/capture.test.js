'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../tools/capture/summarize.js');

const S = globalThis.__idtSummarize;
const A = 'aaaaaaaa-0000-4000-8000-000000abc123';
const B = 'aaaaaaaa-0000-4000-8000-000000def456';

test('tick summary keeps shapes and id tails only', () => {
  const body = JSON.stringify({ minx: 86, maxx: 91.5, p_full: true, p_since: 7, p_view_since: null });
  const json = {
    as_of: '2027-01-15T08:00:00Z', geo: [{ id: A, ink: 5 }], view: [{ id: B, ink: 9, name: 'N' }],
    pins: [{ id: A }, { id: B }], shields: [{ player_id: B, slot: 2, shield_until: 'x' }], claims: [], rulers: [1, 2]
  };
  assert.deepEqual(S.tick(body, json, 1.5, 'visible'), {
    t: 1.5, vis: 'visible', full: true, since: 7, view_since: null, width: 5.5,
    keys: 'as_of,claims,geo,pins,rulers,shields,view',
    geo: 1, view: ['def456'], pins: ['abc123', 'def456'], shields: ['def456:2'], claims: 0, directory: null, rulers: 2
  });
});

test('tick summary survives a missing body and an empty response', () => {
  assert.deepEqual(S.tick('', null, 2, 'hidden'), {
    t: 2, vis: 'hidden', full: false, since: null, view_since: null, width: null, keys: '',
    geo: null, view: null, pins: null, shields: null, claims: null, directory: null, rulers: null
  });
});

test('rows summary gives the count and the first row types', () => {
  assert.deepEqual(S.rows([{ player_id: A, alliances: { id: B }, x: null, n: 1, list: [] }, {}]),
    { n: 2, first: { player_id: 'string', alliances: 'object', x: 'null', n: 'number', list: 'array' } });
  assert.deepEqual(S.rows('nope'), { n: 0, first: {} });
});

test('shape describes arrays, objects and scalars compactly', () => {
  assert.equal(S.shape([{ id: 'x', n: 1, list: [1, 2], o: {}, z: null }, {}]), 'array(2) of {id:string, n:number, list:array(2), o:object, z:null}');
  assert.equal(S.shape([]), 'array(0)');
  assert.equal(S.shape({ a: [1], b: 'x' }), '{a:array(1), b:string}');
  assert.equal(S.shape(5), 'number');
  assert.equal(S.shape(null), 'null');
});

test('query keeps filter operators and hides ids and select lists', () => {
  assert.equal(S.query('https://x.co/rest/v1/claims?select=id%2Cat_ms&id=gt.682350&order=id.asc&limit=50'), 'select&id=gt.682350&order=id.asc&limit=50');
  assert.equal(S.query('https://x.co/rest/v1/players?select=id&id=in.(' + A + ',' + B + ')'), 'select&id=in.(2 ids)');
  assert.equal(S.query('https://x.co/rest/v1/player_lands?player_id=eq.' + A), 'player_id=eq.<id>');
  assert.equal(S.query('https://x.co/rest/v1/rpc/my_state'), '');
});

test('body lists keys with numbers and booleans, never string values', () => {
  assert.equal(S.body(JSON.stringify({ minx: 86.123456, p_full: true, p_id: A, note: 'secret', o: { a: 1 }, z: null })), 'minx:86.12 p_full:true p_id:<id> note:str o:object z:null');
  assert.equal(S.body('not json'), '');
  assert.equal(S.body(''), '');
});

test('sample keeps structure, numbers, dates and short codes, and masks names, ids and long text', () => {
  const json = {
    as_of: '2027-01-15T08:00:00Z', n: 3, ok: true, none: null,
    players: [
      { id: A, name: 'Tessaly', monogram: 'TE', color: '#3fb6c9', kind: 'loop', note: 'x'.repeat(40), su: 1800000000000, lands: [{ slot: 1, by_name: 'Marrow' }, { slot: 2 }] },
      { id: B }
    ],
    empty: [], tags: ['a', 'b']
  };
  assert.deepEqual(S.sample(json), {
    as_of: '2027-01-15T08:00:00Z', n: 3, ok: true, none: null,
    players: { _n: 2, _0: { id: 'id_abc123', name: 'str(7)', monogram: 'str(2)', color: '#3fb6c9', kind: 'loop', note: 'str(40)', su: 1800000000000, lands: { _n: 2, _0: { slot: 1, by_name: 'str(6)' } } } },
    empty: { _n: 0 }, tags: { _n: 2, _0: 'a' }
  });
});

test('sample stops at five levels and survives scalars', () => {
  assert.deepEqual(S.sample({ a: { b: { c: { d: { e: { f: 1 } } } } } }), { a: { b: { c: { d: { e: 'object' } } } } });
  assert.equal(S.sample(7), 7);
  assert.equal(S.sample('aaaaaaaa-0000-4000-8000-000000abc123'), 'id_abc123');
});
