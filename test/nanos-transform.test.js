import { NANOS } from '../src/nanos.esm.js';
import {
    assert,
    assertEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';

Deno.test('NANOS transform: set/named disabled', () => {
    const n = new NANOS();
    const a = [1, 2], m = new Map([['a', 1]]), o = { a: 1 }, s = new Set([1]);
    n.set('a', a);
    n.set('m', m);
    n.set('o', o);
    n.set('s', s);
    assert(n.at('a') === a);
    assert(n.at('m') === m);
    assert(n.at('o') === o);
    assert(n.at('s') === s);
});

Deno.test('NANOS transform: set/named enabled', () => {
    const n = new NANOS().setOptions({ transform: true });
    const a = [1, 2], m = new Map([['a', 1]]), o = { a: 1 }, s = new Set([1]);
    n.set('a', a);
    n.set('m', m);
    n.set('o', o);
    n.set('s', s);
    assert(n.at('a') instanceof NANOS);
    assert(n.at('m') instanceof NANOS);
    assert(n.at('o') instanceof NANOS);
    assert(n.at('s') instanceof NANOS);
    assertEquals(n.at('a').pairs(true), [0, 1, 1, 2]);
    assertEquals(n.at('m').pairs(true), ['a', 1]);
    assertEquals(n.at('o').pairs(true), ['a', 1]);
    assertEquals(n.at('s').pairs(true), [0, 1]);
});

Deno.test('NANOS transform: push outer', () => {
    const n = new NANOS();
    const a = [1, 2], m = new Map([['a', 1]]), o = { b: 1 }, s = new Set([1]);
    n.push(a, m, o, s);
    assertEquals(n.pairs(true), [0, 1, 1, 2, 'a', 1, 'b', 1, 2, 1]);
});

Deno.test('NANOS transform: push inner disabled', () => {
    const n = new NANOS();
    const a = [1, 2], m = new Map([['a', 1]]), o = { a: 1 }, s = new Set([1]);
    n.push([a], [m], [o], [s]);
    assert(n.at(0) === a);
    assert(n.at(1) === m);
    assert(n.at(2) === o);
    assert(n.at(3) === s);
});

Deno.test('NANOS transform: push inner "sets"', () => {
    const n = new NANOS().setOptions({ transform: 'sets' });
    const a = [1, 2], m = new Map([['a', 1]]), o = { b: 1 }, s = new Set([1]);
    n.push([a], [m], [o], [s]);
    assertEquals(n.size, 4);
    assertEquals(n.next, 2);
    assert(n.at(0) instanceof NANOS); // a
    assertEquals(n.at('a'), 1); // ...m
    assertEquals(n.at('b'), 1); // ...o
    assert(n.at(1) instanceof NANOS); // s
    assertEquals(n.at(0).pairs(true), [0, 1, 1, 2]);
    assertEquals(n.at(1).pairs(true), [0, 1]);
});

Deno.test('NANOS transform: push nested inner "sets"', () => {
    const n = new NANOS().setOptions({ transform: 'sets' });
    n.push(['a', {b: 1}, ['c', {d: 1}]]);
    assertEquals(n.toSLID(), '[(a b=1 [c d=1])]');
    assertEquals(n.size, 3);
    assertEquals(n.next, 2);
    assert(n.at(1) instanceof NANOS);

    n.clear();
    n.push(new Set(['a', new Map([['b', 1]]), new Set(['c', new Map([['d', 1]])])]));
    assertEquals(n.toSLID(), '[(a b=1 [c d=1])]');
    assertEquals(n.size, 3);
    assertEquals(n.next, 2);
    assert(n.at(1) instanceof NANOS);
});

Deno.test('NANOS transform: push deeply nested', () => {
    const n = new NANOS().setOptions({ transform: 'all' });
    n.push(['contents', [ [ [ 'deep' ] ] ] ]);
    assertEquals(n.at(0), 'contents');
    assert(n.at(1) instanceof NANOS);
    assert(n.at([1, 0]) instanceof NANOS);
    assert(n.at([1, 0, 0]) instanceof NANOS);
    assertEquals(n.at([1, 0, 0, 0]), 'deep');
    assertEquals(n.toSLID(), '[(contents [[[deep]]])]');
});

Deno.test('NANOS transform: push inner merge map-ish with "sets"', () => {
    const n = new NANOS().setOptions({ transform: 'sets' });
    n.push({ a: 1 }, new Map([['b', 2]]));
    assertEquals(n.pairs(true), ['a', 1, 'b', 2]);
});

Deno.test('NANOS transform: push inner "all"', () => {
    const n = new NANOS().setOptions({ transform: 'all' });
    const a = [1, 2], m = new Map([['a', 1]]), o = { a: 1 }, s = new Set([1]);
    n.push([a], [m], [o], [s]);
    assert(n.at(0) instanceof NANOS);
    assert(n.at(1) instanceof NANOS);
    assert(n.at(2) instanceof NANOS);
    assert(n.at(3) instanceof NANOS);
    assertEquals(n.at(0).pairs(true), [0, 1, 1, 2]);
    assertEquals(n.at(1).pairs(true), ['a', 1]);
    assertEquals(n.at(2).pairs(true), ['a', 1]);
    assertEquals(n.at(3).pairs(true), [0, 1]);
});
