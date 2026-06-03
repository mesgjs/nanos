/**
 * NANOS Value Reactivity Tests
 *
 * This file tests reactivity driven by *value-level* changes inside NANOS instances:
 * reactive values stored at keys, toSLID output reflecting final (resolved) values,
 * and the extended RIO (get/isReactive/onSet) that enables per-value reactivity.
 *
 * ⚠️  WARNING: Tests for *structural* reactivity (key additions/deletions, size,
 * locking, etc.) do NOT belong here.
 * Those tests live in nanos-reactive.test.js.
 */

import { reactive } from '@reactive';
import { NANOS, toSLID } from '../src/nanos.esm.js';
import {
    assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Create a NANOS-compatible reactive-interface object ("RIO") for a new or existing reactive object
const isReactive = (v) => !!reactive.typeOf(v);
const onSet = (n, k, v) => {
    const curVal = n.atRaw(k), curIsR = isReactive(curVal), newIsR = isReactive(v);
    if (curIsR) {
	// Current value is reactive.
	if (newIsR) curVal.def = v; // Tracking-chain of reactive values
	else curVal.wv = v; // Plain reactive value
	return curVal; // The reactive itself does not get replaced
    }
    if (n.options.autoReactive) {
	// Automatically make new values reactive based on NANOS option
	const r = reactive();
	if (newIsR) r.def = v;
	else r.wv = v;
	return r;
    }
    // Keep original value
    return v;
};

// Basic RIO (only manages "packaging" events)
const rio = (r) => {
    if (!r) r = reactive();
    return {
	batch: reactive.batch,
	changed: () => r.ripple(),
	create: rio,
	depend: () => r.rv
    };
};

// Extended RIO (supports automatic reactive-value conversion)
const extRio = (r) => {
    if (!r) r = reactive();
    return {
	batch: reactive.batch,
	changed: () => r.ripple(),
	create: extRio,
	depend: () => r.rv,

	get: (v) => v.rv,
	isReactive,
	onSet
    };
};

Deno.test('Basic RIO (Packaging Reactivity Only)', async () => {
    const n = new NANOS().setRIO(rio());
    n.set('k', 1);
    let val, packaging;

    reactive({ def: () => val = n.at('k'), eager: true });
    reactive({ def: () => packaging = n.size, eager: true });

    await reactive.wait();
    assertEquals(val, 1);
    assertEquals(packaging, 1);

    // Value changes should not trigger reaction with basic RIO
    n.set('k', 2);
    await reactive.wait();
    assertEquals(val, 1); // No change
    assertEquals(packaging, 1); // No change

    // Packaging changes (like delete) should
    n.delete('k');
    await reactive.wait();
    assertEquals(val, undefined);
    assertEquals(packaging, 0);
});

Deno.test('Extended RIO (Value Reactivity)', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set('k', 1);
    let val;

    reactive({ def: () => val = n.at('k'), eager: true });

    await reactive.wait();
    assertEquals(val, 1);

    // Value changes should trigger reaction with extended RIO
    n.set('k', 2);
    await reactive.wait();
    assertEquals(val, 2);
});

Deno.test('Raw vs. Final Values', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set('k', 1);

    const rval = n.atRaw('k');
    assertEquals(isReactive(rval), true, 'atRaw should return a reactive value');

    const finalVal = n.at('k');
    assertEquals(isReactive(finalVal), false, 'at() should return a final value');
    assertEquals(finalVal, 1);

    rval.wv = 2;
    await reactive.wait();
    assertEquals(n.at('k'), 2, 'Changes to raw value should be reflected in final value');
});

Deno.test('Chained Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    const source = reactive({ v: 1 });
    let finalVal;

    // Set a key to a pre-existing reactive value.
    n.set('k', source);
    reactive({ def: () => finalVal = n.at('k'), eager: true });

    await reactive.wait();
    assertEquals(finalVal, 1, 'Value should be initial value of source');

    // It should track changes to the source reactive.
    source.wv = 2;
    await reactive.wait();
    assertEquals(finalVal, 2, 'Value should track changes in the source reactive');

    // Replacing it with a static value should update and break the chain.
    n.set('k', 10);
    await reactive.wait();
    assertEquals(finalVal, 10, 'Value should update to the new static value');

    // Further changes to the original source should have no effect.
    source.wv = 3;
    await reactive.wait();
    assertEquals(finalVal, 10, 'Value should no longer track the original source');
});

