// Baseline testing (no transform, no opaque types)

// Value-types:
// - scalar (e.g. string, number)
// - Plain object, o: {3: 'o:3', ok: 'o:v', 1: 'o:1'}
// - Map equivalent, m: ([[3, 'm:3'], ['mk', 'm:v'], [1, 'm:1']])
// - Array, a (sparse beginning, middle, and end, e.g. [, 'a:1', , 'a:3', ,])
// - Set, s: (['s:0', 's:1'])
// - NANOS n: fromPairs({type: '@NANOS', pairs: [1, 'n:1', nk: 'n:v', 3, 'n:3'], next: 5})

// - top-level values (e.g. `.push('s', 1, o, m, a, s, n)`) merge contents
// - push is sparse-preserving (where applicable), individually and in combination
//   - e.g. `push(a, a).toJSON()` // {type: '@NANOS@', pairs: [1, 'a:1', 3, 'a:3', 6: 'a:1', 8: 'a:3'], next: 10}
// - inner values remain original (`[o, m, a, s, n]`, Set([o, m, a, s, n]), {o, m, a, s, n}, etc)
// - push: existing keys overwrite (same position), new keys added at end
//   - initial keys (each time): ['first', '1', 'middle', '3', 'last']
//   - .push({ middle: ...}) // keys unchanged
//   - .push({ newKey: ...}) // new keys: ['first', '1', 'middle', '3', 'last', 'newKey']
// - pushing duplicate keys (in different objects): right-most value precedence
// - unshift: existing keys overwrite (same position), new keys added at start
//   - initial keys (each time): ['first', '1', 'middle', '3', 'last']
//   - .unshift({ middle: ...}) // keys unchanged
//   - .unshift({ newKey: ...}) // new keys: ['newKey', 'first', '1', 'middle', '3', 'last']
// - unshift(o, m, a, s, n) equals unshift(n).unshift(s).unshift(a).unshift(m).unshift(o)
// - unshifting duplicate keys (in different objects): left-most value precedence

// **TESTS**
import {
  assertEquals,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { NANOS } from "../src/nanos.esm.js";

Deno.test("NANOS.push scalar", () => {
    const n = new NANOS();
    n.push('a', 1);
    assertEquals(n.toJSON().pairs, [0, 'a', 1, 1]);
});

Deno.test("NANOS.push object", () => {
    const n = new NANOS();
    n.push({ a: 1, b: 2 });
    assertEquals(n.toJSON().pairs, ['a', 1, 'b', 2]);
});

Deno.test("NANOS.push Map", () => {
    const n = new NANOS();
    n.push(new Map([['a', 1], ['b', 2]]));
    assertEquals(n.toJSON().pairs, ['a', 1, 'b', 2]);
});

Deno.test("NANOS.push sparse Array", () => {
    const n = new NANOS();
    const a = [, 'a:1', , 'a:3', ,];
    n.push(a);
    assertEquals(n.toJSON().pairs, [1, 'a:1', 3, 'a:3']);
    assertEquals(n.next, 5);
});

Deno.test("NANOS.push Set", () => {
    const n = new NANOS();
    n.push(new Set(['a', 'b']));
    assertEquals(n.toJSON().pairs, [0, 'a', 1, 'b']);
});

Deno.test("NANOS.push NANOS", () => {
    const n1 = new NANOS('a', 'b', {foo: 'bar'});
    const n2 = new NANOS();
    n2.push(n1);
    assertEquals(n2.toJSON(), { type: '@NANOS@', next: 2, pairs: [ 0, 'a', 1, 'b', 'foo', 'bar' ] });
});

Deno.test("NANOS.push mixed types", () => {
    const n = new NANOS();
    const sparse = [, 's', ,];
    n.push('a', {b: 'c'}, new Map([['d', 'e']]), sparse);
    assertEquals(n.toJSON().pairs, [0, 'a', 'b', 'c', 'd', 'e', 2, 's']);
    assertEquals(n.next, 4);
});


Deno.test("NANOS.push preserves sparsity", () => {
    const a = [, 'a:1', , 'a:3', ,];
    const n = new NANOS();
    n.push(a, a);
    assertEquals(n.toJSON(), {type: '@NANOS@', pairs: [1, 'a:1', 3, 'a:3', 6, 'a:1', 8, 'a:3'], next: 10});
});

Deno.test("NANOS.push overwrites existing keys", () => {
    const n = new NANOS({ key1: 'value1', key2: 'value2', key3: 'value3' });
    n.push({ key2: 'VALUE2' });
    assertEquals(n.toJSON().pairs, ['key1', 'value1', 'key2', 'VALUE2', 'key3', 'value3']);
});

Deno.test("NANOS.push new keys are added at end", () => {
    const n = new NANOS({key1: 'a'});
    n.push({ key2: 'b' });
    assertEquals([...n.keys()], ['key1', 'key2']);
});

Deno.test("NANOS.push duplicate keys, right-most wins", () => {
    const n = new NANOS();
    n.push({ 'a': 1 }, { 'a': 2 });
    assertEquals(n.get('a'), 2);
});

Deno.test("NANOS.unshift scalar", () => {
    const n = new NANOS('c', 'd');
    n.unshift('a', 'b');
    assertEquals(n.toJSON().pairs, [0, 'a', 1, 'b', 2, 'c', 3, 'd']);
    assertEquals(n.next, 4);
});

Deno.test("NANOS.unshift object", () => {
    const n = new NANOS('b');
    n.unshift({ a: 1 });
    assertEquals(n.toJSON().pairs, ['a', 1, 0, 'b']);
});

Deno.test("NANOS.unshift duplicate keys, left-most wins", () => {
    const n = new NANOS();
    n.unshift({ 'a': 1 }, { 'a': 2 });
    assertEquals(n.get('a'), 1);
});

Deno.test("NANOS.unshift mixed types", () => {
    const n = new NANOS('c');
    const sparse = [, 's', ,];
    n.unshift('a', {b: 'b'}, new Map([['m', 'm']]), sparse, 'z');
    assertEquals(n.toJSON(), {type: "@NANOS@", next: 6, pairs: [0, 'a', 'b', 'b', 'm', 'm', 2, 's', 4, 'z', 5, 'c']});
});

Deno.test("NANOS.unshift preserves sparsity", () => {
    const a = [, 'a:1', , 'a:3', ,];
    const n = new NANOS('z');
    n.unshift(a, a);
    assertEquals(n.toJSON(), {type: '@NANOS@', pairs: [1, 'a:1', 3, 'a:3', 6, 'a:1', 8, 'a:3', 10, 'z'], next: 11});
});

Deno.test("NANOS.unshift combo", () => {
    const o = {3: 'o:3', ok: 'o:v', 1: 'o:1'};
    const m = new Map([[3, 'm:3'], ['mk', 'm:v'], [1, 'm:1']]);
    const a = [, 'a:1', , 'a:3', ,];
    const s = new Set(['s:0', 's:1']);
    const n1 = new NANOS();
    n1.fromPairs({'type': '@NANOS', 'pairs': [1, 'n:1', 'nk', 'n:v', 3, 'n:3'], 'next': 5});

    const n = new NANOS('end');
    n.unshift(o, m, a, s, n1);
    assertEquals(n.toJSON(), {type: "@NANOS@", next: 16, pairs: [ 1, "o:1", 3, "o:3", "ok", "o:v", 5, "m:1", 7, "m:3", "mk", "m:v", 9, "a:1", 11, "a:3", 13, "s:0", 14, "s:1", 15, "end"]});
});