import { reactive } from 'reactive/reactive.esm.js';

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