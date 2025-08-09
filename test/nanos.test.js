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

Deno.test("NANOS deepFreeze", () => {
    const inner = new NANOS("c");
    const n = new NANOS("a", "b", [inner]);
    n.deepFreeze();
    assert(Object.isFrozen(n));
    assert(Object.isFrozen(inner));
    assertThrows(() => { n.set(0, "z"); }, TypeError);
    assertThrows(() => { inner.set(0, "z"); }, TypeError);
});


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

Deno.test("NANOS filter", () => {
    const n = new NANOS(1, "a", 2, "b", 3);
    n.set("foo", "bar");
    const isNumber = (v) => typeof v === 'number';
    const filtered = n.filter(isNumber);
    assertEquals(filtered.size, 3);
    assertEquals([...filtered.values()], [1, 2, 3]);
    assertEquals([...filtered.keys()], ["0", "2", "4"]);
});

Deno.test("NANOS find", () => {
    const n = new NANOS("a", "b", "c");
    const found = n.find((v) => v === "b");
    assertEquals(found, ["1", "b"]);
    const notFound = n.find((v) => v === "d");
    assertEquals(notFound, undefined);
});

Deno.test("NANOS findLast", () => {
    const n = new NANOS("a", "b", "a");
    const found = n.findLast((v) => v === "a");
    assertEquals(found, ["2", "a"]);
});

Deno.test("NANOS forEach", () => {
    const n = new NANOS("a", "b");
    n.set("foo", "bar");
    const result = [];
    n.forEach((value, key) => {
	result.push([key, value]);
    });
    assertEquals(result, [["0", "a"], ["1", "b"], ["foo", "bar"]]);
});

Deno.test("NANOS freeze", () => {
    const inner = new NANOS("b");
    const n = new NANOS("a", inner);
    n.freeze();
    assert(Object.isFrozen(n));
    assertThrows(() => { n.set(0, "z"); }, TypeError);
    assert(!Object.isFrozen(inner));
    inner.set(0, "c");
    assertEquals(inner.at(0), "c");
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
    const n = new NANOS("a", {foo: 'bar'});
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

Deno.test("NANOS indexEntries", () => {
    const n = new NANOS({foo: 'bar'}, "a", "b");
    const entries = [...n.indexEntries()];
    assertEquals(entries, [["0", "a"], ["1", "b"]]);
});

Deno.test("NANOS indexKeys", () => {
    const n = new NANOS({foo: 'bar'}, "a", "b");
    const keys = [...n.indexKeys()];
    assertEquals(keys, ["0", "1"]);
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

Deno.test("NANOS namedEntries", () => {
    const n = new NANOS("a", {foo: 'bar'}, "b", {baz: 'qux'});
    const entries = [...n.namedEntries()];
    assertEquals(entries, [["foo", "bar"], ["baz", "qux"]]);
});

Deno.test("NANOS namedKeys", () => {
    const n = new NANOS("a", {foo: 'bar'}, "b", {baz: 'qux'});
    const keys = [...n.namedKeys()];
    assertEquals(keys, ["foo", "baz"]);
});

Deno.test("NANOS keys", () => {
    const n = new NANOS("a", {foo: 'bar'}, "b");
    assertEquals([...n.keys()], ["0", "foo", "1"]);
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

Deno.test("NANOS options", () => {
    const n = new NANOS();
    assertEquals(n.options, {});
    n.setOptions({ transform: true });
    assertEquals(n.options, { transform: true });
});

Deno.test("NANOS pairs", () => {
    const n = new NANOS(["a", , "b"], {foo: 'bar'});
    assertEquals(n.pairs(), ["0", "a", "2", "b", "foo", "bar"]);
    assertEquals(n.pairs(true), [0, "a", 2, "b", "foo", "bar"]);
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

Deno.test("NANOS reverseEntries", () => {
    const n = new NANOS("a", {foo: 'bar'}, "b");
    const entries = [...n.reverseEntries()];
    assertEquals(entries, [["1", "b"], ["foo", "bar"], ["0", "a"]]);
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

Deno.test("NANOS similar", () => {
    const n = new NANOS();
    n.setOptions({ transform: true });
    const s = n.similar("a", "b");
    assertEquals(s.options.transform, true);
    assertEquals(s.size, 2);
    assertEquals(s.at(1), "b");
});

Deno.test("NANOS size", () => {
    const n = new NANOS("a", "b");
    assertEquals(n.size, 2);
    n.set("foo", "c");
    assertEquals(n.size, 3);
});

Deno.test("NANOS storage", () => {
    const n = new NANOS("a", {foo: "bar"});
    const storage = n.storage;
    assertEquals(storage["0"], "a");
    assertEquals(storage.foo, "bar");
});

Deno.test("NANOS toJSON", () => {
    const n = new NANOS(["a", , "b"], {foo: "bar"});
    assertEquals(n.toJSON(), {
	type: "@NANOS@",
	next: 3,
	pairs: [0, "a", 2, "b", "foo", "bar"],
    });
});

Deno.test("NANOS toReversed", () => {
    const n = new NANOS(["a", , "b"], {key: 'value'}, "c");
    const reversed = n.toReversed();
    assertEquals([...reversed.entries(true)], [[0, "c"], ['key', 'value'], [1, "b"], [3, "a"]]);
});

Deno.test("NANOS toString", () => {
    const n = new NANOS("a", "b");
    assertEquals(n.toString(), "[(a b)]");
});

Deno.test("NANOS values", () => {
    const n = new NANOS(["a", "b", , 'd'], {foo: 'bar'});
    assertEquals([...n.values()], ["a", "b", "d"]);
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