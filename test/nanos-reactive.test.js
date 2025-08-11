import { reactive } from 'reactive/reactive.esm.js';
import { NANOS } from '../src/nanos.esm.js';
import {
    assertEquals,
    assertNotEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Create a NANOS-compatible reactive-interface object ("RIO") for a new or existing reactive object
const rio = (r) => {
    if (!r) r = reactive();
    return {
	batch: reactive.batch,
	changed: () => r.ripple(),
	create: rio,
	depend: () => r.rv
    };
};

Deno.test('Container-Level Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    let keyCount, hasNewKey, size;

    reactive({
        def: () => {
            keyCount = [...n.keys()].length;
            hasNewKey = n.has('newKey');
            size = n.size;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(keyCount, 0);
    assertEquals(hasNewKey, false);
    assertEquals(size, 0);

    n.set('newKey', 'value');
    await reactive.wait();
    assertEquals(keyCount, 1);
    assertEquals(hasNewKey, true);
    assertEquals(size, 1);

    n.delete('newKey');
    await reactive.wait();
    assertEquals(keyCount, 0);
    assertEquals(hasNewKey, false);
    assertEquals(size, 0);
});

Deno.test('Structural Change Reactivity', async () => {
    const n = new NANOS(1, 2, 3).setRIO(rio());
    let values;

    reactive({
        def: () => {
            values = [...n.values()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(values, [1, 2, 3]);

    n.push(4);
    await reactive.wait();
    assertEquals(values, [1, 2, 3, 4]);

    n.pop();
    await reactive.wait();
    assertEquals(values, [1, 2, 3]);

    n.shift();
    await reactive.wait();
    assertEquals(values, [2, 3]);

    n.unshift(1);
    await reactive.wait();
    assertEquals(values, [1, 2, 3]);

    n.reverse();
    await reactive.wait();
    assertEquals(values, [3, 2, 1]);
});

Deno.test('Dual Dependency of at()', async () => {
    const rValue = reactive({ v: 'initial' });
    const n = new NANOS().setRIO(rio());
    let val;
    let recalcs = 0;

    reactive({
        def: () => {
            recalcs++;
            val = n.at('key')?.rv;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(recalcs, 1);
    assertEquals(val, undefined);

    n.set('key', rValue);
    await reactive.wait();
    assertEquals(recalcs, 2);
    assertEquals(val, 'initial');

    rValue.wv = 'modified';
    await reactive.wait();
    assertEquals(recalcs, 3);
    assertEquals(val, 'modified');

    n.delete('key');
    await reactive.wait();
    assertEquals(recalcs, 4);
    assertEquals(val, undefined);
});

Deno.test('Nested Reactivity (Dependency Path)', async () => {
    const grandchildValue = reactive({ v: 1 });
    const childNanos = new NANOS({ grandchildKey: grandchildValue }).setRIO(rio());
    const rParent = reactive({ v: childNanos });
    const parentNanos = new NANOS({ childKey: rParent }).setRIO(rio());
    let result;
    let recalcs = 0;

    reactive({
        def: () => {
            recalcs++;
            const child = parentNanos.at('childKey')?.rv;
            result = child?.at('grandchildKey')?.rv;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(recalcs, 1);
    assertEquals(result, 1);

    grandchildValue.wv = 2;
    await reactive.wait();
    assertEquals(recalcs, 2);
    assertEquals(result, 2);

    const newChild = new NANOS().setRIO(rio());
    parentNanos.at('childKey').wv = newChild;
    await reactive.wait();
    assertEquals(recalcs, 3);
    assertEquals(result, undefined);

    parentNanos.delete('childKey');
    await reactive.wait();
    assertEquals(recalcs, 4);
    assertEquals(result, undefined);
});


Deno.test('Batching and Deferred Recalculation', async () => {
    const n = new NANOS().setRIO(rio());
    let recalcs = 0;

    reactive({
        def: () => {
            recalcs++;
            return n.size;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(recalcs, 1);

    reactive.batch(() => {
        n.set('a', 1);
        n.set('b', 2);
        n.set('c', 3);
    });
    await reactive.wait();
    assertEquals(n.size, 3);
    assertEquals(recalcs, 2);
});

Deno.test('similar() Method and Independent Reactivity', async () => {
    const parent = new NANOS().setRIO(rio());
    const child = parent.similar();
    let parentRecalcs = 0;

    reactive({
        def: () => {
            parentRecalcs++;
            return parent.size;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(parentRecalcs, 1);

    child.set('a', 1);
    await reactive.wait();

    assertEquals(parent.size, 0);
    assertEquals(child.size, 1);
    assertEquals(parentRecalcs, 1);
});