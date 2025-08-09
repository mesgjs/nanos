import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { NANOS, isIndex, isNegIndex, parseQJSON, parseSLID, toSLID } from "../src/nanos.esm.js";

Deno.test("isIndex", () => {
    assertEquals(isIndex("0"), true);
    assertEquals(isIndex("1"), true);
    assertEquals(isIndex("123"), true);
    assertEquals(isIndex("01"), false);
    assertEquals(isIndex("-1"), false);
    assertEquals(isIndex("1.0"), false);
    assertEquals(isIndex("abc"), false);
});

Deno.test("isNegIndex", () => {
    assertEquals(isNegIndex("-1"), true);
    assertEquals(isNegIndex("-123"), true);
    assertEquals(isNegIndex("0"), false);
    assertEquals(isNegIndex("1"), false);
    assertEquals(isNegIndex("-0"), false);
    assertEquals(isNegIndex("-1.0"), false);
});

Deno.test("NANOS constructor", () => {
    const n = new NANOS(1, 2, "three");
    assertEquals(n.size, 3);
    assertEquals(n.at(0), 1);
    assertEquals(n.at(1), 2);
    assertEquals(n.at(2), "three");
});

Deno.test("NANOS at/get", () => {
    const n = new NANOS("a", "b", "c");
    n.set("foo", "bar");
    assertEquals(n.at(0), "a");
    assertEquals(n.at(1), "b");
    assertEquals(n.at(2), "c");
    assertEquals(n.at(-1), "c");
    assertEquals(n.at(-2), "b");
    assertEquals(n.at(-3), "a");
    assertEquals(n.at("foo"), "bar");
    assertEquals(n.at("nonexistent", "baz"), "baz");
    assertEquals(n.get(0), "a");
});

Deno.test("NANOS at with path", () => {
    const n = new NANOS();
    const inner = new NANOS("foo");
    n.set("a", inner);
    assertEquals(n.at(["a", 0]), "foo");
    assertEquals(n.at(["a", 1], "def"), "def");
    assertEquals(n.at(["b", 0], "def"), "def");
});

Deno.test("NANOS clear", () => {
    const n = new NANOS(1, 2, 3);
    n.set("a", "b");
    n.clear();
    assertEquals(n.size, 0);
    assertEquals(n.next, 0);
    assertEquals(n.at(0), undefined);
    assertEquals(n.at("a"), undefined);
});

Deno.test("NANOS delete", () => {
    const n = new NANOS("a", "b", "c");
    n.set("foo", "bar");
    assertEquals(n.delete(1), "b");
    assertEquals(n.size, 3);
    assertEquals(n.at(1), undefined);
    assertEquals(n.has(1), false);
    assertEquals(n.delete("foo"), "bar");
    assertEquals(n.has("foo"), false);
});

// Missing: deepFreeze
// Missing: filter
// Missing: find
// Missing: findLast
// Missing: forEach
// Missing: freeze
// Missing: indexEntries
// Missing: indexKeys
// Missing: namedEntries
// Missing: namedKeys
// Missing: options
// Missing: reverseEntries
// Missing: similar
// Missing: storage
// Missing: toJSON
// Missing: toReversed
// Missing: toString

Deno.test("NANOS entries", () => {
    const n = new NANOS("a", "b");
    n.set("foo", "bar");
    const entries = [...n.entries()];
    assertEquals(entries, [["0", "a"], ["1", "b"], ["foo", "bar"]]);
});

Deno.test("NANOS entries compact", () => {
    const n = new NANOS("a", "b");
    n.set("foo", "bar");
    const entries = [...n.entries(true)];
    assertEquals(entries, [[0, "a"], [1, "b"], ["foo", "bar"]]);
});


Deno.test("NANOS fromEntries", () => {
    const n = new NANOS();
    n.fromEntries([["0", "a"], ["foo", "bar"], ["2", "c"]]);
    n.fromEntries([["1", "b"]]);
    assertEquals(n.size, 4);
    assertEquals(n.at(0), "a");
    assertEquals(n.at(1), "b");
    assertEquals(n.at(2), "c");
    assertEquals(n.at("foo"), "bar");
    assertEquals([...n.keys()], ["0", "foo", "1", "2"]);
});

