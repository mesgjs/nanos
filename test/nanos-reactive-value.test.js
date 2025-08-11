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