Deno.test('Raw Option on Methods', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.fromEntries([['a', 1], ['b', 2]]);

    for (const [_k, v] of n.entries({ raw: true })) {
	assertEquals(isReactive(v), true, 'entries({raw: true}) should yield reactive values');
    }
    for (const v of n.values({ raw: true })) {
	assertEquals(isReactive(v), true, 'values({raw: true}) should yield reactive values');
    }
    const [_fk, fv] = n.find((_v, _k) => _k === 'a', { raw: true });
    assertEquals(isReactive(fv), true, 'find({raw: true}) should find reactive values');

    const deleted = n.delete('a', { raw: true });
    assertEquals(isReactive(deleted), true, 'delete({raw: true}) should return a reactive value');
});

Deno.test('Read-only Final Values', async () => {
    // With ext-RIO, at() returns final values, not reactives
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set('k', 1);
    let val;

    reactive({ def: () => val = n.at('k'), eager: true });

    await reactive.wait();
    assertEquals(val, 1);
    assertEquals(isReactive(n.at('k')), false, 'at() should not return a reactive value');
    assertEquals(isReactive(n.atRaw('k')), true, 'atRaw() should return a reactive value');

    n.set('k', 2);
    await reactive.wait();
    assertEquals(val, 2);
});

Deno.test('entries() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let entries;

    reactive({
        def: () => {
            entries = [...n.entries()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(entries, [['0', 1], ['1', 2]]);

    // Value change should trigger
    n.set(0, 10);
    await reactive.wait();
    assertEquals(entries, [['0', 10], ['1', 2]]);

    // Key addition should trigger
    n.set(2, 3);
    await reactive.wait();
    assertEquals(entries, [['0', 10], ['1', 2], ['2', 3]]);

    // Key deletion should trigger
    n.delete(1);
    await reactive.wait();
    assertEquals(entries, [['0', 10], ['2', 3]]);
});

Deno.test('namedEntries() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 'a');
    n.set('name1', 1);
    n.set('name2', 2);
    let namedEntries;

    reactive({
        def: () => {
            namedEntries = [...n.namedEntries()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(namedEntries, [['name1', 1], ['name2', 2]]);

    // Value change should trigger
    n.set('name1', 10);
    await reactive.wait();
    assertEquals(namedEntries, [['name1', 10], ['name2', 2]]);

    // Named key addition should trigger
    n.set('name3', 3);
    await reactive.wait();
    assertEquals(namedEntries, [['name1', 10], ['name2', 2], ['name3', 3]]);

    // Named key deletion should trigger
    n.delete('name1');
    await reactive.wait();
    assertEquals(namedEntries, [['name2', 2], ['name3', 3]]);
});

Deno.test('indexEntries() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    n.set('name', 'c');
    let indexEntries;

    reactive({
        def: () => {
            indexEntries = [...n.indexEntries()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(indexEntries, [['0', 1], ['1', 2]]);

    // Value change at index should trigger
    n.set(0, 10);
    await reactive.wait();
    assertEquals(indexEntries, [['0', 10], ['1', 2]]);

    // Index addition should trigger
    n.set(2, 3);
    await reactive.wait();
    assertEquals(indexEntries, [['0', 10], ['1', 2], ['2', 3]]);

    // Index deletion should trigger
    n.delete(1);
    await reactive.wait();
    assertEquals(indexEntries, [['0', 10], ['2', 3]]);
});

Deno.test('values() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let values;

    reactive({
        def: () => {
            values = [...n.values()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(values, [1, 2]);

    // Value change should trigger
    n.set(0, 10);
    await reactive.wait();
    assertEquals(values, [10, 2]);

    // Key addition should trigger
    n.set(2, 3);
    await reactive.wait();
    assertEquals(values, [10, 2, 3]);

    // Key deletion should trigger
    n.delete(1);
    await reactive.wait();
    assertEquals(values, [10, 3]);
});

Deno.test('reverseEntries() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let reverseEntries;

    reactive({
        def: () => {
            reverseEntries = [...n.reverseEntries()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(reverseEntries, [['1', 2], ['0', 1]]);

    // Value change should trigger
    n.set(1, 20);
    await reactive.wait();
    assertEquals(reverseEntries, [['1', 20], ['0', 1]]);

    // Key addition should trigger
    n.set(2, 3);
    await reactive.wait();
    assertEquals(reverseEntries, [['2', 3], ['1', 20], ['0', 1]]);

    // Reverse order should trigger
    n.reverse();
    await reactive.wait();
    assertEquals(reverseEntries, [['2', 1], ['1', 20], ['0', 3]]);
});

Deno.test('pairs() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let pairs;

    reactive({
        def: () => {
            pairs = n.pairs();
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(pairs, ['0', 1, '1', 2]);

    // Value change should trigger
    n.set(0, 10);
    await reactive.wait();
    assertEquals(pairs, ['0', 10, '1', 2]);

    // Key addition should trigger
    n.set(2, 3);
    await reactive.wait();
    assertEquals(pairs, ['0', 10, '1', 2, '2', 3]);
});

Deno.test('forEach() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let collected;

    reactive({
        def: () => {
            collected = [];
            n.forEach((v) => collected.push(v));
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(collected, [1, 2]);

    // Value change should trigger
    n.set(0, 10);
    await reactive.wait();
    assertEquals(collected, [10, 2]);

    // Key addition should trigger
    n.set(2, 3);
    await reactive.wait();
    assertEquals(collected, [10, 2, 3]);
});

Deno.test('filter() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    n.set(2, 3);
    let filteredSize;

    reactive({
        def: () => {
            filteredSize = n.filter(v => v > 1).size;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(filteredSize, 2);

    // Change value from 1 to 4
    n.set(0, 4);
    await reactive.wait();
    assertEquals(filteredSize, 3);

    // Change value from 3 to 0
    n.set(2, 0);
    await reactive.wait();
    assertEquals(filteredSize, 2);
});

Deno.test('find() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let foundValue;

    reactive({
        def: () => {
            foundValue = n.find(v => v > 1)?.[1];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(foundValue, 2);

    // Change value at index 1 to 0
    n.set(1, 0);
    await reactive.wait();
    assertEquals(foundValue, undefined);

    // Change value at index 0 to 5
    n.set(0, 5);
    await reactive.wait();
    assertEquals(foundValue, 5);
});

Deno.test('findLast() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    n.set(2, 1);
    let foundKey;

    reactive({
        def: () => {
            foundKey = n.findLast(v => v === 1)?.[0];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(foundKey, '2');

    // Change value at index 2 to 3
    n.set(2, 3);
    await reactive.wait();
    assertEquals(foundKey, '0');

    // Change value at index 0 to 3
    n.set(0, 3);
    await reactive.wait();
    assertEquals(foundKey, undefined);
});

Deno.test('keyOf() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let key;

    reactive({
        def: () => {
            key = n.keyOf(2);
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(key, '1');

    // Change value at index 1 to 3
    n.set(1, 3);
    await reactive.wait();
    assertEquals(key, undefined);

    // Change value at index 0 to 2
    n.set(0, 2);
    await reactive.wait();
    assertEquals(key, '0');
});

Deno.test('lastKeyOf() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    n.set(2, 1);
    let key;

    reactive({
        def: () => {
            key = n.lastKeyOf(1);
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(key, '2');

    // Change value at index 2 to 3
    n.set(2, 3);
    await reactive.wait();
    assertEquals(key, '0');

    // Change value at index 0 to 3
    n.set(0, 3);
    await reactive.wait();
    assertEquals(key, undefined);
});

Deno.test('includes() Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let includesTwo;

    reactive({
        def: () => {
            includesTwo = n.includes(2);
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(includesTwo, true);

    // Change value at index 1 to 3
    n.set(1, 3);
    await reactive.wait();
    assertEquals(includesTwo, false);

    // Change value at index 0 to 2
    n.set(0, 2);
    await reactive.wait();
    assertEquals(includesTwo, true);
});

Deno.test('slice() with raw option', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.push('a', 'b', 'c', 'd');

    // Slice without raw option should return final values
    const s1 = n.slice(1, 3);
    assertEquals(s1.size, 2);
    assertEquals(isReactive(s1.at(0)), false);
    assertEquals(s1.at(0), 'b');
    assertEquals(isReactive(s1.at(1)), false);
    assertEquals(s1.at(1), 'c');

    // Slice with raw option should return reactive values
    const s2 = n.slice(1, 3, { raw: true });
    assertEquals(s2.size, 2);
    assertEquals(isReactive(s2.atRaw(0)), true);
    assertEquals(s2.at(0), 'b');
    assertEquals(isReactive(s2.atRaw(1)), true);
    assertEquals(s2.at(1), 'c');

    // Verify that the sliced reactive values track changes
    let slicedVal;
    reactive({
        def: () => {
            slicedVal = s2.at(0);
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(slicedVal, 'b');

    // Change the value in the sliced NANOS
    s2.set(0, 'modified');
    await reactive.wait();
    assertEquals(slicedVal, 'modified');
});

Deno.test('toSLID() Displays Final Values (Not Reactive Internals)', async () => {
    // With extRio + autoReactive, values stored in NANOS are reactive wrappers.
    // toSLID() must serialize the final (resolved) values, not the reactive objects.
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 'alpha');
    n.set('key', 'beta');
    let slid;

    reactive({
        def: () => {
            slid = n.toSLID();
        },
        eager: true
    });

    await reactive.wait();
    // Final values should appear, not reactive object representations
    assertEquals(slid, "[(alpha key=beta)]");

    n.set(0, 'gamma');
    await reactive.wait();
    assertEquals(slid, "[(gamma key=beta)]");

    n.set('key', 'delta');
    await reactive.wait();
    assertEquals(slid, "[(gamma key=delta)]");
});

Deno.test('toSLID() Value-Change Reactivity', async () => {
    // Changing a value reactively (via extRio) should cause toSLID() to update.
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 1);
    n.set(1, 2);
    let slid;

    reactive({
        def: () => {
            slid = n.toSLID();
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(slid, '[(1 2)]');

    n.set(0, 10);
    await reactive.wait();
    assertEquals(slid, '[(10 2)]');

    n.set(1, 20);
    await reactive.wait();
    assertEquals(slid, '[(10 20)]');

    n.push(3);
    await reactive.wait();
    assertEquals(slid, '[(10 20 3)]');

    n.pop();
    await reactive.wait();
    assertEquals(slid, '[(10 20)]');
});

Deno.test('toSLID() Named Key Value-Change Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set('x', 1);
    n.set('y', 2);
    let slid;

    reactive({
        def: () => {
            slid = n.toSLID();
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(slid, '[(x=1 y=2)]');

    n.set('x', 10);
    await reactive.wait();
    assertEquals(slid, '[(x=10 y=2)]');

    n.set('y', 20);
    await reactive.wait();
    assertEquals(slid, '[(x=10 y=20)]');
});

Deno.test('toSLID() with Nested NANOS and Value Reactivity', async () => {
    // Inner NANOS uses extRio so its values are reactive too.
    const inner = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    inner.set(0, 'x');
    inner.set(1, 'y');
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set('inner', inner);
    let slid;

    reactive({
        def: () => {
            slid = n.toSLID();
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(slid, '[(inner=[x y])]');

    inner.set(0, 'X');
    await reactive.wait();
    assertEquals(slid, '[(inner=[X y])]');

    inner.set(1, 'Y');
    await reactive.wait();
    assertEquals(slid, '[(inner=[X Y])]');
});

Deno.test('toSLID() with compact Option and Value Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 'a');
    n.set(1, 'b');
    n.set('name', 'c');
    let slid;

    reactive({
        def: () => {
            slid = n.toSLID({ compact: true });
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(slid, "[(a b name=c)]");

    n.set(0, 'A');
    await reactive.wait();
    assertEquals(slid, "[(A b name=c)]");

    n.set('name', 'C');
    await reactive.wait();
    assertEquals(slid, "[(A b name=C)]");
});

Deno.test('toSLID() with redact Option and Value Reactivity', async () => {
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 'public');
    n.set('secret', 'hidden');
    n.set('visible', 'shown');
    let slid;

    reactive({
        def: () => {
            slid = n.toSLID({ redact: true });
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(slid, "[(public secret=hidden visible=shown)]");

    n.redact('secret');
    await reactive.wait();
    assertEquals(slid, "[(public visible=shown)]");

    n.set('visible', 'updated');
    await reactive.wait();
    assertEquals(slid, "[(public visible=updated)]");
});

Deno.test('NANOS.toSLID() Static Helper Displays Final Values', async () => {
    // The static toSLID() helper should also resolve reactive values via the RIO.
    const n = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    n.set(0, 'hello');
    n.set('k', 'world');
    let slid;

    reactive({
        def: () => {
            slid = toSLID(n);
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(slid, "[(hello k=world)]");

    n.set(0, 'hi');
    await reactive.wait();
    assertEquals(slid, "[(hi k=world)]");
});

Deno.test('toSLID() of Non-Reactive NANOS with Nested Reactive NANOS Shows Final Values', async () => {
    // The outer NANOS has no RIO (non-reactive). The inner NANOS uses extRio
    // so its values are reactive wrappers. When toSLID() is called on the outer
    // NANOS, it must serialize the inner NANOS using its own RIO to resolve
    // reactive values — the output must show final values, not reactive objects.
    const inner = new NANOS().setRIO(extRio()).setOptions({ autoReactive: true });
    inner.set(0, 'x');
    inner.set('name', 'y');

    // Outer NANOS has no RIO — it is non-reactive
    const outer = new NANOS();
    outer.set('inner', inner);

    // toSLID() on the non-reactive outer should still resolve inner's reactive values
    const slid = outer.toSLID();
    assertEquals(slid, '[(inner=[x name=y])]');

    // Mutate the inner reactive NANOS and verify toSLID() reflects the new final values
    inner.set(0, 'X');
    await reactive.wait();
    assertEquals(outer.toSLID(), '[(inner=[X name=y])]');

    inner.set('name', 'Y');
    await reactive.wait();
    assertEquals(outer.toSLID(), '[(inner=[X name=Y])]');
});
