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
	n.fromPairs({ type: '@NANOS@', pairs: ["a", 1, undefined, "b"], next: 4 });
	assertEquals(n.at('a'), 1);
	assertEquals(n.at(0), "b");
	assertEquals(n.next, 4);
});

Deno.test("NANOS has", () => {
	const n = new NANOS("a", { foo: 'bar' });
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
	const n = new NANOS({ foo: 'bar' }, "a", "b");
	const entries = [...n.indexEntries()];
	assertEquals(entries, [["0", "a"], ["1", "b"]]);
});

Deno.test("NANOS indexKeys", () => {
	const n = new NANOS({ foo: 'bar' }, "a", "b");
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
	const n = new NANOS("a", { foo: 'bar' }, "b", { baz: 'qux' });
	const entries = [...n.namedEntries()];
	assertEquals(entries, [["foo", "bar"], ["baz", "qux"]]);
});

Deno.test("NANOS namedKeys", () => {
	const n = new NANOS("a", { foo: 'bar' }, "b", { baz: 'qux' });
	const keys = [...n.namedKeys()];
	assertEquals(keys, ["foo", "baz"]);
});

Deno.test("NANOS keys", () => {
	const n = new NANOS("a", { foo: 'bar' }, "b");
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
	const n = new NANOS(["a", , "b"], { foo: 'bar' });
	assertEquals(n.pairs(), ["0", "a", "2", "b", "foo", "bar"]);
	assertEquals(n.pairs(true), [0, "a", 2, "b", "foo", "bar"]);
});

Deno.test("NANOS pathSet", async (t) => {
	await t.step("single key with 'to' option", () => {
		const n = new NANOS();
		const result = n.pathSet("name", { to: "Alice" });
		assertEquals(n.at("name"), "Alice");
		assertEquals(result.base, n);
		assertEquals(result.leaf, n);
		assertEquals(result.key, "name");
		assertEquals(result.value, "Alice");
	});

	await t.step("nested path with auto-vivification", () => {
		const n = new NANOS();
		const result = n.pathSet(["user", "profile", "name"], { to: "Bob" });
		assertEquals(n.at(["user", "profile", "name"]), "Bob");
		assert(n.at("user") instanceof NANOS);
		assert(n.at(["user", "profile"]) instanceof NANOS);
		assertEquals(result.base, n);
		assert(result.leaf instanceof NANOS);
		assertEquals(result.key, "name");
		assertEquals(result.value, "Bob");
	});

	await t.step("deep nesting", () => {
		const n = new NANOS();
		const result = n.pathSet(["a", "b", "c", "d"], { to: "deep" });
		assertEquals(n.at(["a", "b", "c", "d"]), "deep");
		assertEquals(result.base, n);
		assertEquals(result.key, "d");
		assertEquals(result.value, "deep");
	});

	await t.step("numeric indices in path", () => {
		const n = new NANOS();
		const result = n.pathSet([0, "data", 1], { to: "value" });
		assertEquals(n.at([0, "data", 1]), "value");
		assert(n.at(0) instanceof NANOS);
		assertEquals(result.key, 1);
		assertEquals(result.value, "value");
	});

	await t.step("using 'next' option to push values", () => {
		const n = new NANOS();
		const result1 = n.pathSet(["items"], { next: "first" });
		const result2 = n.pathSet(["items"], { next: "second" });
		assertEquals(n.at(["items", 0]), "first");
		assertEquals(n.at(["items", 1]), "second");
		assertEquals(result1.base, n);
		assert(result1.leaf instanceof NANOS);
		assertEquals(result1.next, "first");
		assertEquals(result2.next, "second");
	});

	await t.step("using 'first' option to unshift values", () => {
		const n = new NANOS();
		const result1 = n.pathSet(["items"], { next: "second" });
		const result2 = n.pathSet(["items"], { first: "first" });
		assertEquals(n.at(["items", 0]), "first");
		assertEquals(n.at(["items", 1]), "second");
		assertEquals(result1.next, "second");
		assertEquals(result2.first, "first");
	});

	await t.step("using 'insert' option", () => {
		const n = new NANOS();
		const result = n.pathSet(["data", "key"], { to: "value", insert: true });
		assertEquals(n.at(["data", "key"]), "value");
		assertEquals(result.key, "key");
		assertEquals(result.value, "value");
	});

	await t.step("overwriting existing values", () => {
		const n = new NANOS();
		n.pathSet(["config", "setting"], { to: "old" });
		const result = n.pathSet(["config", "setting"], { to: "new" });
		assertEquals(n.at(["config", "setting"]), "new");
		assertEquals(result.value, "new");
	});

	await t.step("return structure with 'to' option", () => {
		const n = new NANOS();
		const result = n.pathSet(["a", "b"], { to: "value" });
		assertEquals(result.base, n);
		assert(result.leaf instanceof NANOS);
		assertEquals(result.key, "b");
		assertEquals(result.value, "value");
		assertEquals(result.leaf.at("b"), "value");
	});

	await t.step("empty path with 'next' operates on root", () => {
		const n = new NANOS();
		const result = n.pathSet([], { next: "item" });
		assertEquals(result.base, n);
		assertEquals(result.leaf, n);
		assertEquals(result.next, "item");
		assertEquals(n.at(0), "item");
	});

	await t.step("preserves existing structure", () => {
		const n = new NANOS();
		n.set("existing", "data");
		n.pathSet(["new", "path"], { to: "value" });
		assertEquals(n.at("existing"), "data");
		assertEquals(n.at(["new", "path"]), "value");
	});

	await t.step("mixed key types in path", () => {
		const n = new NANOS();
		const result = n.pathSet([0, "name", 1, "value"], { to: "mixed" });
		assertEquals(n.at([0, "name", 1, "value"]), "mixed");
		assertEquals(result.key, "value");
		assertEquals(result.value, "mixed");
	});

	await t.step("combined 'first' and 'next' options", () => {
		const n = new NANOS();
		const result = n.pathSet(["items"], { first: "a", next: "b" });
		assertEquals(result.base, n);
		assertEquals(result.first, "a");
		assertEquals(result.next, "b");
		assertEquals(n.at(["items", 0]), "a");
		assertEquals(n.at(["items", 1]), "b");
	});

	await t.step("using 'raw' option", () => {
		const n = new NANOS();
		const result = n.pathSet(["data", "key"], { to: "rawValue", raw: true });
		assertEquals(n.at(["data", "key"]), "rawValue");
		assertEquals(result.value, "rawValue");
	});
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
	const n = new NANOS("a", { foo: 'bar' }, "b");
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
	const n = new NANOS("a", { foo: "bar" });
	const storage = n.storage;
	assertEquals(storage["0"], "a");
	assertEquals(storage.foo, "bar");
});