Deno.test("NANOS fromEntries with insert", () => {
    const n = new NANOS();
    n.fromEntries([["0", "a"], ["foo", "bar"], ["2", "c"]]);
    n.fromEntries([["1", "b"]], true);
    assertEquals(n.size, 4);
    assertEquals(n.at(0), "a");
    assertEquals(n.at(1), "b");
    assertEquals(n.at(2), "c");
    assertEquals(n.at("foo"), "bar");
    assertEquals([...n.keys()], ["0", "1", "foo", "2"]);
});


Deno.test("NANOS fromPairs", () => {
    const n = new NANOS();
    n.fromPairs("a", 1, "b", 2);
    assertEquals(n.size, 2);
    assertEquals(n.at("a"), 1);
    assertEquals(n.at("b"), 2);
});

Deno.test("NANOS fromPairs special", () => {
    const n = new NANOS();
    n.fromPairs(["a", 1, "b", 2, undefined, "c", undefined, undefined, undefined, "d"]);
    assertEquals(n.at('a'), 1);
    assertEquals(n.at('b'), 2);
    assertEquals(n.at(0), "c");
    assertEquals(n.at(1), undefined);
    assertEquals(n.at(2), "d");
    assertEquals(n.next, 3);
});

Deno.test("NANOS fromPairs sparse", () => {
    const n = new NANOS();
    n.fromPairs(["a", 1, "b", 2, , "c", , , , "d"]);
    assertEquals(n.at('a'), 1);
    assertEquals(n.at('b'), 2);
    assertEquals(n.at(0), "c");
    assertEquals(n.at(1), undefined);
    assertEquals(n.at(2), "d");
    assertEquals(n.next, 3);
});

Deno.test("NANOS fromPairs json", () => {
    const n = new NANOS();
    n.fromPairs({type: '@NANOS@', pairs: ["a", 1, undefined, "b"], next: 4});
    assertEquals(n.at('a'), 1);
    assertEquals(n.at(0), "b");
    assertEquals(n.next, 4);
});

Deno.test("NANOS has", () => {
    const n = new NANOS("a");
    n.set("foo", "bar");
    assertEquals(n.has(0), true);
    assertEquals(n.has("0"), true);
    assertEquals(n.has(1), false);
    assertEquals(n.has("foo"), true);
    assertEquals(n.has("bar"), false);
});

Deno.test("NANOS includes", () => {
    const n = new NANOS("a", "b", "a");
    assertEquals(n.includes("a"), true);
    assertEquals(n.includes("b"), true);
    assertEquals(n.includes("c"), false);
});

Deno.test("NANOS keyOf", () => {
    const n = new NANOS("a", "b", "a");
    assertEquals(n.keyOf("a"), "0");
    assertEquals(n.keyOf("b"), "1");
    assertEquals(n.keyOf("c"), undefined);
});

Deno.test("NANOS lastKeyOf", () => {
    const n = new NANOS("a", "b", "a");
    assertEquals(n.lastKeyOf("a"), "2");
    assertEquals(n.lastKeyOf("b"), "1");
    assertEquals(n.lastKeyOf("c"), undefined);
});

Deno.test("NANOS keys", () => {
    const n = new NANOS("a", "b");
    n.set("foo", "bar");
    assertEquals([...n.keys()], ["0", "1", "foo"]);
});


Deno.test("NANOS next", () => {
    const n = new NANOS("a", "b");
    assertEquals(n.next, 2);
    n.set(5, "f");
    assertEquals(n.next, 6);
    n.next = 1;
    assertEquals(n.next, 1);
    assertEquals(n.size, 1);
    assertEquals(n.at(0), "a");
    assertEquals(n.at(1), undefined);
});

Deno.test("NANOS pairs", () => {
    const n = new NANOS("a");
    n.set("foo", "bar");
    assertEquals(n.pairs(), ["0", "a", "foo", "bar"]);
    assertEquals(n.pairs(true), [0, "a", "foo", "bar"]);
});

Deno.test("NANOS pop", () => {
    const n = new NANOS("a", "b");
    assertEquals(n.pop(), "b");
    assertEquals(n.size, 1);
    assertEquals(n.next, 1);
    assertEquals(n.pop(), "a");
    assertEquals(n.size, 0);
    assertEquals(n.next, 0);
    assertEquals(n.pop(), undefined);
});

