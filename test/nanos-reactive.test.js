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

Deno.test('next Property Reactivity', async () => {
    const n = new NANOS(1, 2, 3).setRIO(rio());
    let nextValue;

    reactive({
        def: () => {
            nextValue = n.next;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(nextValue, 3);

    n.push(4);
    await reactive.wait();
    assertEquals(nextValue, 4);

    n.pop();
    await reactive.wait();
    assertEquals(nextValue, 3);

    n.next = 5;
    await reactive.wait();
    assertEquals(nextValue, 5);

    n.delete(2);
    await reactive.wait();
    assertEquals(nextValue, 5); // Sparse array, next unchanged
});

Deno.test('indexKeys() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set(1, 'b');
    n.set('name', 'c');
    let indexKeys;

    reactive({
        def: () => {
            indexKeys = [...n.indexKeys()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(indexKeys, ['0', '1']);

    n.set(2, 'd');
    await reactive.wait();
    assertEquals(indexKeys, ['0', '1', '2']);

    n.set('anotherName', 'e');
    await reactive.wait();
    assertEquals(indexKeys, ['0', '1', '2']); // Named key doesn't affect indexKeys

    n.delete(1);
    await reactive.wait();
    assertEquals(indexKeys, ['0', '2']);
});

Deno.test('namedKeys() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set('name1', 'b');
    n.set('name2', 'c');
    let namedKeys;

    reactive({
        def: () => {
            namedKeys = [...n.namedKeys()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(namedKeys, ['name1', 'name2']);

    n.set('name3', 'd');
    await reactive.wait();
    assertEquals(namedKeys, ['name1', 'name2', 'name3']);

    n.set(1, 'e');
    await reactive.wait();
    assertEquals(namedKeys, ['name1', 'name2', 'name3']); // Index doesn't affect namedKeys

    n.delete('name1');
    await reactive.wait();
    assertEquals(namedKeys, ['name2', 'name3']);
});

Deno.test('indexEntries() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set(1, 'b');
    n.set('name', 'c');
    let indexEntries;

    reactive({
        def: () => {
            indexEntries = [...n.indexEntries()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(indexEntries, [['0', 'a'], ['1', 'b']]);

    n.set(2, 'd');
    await reactive.wait();
    assertEquals(indexEntries, [['0', 'a'], ['1', 'b'], ['2', 'd']]);

    n.set('anotherName', 'e');
    await reactive.wait();
    assertEquals(indexEntries, [['0', 'a'], ['1', 'b'], ['2', 'd']]); // Named key doesn't affect

    n.delete(0);
    await reactive.wait();
    assertEquals(indexEntries, [['1', 'b'], ['2', 'd']]);
});

Deno.test('namedEntries() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set('name1', 'b');
    n.set('name2', 'c');
    let namedEntries;

    reactive({
        def: () => {
            namedEntries = [...n.namedEntries()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(namedEntries, [['name1', 'b'], ['name2', 'c']]);

    n.set('name3', 'd');
    await reactive.wait();
    assertEquals(namedEntries, [['name1', 'b'], ['name2', 'c'], ['name3', 'd']]);

    n.set(1, 'e');
    await reactive.wait();
    assertEquals(namedEntries, [['name1', 'b'], ['name2', 'c'], ['name3', 'd']]); // Index doesn't affect

    n.delete('name1');
    await reactive.wait();
    assertEquals(namedEntries, [['name2', 'c'], ['name3', 'd']]);
});

Deno.test('keyOf() Reactivity on Key Changes', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set(1, 'b');
    n.set(2, 'a');
    let key;

    reactive({
        def: () => {
            key = n.keyOf('a');
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(key, '0');

    n.delete(0);
    await reactive.wait();
    assertEquals(key, '2');

    n.set(3, 'a');
    await reactive.wait();
    assertEquals(key, '2'); // Still first match

    n.delete(2);
    await reactive.wait();
    assertEquals(key, '3');

    n.delete(3);
    await reactive.wait();
    assertEquals(key, undefined);
});

Deno.test('lastKeyOf() Reactivity on Key Changes', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set(1, 'b');
    n.set(2, 'a');
    let key;

    reactive({
        def: () => {
            key = n.lastKeyOf('a');
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(key, '2');

    n.set(3, 'a');
    await reactive.wait();
    assertEquals(key, '3');

    n.delete(3);
    await reactive.wait();
    assertEquals(key, '2');

    n.delete(0);
    n.delete(2);
    await reactive.wait();
    assertEquals(key, undefined);
});

Deno.test('includes() Reactivity on Key Changes', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set(1, 'b');
    let includesA;

    reactive({
        def: () => {
            includesA = n.includes('a');
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(includesA, true);

    n.delete(0);
    await reactive.wait();
    assertEquals(includesA, false);

    n.set(2, 'a');
    await reactive.wait();
    assertEquals(includesA, true);
});

Deno.test('storage Property Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    let storageKeyCount;

    reactive({
        def: () => {
            storageKeyCount = Object.keys(n.storage).length;
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(storageKeyCount, 0);

    n.set('a', 1);
    await reactive.wait();
    assertEquals(storageKeyCount, 1);

    n.set('b', 2);
    await reactive.wait();
    assertEquals(storageKeyCount, 2);

    n.delete('a');
    await reactive.wait();
    assertEquals(storageKeyCount, 1);
});

Deno.test('reverseEntries() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set(1, 'b');
    n.set(2, 'c');
    let reverseEntries;

    reactive({
        def: () => {
            reverseEntries = [...n.reverseEntries()];
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(reverseEntries, [['2', 'c'], ['1', 'b'], ['0', 'a']]);

    n.set(3, 'd');
    await reactive.wait();
    assertEquals(reverseEntries, [['3', 'd'], ['2', 'c'], ['1', 'b'], ['0', 'a']]);

    n.delete(1);
    await reactive.wait();
    assertEquals(reverseEntries, [['3', 'd'], ['2', 'c'], ['0', 'a']]);
});

Deno.test('pairs() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set(0, 'a');
    n.set(1, 'b');
    let pairs;

    reactive({
        def: () => {
            pairs = n.pairs();
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(pairs, ['0', 'a', '1', 'b']);

    n.set(2, 'c');
    await reactive.wait();
    assertEquals(pairs, ['0', 'a', '1', 'b', '2', 'c']);

    n.delete(0);
    await reactive.wait();
    assertEquals(pairs, ['1', 'b', '2', 'c']);
});

Deno.test('isLocked() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set('key', 'value');
    let isLockedAll, isLockedKey;

    reactive({
        def: () => {
            isLockedAll = n.isLocked();
            isLockedKey = n.isLocked('key');
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(isLockedAll, false);
    assertEquals(isLockedKey, false);

    n.lockKeys();
    await reactive.wait();
    assertEquals(isLockedAll, true);
    assertEquals(isLockedKey, false);

    n.lock('key');
    await reactive.wait();
    assertEquals(isLockedKey, true);
});

Deno.test('isRedacted() Reactivity', async () => {
    const n = new NANOS().setRIO(rio());
    n.set('key', 'value');
    let isRedacted;

    reactive({
        def: () => {
            isRedacted = n.isRedacted('key');
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(isRedacted, false);

    n.redact('key');
    await reactive.wait();
    assertEquals(isRedacted, true);
});

Deno.test('Manual depend() Call', async () => {
    const n = new NANOS().setRIO(rio());
    let recalcs = 0;

    reactive({
        def: () => {
            recalcs++;
            n.depend(); // Manual dependency registration
        },
        eager: true
    });

    await reactive.wait();
    assertEquals(recalcs, 1);

    n.set('a', 1);
    await reactive.wait();
    assertEquals(recalcs, 2); // Should be notified even without accessing properties
});