Deno.test("NANOS toObject", async (t) => {
	await t.step("basic object conversion", () => {
		const n = new NANOS("a", "b", "c", { foo: "bar" });
		const obj = n.toObject();
		assertEquals(obj[0], "a");
		assertEquals(obj[1], "b");
		assertEquals(obj[2], "c");
		assertEquals(obj.foo, "bar");
		assertEquals(Object.getPrototypeOf(obj), null);
	});

	await t.step("object mode with only indexed values", () => {
		const n = new NANOS("a", "b", "c");
		const obj = n.toObject();
		assertEquals(Object.getPrototypeOf(obj), null);
		assertEquals(obj, { 0: "a", 1: "b", 2: "c" });
	});

	await t.step("array mode with only indexed values", () => {
		const n = new NANOS("a", "b", "c");
		const arr = n.toObject({ array: true });
		assert(Array.isArray(arr));
		assertEquals(arr, ["a", "b", "c"]);
	});

	await t.step("array mode converts to object when named keys present", () => {
		const n = new NANOS("a", "b", { foo: "bar" });
		const obj = n.toObject({ array: true });
		assertEquals(Array.isArray(obj), false);
		assertEquals(obj[0], "a");
		assertEquals(obj[1], "b");
		assertEquals(obj.foo, "bar");
	});

	await t.step("nested NANOS conversion", () => {
		const inner = new NANOS("x", "y");
		const n = new NANOS([inner], { key: "value" });
		const obj = n.toObject();
		assertEquals(obj[0][0], "x");
		assertEquals(obj[0][1], "y");
		assertEquals(obj.key, "value");
	});

	await t.step("deeply nested NANOS", () => {
		const n = new NANOS().setOpts({ transform: true }).push([[["bottom"]]]);
		const obj = n.toObject();
		assertEquals(obj[0][0][0], "bottom");
	});

	await t.step("sparse arrays", () => {
		const n = new NANOS(["a", , "c"]);
		const obj = n.toObject({ array: true });
		assert(Array.isArray(obj));
		assertEquals(obj[0], "a");
		assertEquals(Object.hasOwn(obj, 1), false);
		assertEquals(obj[2], "c");
	});

	await t.step("mixed nested structures", () => {
		const items = new NANOS("item1", "item2");
		const n = new NANOS([items], { name: "test" });
		const obj = n.toObject();
		assertEquals(obj[0][0], "item1");
		assertEquals(obj[0][1], "item2");
		assertEquals(obj.name, "test");
	});

	await t.step("array mode with nested NANOS", () => {
		const inner = new NANOS("x", "y");
		const n = new NANOS([inner], "b");
		const arr = n.toObject({ array: true });
		assert(Array.isArray(arr));
		assert(Array.isArray(arr[0]));
		assertEquals(arr[0], ["x", "y"]);
		assertEquals(arr[1], "b");
	});

	await t.step("empty NANOS", () => {
		const n = new NANOS();
		const obj = n.toObject();
		assertEquals(Object.keys(obj).length, 0);
		assertEquals(Object.getPrototypeOf(obj), null);
	});

	await t.step("empty NANOS with array mode", () => {
		const n = new NANOS();
		const arr = n.toObject({ array: true });
		assert(Array.isArray(arr));
		assertEquals(arr.length, 0);
	});

	await t.step("array1 mode with only indexed values", () => {
		const n = new NANOS("a", "b", "c");
		const arr = n.toObject({ array1: true });
		assert(Array.isArray(arr));
		assertEquals(arr, ["a", "b", "c"]);
	});

	await t.step("array1 mode converts to object when named keys present", () => {
		const n = new NANOS("a", "b", { foo: "bar" });
		const obj = n.toObject({ array1: true });
		assertEquals(Array.isArray(obj), false);
		assertEquals(obj[0], "a");
		assertEquals(obj[1], "b");
		assertEquals(obj.foo, "bar");
	});

	await t.step("empty NANOS with array1 mode returns object", () => {
		const n = new NANOS();
		const obj = n.toObject({ array1: true });
		assertEquals(Array.isArray(obj), false);
		assertEquals(Object.keys(obj).length, 0);
		assertEquals(Object.getPrototypeOf(obj), null);
	});

	await t.step("array1 mode with nested NANOS", () => {
		const inner = new NANOS("x", "y");
		const n = new NANOS([inner], "b");
		const arr = n.toObject({ array1: true });
		assert(Array.isArray(arr));
		assert(Array.isArray(arr[0]));
		assertEquals(arr[0], ["x", "y"]);
		assertEquals(arr[1], "b");
	});

	await t.step("array1 mode with empty nested NANOS", () => {
		const empty = new NANOS();
		const n = new NANOS([empty], "b");
		const arr = n.toObject({ array1: true });
		assert(Array.isArray(arr));
		assertEquals(Array.isArray(arr[0]), false);
		assertEquals(Object.keys(arr[0]).length, 0);
		assertEquals(arr[1], "b");
	});

	await t.step("empty level types in standard mode", () => {
		const empty = new NANOS();
		const n = new NANOS([empty]);
		const obj = n.toObject();
		assertEquals(Array.isArray(obj[0]), false);
		assertEquals(Object.getPrototypeOf(obj[0]), null);
		assertEquals(Object.keys(obj[0]).length, 0);
	});

	await t.step("empty level types in array mode", () => {
		const empty = new NANOS();
		const n = new NANOS([empty]);
		const obj = n.toObject({ array: true });
		assert(Array.isArray(obj));
		assert(Array.isArray(obj[0]));
		assertEquals(obj[0].length, 0);
	});

	await t.step("empty level types in array1 mode", () => {
		const empty = new NANOS();
		const n = new NANOS([empty]);
		const obj = n.toObject({ array1: true });
		assert(Array.isArray(obj));
		assertEquals(Array.isArray(obj[0]), false);
		assertEquals(Object.getPrototypeOf(obj[0]), null);
		assertEquals(Object.keys(obj[0]).length, 0);
	});

	await t.step("sparse arrays with array1 mode", () => {
		const n = new NANOS(["a", , "c"]);
		const arr = n.toObject({ array1: true });
		assert(Array.isArray(arr));
		assertEquals(arr[0], "a");
		assertEquals(Object.hasOwn(arr, 1), false);
		assertEquals(arr[2], "c");
	});

	await t.step("deeply nested with array1 mode", () => {
		const n = new NANOS().setOpts({ transform: true }).push([[["bottom"]]]);
		const obj = n.toObject({ array1: true });
		assert(Array.isArray(obj));
		assert(Array.isArray(obj[0]));
		assert(Array.isArray(obj[0][0]));
		assertEquals(obj[0][0][0], "bottom");
	});

	await t.step("deeply nested empty structures with array1 mode", () => {
		const n = new NANOS().setOpts({ transform: true }).push([[[]]]);
		const obj = n.toObject({ array1: true });
		assert(Array.isArray(obj));
		assertEquals(Array.isArray(obj[0]), true);
		assertEquals(Object.keys(obj[0]).length, 1);
		assertEquals(Object.getPrototypeOf(obj[0][0]), null);
	});

	await t.step("raw option preserves reactive values", () => {
		const mockReactive = (val) => ({ __reactive: true, value: val });
		const mockRIO = {
			batch: (cb) => cb(),
			changed: () => { },
			create: () => mockRIO,
			depend: () => { },
			get: (r) => r.value,
			isReactive: (v) => v?.__reactive === true,
			onSet: (nanos, key, value) => mockReactive(value)
		};
		const n = new NANOS().setRIO(mockRIO);
		n.set(0, "a");
		n.set(1, "b");
		const objRaw = n.toObject({ raw: true });
		assertEquals(objRaw[0].__reactive, true);
		assertEquals(objRaw[0].value, "a");
		const objFinal = n.toObject();
		assertEquals(objFinal[0], "a");
		assertEquals(objFinal[1], "b");
	});
});