Deno.test("NANOS push", () => {
    const n = new NANOS("a");
    n.push("b", "c");
    assertEquals(n.size, 3);
    assertEquals(n.at(0), "a");
    assertEquals(n.at(1), "b");
    assertEquals(n.at(2), "c");
    assertEquals(n.next, 3);
});

Deno.test("NANOS push with object", () => {
    const n = new NANOS();
    n.push({ foo: "bar", "0": "a" });
    assertEquals(n.size, 2);
    assertEquals(n.at('foo'), 'bar');
    assertEquals(n.at(0), 'a');
});

Deno.test("NANOS reverse", () => {
    const n = new NANOS("a", "b", "c");
    n.set("foo", "bar");
    n.reverse();
    assertEquals([...n.keys()], ["foo", "0", "1", "2"]);
    assertEquals(n.at(0), "c");
    assertEquals(n.at(1), "b");
    assertEquals(n.at(2), "a");
    assertEquals(n.at("foo"), "bar");
});


Deno.test("NANOS set", () => {
    const n = new NANOS();
    n.set(0, "a");
    n.set("foo", "bar");
    n.set(undefined, "b"); // uses next
    assertEquals(n.size, 3);
    assertEquals(n.at(0), "a");
    assertEquals(n.at(1), "b");
    assertEquals(n.at("foo"), "bar");
    assertEquals(n.next, 2);
});


Deno.test("NANOS shift", () => {
    const n = new NANOS("a", "b", "c");
    assertEquals(n.shift(), "a");
    assertEquals(n.size, 2);
    assertEquals(n.next, 2);
    assertEquals(n.at(0), "b");
    assertEquals(n.at(1), "c");
    assertEquals(n.shift(), "b");
    assertEquals(n.shift(), "c");
    assertEquals(n.shift(), undefined);
});


Deno.test("NANOS size", () => {
    const n = new NANOS("a", "b");
    assertEquals(n.size, 2);
    n.set("foo", "c");
    assertEquals(n.size, 3);
});


Deno.test("NANOS unshift", () => {
    const n = new NANOS("c", "d");
    n.unshift("a", "b");
    assertEquals(n.size, 4);
    assertEquals(n.at(0), "a");
    assertEquals(n.at(1), "b");
    assertEquals(n.at(2), "c");
    assertEquals(n.at(3), "d");
    assertEquals(n.next, 4);
});


Deno.test("NANOS values", () => {
    const n = new NANOS("a", "b");
    n.set(3, "d");
    n.set("foo", "bar");
    assertEquals([...n.values()], ["a", "b", undefined, "d"]);
});

Deno.test("parseSLID basic", () => {
    const n = parseSLID("[(a b c)]");
    assertEquals(n.size, 3);
    assertEquals(n.at(0), 'a');
    assertEquals(n.at(1), 'b');
    assertEquals(n.at(2), 'c');
});

Deno.test("parseSLID with syntax error", () => {
    assertThrows(() => parseSLID("[ ( a b c ) ]"), SyntaxError, "Missing SLID boundary marker(s)");
});

Deno.test("toSLID basic", () => {
    const n = new NANOS("a", "b", "c");
    assertEquals(n.toSLID(), "[(a b c)]");
});

Deno.test("parse and toSLID complex", () => {
    const slid = "[(foo='bar' 1='qux' [ a b c ] 3=@n)]";
    const n = parseSLID(slid);
    assertEquals(n.at('foo'), 'bar');
    assertEquals(n.at(0), undefined);
    assertEquals(n.at(1), 'qux');
    assert(n.at(2) instanceof NANOS);
    assertEquals(n.at(2).toJSON().pairs, [0, 'a', 1, 'b', 2, 'c']);
    assertEquals(n.at(3), null);

    // This won't be identical due to key ordering, but will be equivalent
    const outSlid = n.toSLID();
    const n2 = parseSLID(outSlid);
    assertEquals(n.toJSON(), n2.toJSON());
});

Deno.test("parseQJSON", () => {
    const n = parseQJSON("{ a: 1, b: [2, 3], c: {d: 4} }");
    assertEquals(n.at('a'), 1);
    assert(n.at('b') instanceof NANOS);
    assertEquals(n.at('b').at(1), 3);
    assert(n.at('c').at('d'), 4);
});

Deno.test("toSLID function", () => {
    const slid = toSLID(["a", "b"]);
    assertEquals(slid, "[(a b)]");
});