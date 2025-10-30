import { reactive } from 'reactive/reactive.esm.js';
import { NANOS } from '../src/nanos.esm.js';
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