Deno.test("NANOS toJSON", () => {
	const n = new NANOS(["a", , "b"], { foo: "bar" });
	assertEquals(n.toJSON(), {
		type: "@NANOS@",
		next: 3,
		pairs: [0, "a", 2, "b", "foo", "bar"],
	});
});

Deno.test("NANOS toReversed", () => {
	const n = new NANOS(["a", , "b"], { key: 'value' }, "c");
	const reversed = n.toReversed();
	assertEquals([...reversed.entries(true)], [[0, "c"], ['key', 'value'], [1, "b"], [3, "a"]]);
});

Deno.test("NANOS toString", () => {
	const n = new NANOS("a", "b");
	assertEquals(n.toString(), "[(a b)]");
});

Deno.test("NANOS values", () => {
	const n = new NANOS(["a", "b", , 'd'], { foo: 'bar' });
	assertEquals([...n.values()], ["a", "b", "d"]);
});

Deno.test("SLID and QJSON", async (t) => {
	await t.step("parseSLID basic", () => {
		const n = parseSLID("[(a b c)]");
		assertEquals(n.size, 3);
		assertEquals(n.at(0), 'a');
		assertEquals(n.at(1), 'b');
		assertEquals(n.at(2), 'c');
	});

	await t.step("parseSLID with syntax error", () => {
		assertThrows(() => parseSLID("[ ( a b c ) ]"), SyntaxError, "Missing SLID boundary marker(s)");
	});

	await t.step("toSLID basic", () => {
		const n = new NANOS("a", "b", "c");
		assertEquals(n.toSLID(), "[(a b c)]");
	});

	await t.step("parse and toSLID complex", () => {
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

	await t.step("parseQJSON", () => {
		const n = parseQJSON("{ a: 1, b: [2, 3], c: {d: 4} }");
		assertEquals(n.at('a'), 1);
		assert(n.at('b') instanceof NANOS);
		assertEquals(n.at('b').at(1), 3);
		assert(n.at('c').at('d'), 4);
	});

	await t.step("toSLID function", () => {
		const slid = toSLID(["a", "b"]);
		assertEquals(slid, "[(a b)]");
	});

	await t.step("parseSLID sparse next - single @e", () => {
		const n = parseSLID("[(a @e c)]");
		assertEquals(n.size, 2);
		assertEquals(n.at(0), 'a');
		assertEquals(n.has(1), false);
		assertEquals(n.at(2), 'c');
		assertEquals(n.next, 3);
	});

	await t.step("parseSLID sparse next - multiple consecutive @e", () => {
		const n = parseSLID("[(a @e @e d)]");
		assertEquals(n.size, 2);
		assertEquals(n.at(0), 'a');
		assertEquals(n.has(1), false);
		assertEquals(n.has(2), false);
		assertEquals(n.at(3), 'd');
		assertEquals(n.next, 4);
	});

	await t.step("parseSLID sparse next - explicit index with @e", () => {
		const n = parseSLID("[(a 5=@e)]");
		assertEquals(n.size, 1);
		assertEquals(n.at(0), 'a');
		assertEquals(n.has(5), false);
		assertEquals(n.next, 6);
	});

	await t.step("parseSLID sparse next - mixed sparse and dense", () => {
		const n = parseSLID("[(a @e c 5=@e g)]");
		assertEquals(n.size, 3);
		assertEquals(n.at(0), 'a');
		assertEquals(n.has(1), false);
		assertEquals(n.at(2), 'c');
		assertEquals(n.has(5), false);
		assertEquals(n.at(6), 'g');
		assertEquals(n.next, 7);
	});

	await t.step("parseSLID sparse next - @e at beginning", () => {
		const n = parseSLID("[(@e @e a)]");
		assertEquals(n.size, 1);
		assertEquals(n.has(0), false);
		assertEquals(n.has(1), false);
		assertEquals(n.at(2), 'a');
		assertEquals(n.next, 3);
	});

	await t.step("parseSLID sparse next - only @e values", () => {
		const n = parseSLID("[(@e @e @e)]");
		assertEquals(n.size, 0);
		assertEquals(n.has(0), false);
		assertEquals(n.has(1), false);
		assertEquals(n.has(2), false);
		assertEquals(n.next, 3);
	});

	await t.step("toSLID sparse next - single hole in middle", () => {
		const n = new NANOS(["a", , "c"]);
		// toSLID should use explicit index for holes in the middle, not @e
		assertEquals(n.toSLID(), "[(a 2=c)]");
	});

	await t.step("toSLID sparse next - two consecutive holes in middle", () => {
		const n = new NANOS(["a", , , "d"]);
		// toSLID should use explicit index for holes in the middle
		assertEquals(n.toSLID(), "[(a 3=d)]");
	});

	await t.step("toSLID sparse next - explicit next with gap at end", () => {
		const n = new NANOS("a");
		n.next = 6;
		// Gap at the end uses @e notation
		assertEquals(n.toSLID(), "[(a 5=@e)]");
	});

	await t.step("toSLID sparse next - mixed sparse and dense", () => {
		const n = new NANOS(["a", , "c"]);
		n.set(6, "g");
		// Hole in middle uses explicit index, no trailing gap so no @e
		assertEquals(n.toSLID(), "[(a 2=c 6=g)]");
	});

	await t.step("toSLID sparse next - holes at beginning", () => {
		const n = new NANOS();
		n.set(2, "a");
		// Holes at beginning use explicit index
		assertEquals(n.toSLID(), "[(2=a)]");
	});

	await t.step("toSLID sparse next - only holes (empty with next)", () => {
		const n = new NANOS();
		n.next = 3;
		// Only holes at end use @e notation
		assertEquals(n.toSLID(), "[(2=@e)]");
	});

	await t.step("toSLID sparse next - trailing holes use @e", () => {
		const n = new NANOS("a", "b");
		n.next = 5;
		// Trailing holes (gap at end) use @e notation
		assertEquals(n.toSLID(), "[(a b 4=@e)]");
	});

	await t.step("toSLID sparse next - single trailing @e", () => {
		const n = new NANOS("a", "b");
		n.next = 3;
		// Single trailing hole
		assertEquals(n.toSLID(), "[(a b @e)]");
	});

	await t.step("toSLID sparse next - two trailing @e", () => {
		const n = new NANOS("a", "b");
		n.next = 4;
		// Two trailing holes
		assertEquals(n.toSLID(), "[(a b @e @e)]");
	});

	await t.step("parseSLID and toSLID sparse next - round trip with trailing", () => {
		const original = "[(a b 4=@e)]";
		const n = parseSLID(original);
		const roundTrip = n.toSLID();
		assertEquals(roundTrip, original);

		const n2 = parseSLID(roundTrip);
		assertEquals(n.toJSON(), n2.toJSON());
	});

	await t.step("parseSLID sparse next - with named keys", () => {
		const n = parseSLID("[(a @e foo=bar c)]");
		assertEquals(n.size, 3);
		assertEquals(n.at(0), 'a');
		assertEquals(n.has(1), false);
		assertEquals(n.at('foo'), 'bar');
		assertEquals(n.at(2), 'c');
		assertEquals(n.next, 3);
	});

	await t.step("toSLID sparse next - with named keys and middle hole", () => {
		const n = new NANOS();
		n.set(0, "a");
		n.set("foo", "bar");
		n.set(2, "c");
		const slid = n.toSLID();
		const n2 = parseSLID(slid);
		assertEquals(n.toJSON(), n2.toJSON());
	});
});
