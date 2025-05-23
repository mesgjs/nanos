/*
 * reactive
 * A reactive value library supporting memoization and per-value
 * selection of lazy or eager, chain-less dependency evaluation.
 *
 * Copyright 2023-2025 by Kappa Computer Solutions, LLC and Brian Katzung
 * Author: Brian Katzung <briank@kappacs.com>
 */

// Return a new reactive value object
function reactive (opts = {}) {
    const r = Object.setPrototypeOf({
	_v: opts.v,			// Current value
	_cmp: opts.compare,		// Comparison function/value
	_rdy: true,			// Ready?
	_eager: opts.eager,		// Eager function eval
	_pros: new Set(),		// Providers
	_cons: new Set(),		// Consumers
	// _busy: true/undefined,	// Currently evaluating definition
	// _def: undefined,		// Reactive definition/memo/effect
	// _g: undefined,		// Getter function
	// _rov: undefined,		// Read-only view
	// _sched: undefined,		// Eval queue if scheduled
	// _s: undefined,		// Setter function

    }, reactive._prototype);

    if (opts.compare === undefined) r._cmp = r._defcmp;
    if (opts.def) r.def = opts.def;

    return r;
}

(r => {
    r._roPrototype = {
	get $reactive () { return r.type; },
	get readonly () { return true; },
	get rv () { return this.getter(); },
	toString () { return this.getter().toString(); },
	valueOf () { return this.getter(); },
    };
    r._prototype = Object.setPrototypeOf({
	/* PUBLIC ATTRIBUTES */
	get accessors () { return [this.getter, this.setter]; },
	get compare () { return this._cmp; },
	get def () { return this._def; },
	set def (d) {			// Set/change/clear definition
	    if (d === undefined) {	// Clear
		if (this._def) {
		    this.provider(null);
		    delete this._def;
		    this._setNotify(undefined);
		}
	    } else if (typeof d === 'function') {
		// Set/change
		this.provider(null);
		this._def = d;
		delete this._error;
		this._rdy = false;
		this._schedule();
	    } else if (d?.$reactive === r.type) {
		// Clone a reactive value using its getter function
		this.def = d.getter;
	    }
	},
	get eager () { return this._eager; },
	set eager (e) {			// Change def eval eagerness
	    this._eager = e;
	    this._schedule();
	},
	get error () { return this._error; },
	get getter () {			// Return getter function
	    return (this._g ||= () => this.rv);
	},
	// Return [getter, setter] pair
	get $reactive () { return r.type; },
	get readonly () { return false; },
	get readonlyView () {		// Get read-only view
	    if (!this._rov) {
		this._rov = Object.freeze(Object.setPrototypeOf({
		    get error () { return this._error; },
		    getter: this.getter,
		}, r._roPrototype));
	    }
	    return this._rov;
	},
	get rv () {			// Current value (readable)
	    if (this._sched !== undefined) {
		// Remove from scheduled evaluation queue
		r._REQ[this._sched].delete(this);
		delete this._sched;
	    }
	    if (r._consumer && !r._untrack) {
		// Producer-consumer tracking
		this.consumer(r._consumer);
		r._consumer.provider(this);
	    }
	    if (!this._checkReady()) {	// Recompute defined value?
		// Croak if trying to recursively reference our reactive
		// in order to define our value
		if (this._busy) throw new ReferenceError('Self-referential reactive definition');
		// Providers can change every iteration; start fresh
		this.provider(null);
		const pc = r._consumer;	// Save previous consumer
		r._consumer = this;	// We're the consumer now
		this._busy = true;	// For recursive def detection
					// Evaluate definition
		try {
		    delete this._error;
		    const res = this._def(this._v);
		    delete this._busy;
		    r._consumer = pc;	// Restore previous consumer
		    this._setNotify(res);
		} catch (e) {		// Try to clean up, unwind on error
		    delete this._busy;
		    r._consumer = pc;
		    this._error = e;
		    this._rdy = true;	// The error is our new result
		    this.ripple();
		    if (this._eager && !this._cons.size) {
			// In space, no one can hear you scream
			queueMicrotask(() => { throw new Error(`Unseen reactive error: ${e.message}`, { cause: [ e, r ] }); });
		    }
		    throw e;
		}
	    }
	    if (this._error) throw this._error;
	    return this._v;
	},
	get setter () {			// Return setter function
	    return (this._s ||= vvf => this._set(vvf));
	},
	get wv () { return this.rv; },	// Writable value
	set wv (v) {
	    // Setting a static value clears any existing definition.
	    // Unlike the setter function, a functional v is not special.
	    if (this._def) this.def = undefined;
	    this._setNotify(v);
	},
	/* PUBLIC METHODS */
	consumer (c, add = true) {	// Add/remove consumer
	    if (add) this._cons.add(c);
	    else this._cons.delete(c);
	},
	provider (p, add = true) {	// Add/remove/remove all provider(s)
	    if (p === null) {
		// Unsub from, and clear, all current providers
		for (const cp of this._pros) cp.consumer(this, false);
		this._pros.clear();
	    }
	    else if (add) this._pros.add(p);
	    else this._pros.delete(p);
	},
	// Ripple ready-state changes through consumers
	ripple (dis = 0) {
	    // Distance 0: our value changed
	    // Distance 1: an adjacent value changed
	    // Distance >1: a more distant value changed; our recalc may or
	    //   may not be required depending on intermediate results
	    const wasReady = this._rdy;
	    if (dis === 1) this._rdy = false;
	    if (dis > 1 && this._rdy) this._rdy = undefined;
	    // Ripple if local or transitioning from ready
	    if (!dis || (wasReady && !this._rdy)) {
		++r._evalWait;
		const nxt = dis + 1;
		for (const con of this._cons) con.ripple(nxt);
		--r._evalWait;
	    }
	    this._schedule(dis);	// Call me, maybe!
	},
	set (vvf) {			// Chainable set
	    // e.g. .setEager(0).set(v0).setDef(v => f(v)).setEager(1)
	    // Accepts a value or a mapping function (like setter(vvf)).
	    this._set(vvf);
	    return this;
	},
	// Set value; ripple-notify consumers of changes
	setDef (d) {			// Set def (chainable)
	    this.def = d;
	    return this;
	},
	setEager (e) {			// Set eager (chainable)
	    this.eager = e;
	    return this;
	},
	unready () {			// Force unready
	    if (this._def) this._rdy = false;
	    this._schedule();
	    return this;
	},
	/* PRIVATE METHODS */
	_checkReady () {		// Determine boolean readiness
	    if (this._rdy !== undefined) return this._rdy;
	    /*
	     * When the readiness is undefined, check providers for ripple
	     * changes. If any provider has changed, we must recalculate too.
	     */
	    for (const pro of this._pros) {
		// Provider changes will be rippled to us (d=1)
		pro.rv;
		if (this._rdy === false) return false;
	    }
	    /*
	     * No providers rippled a change to us during (recursive)
	     * dependency checking, so we're actually still ready!
	     */
	    return (this._rdy = true);
	},
	_defcmp (a, b) { return a !== b; },// Default comparison function
	_schedule (dis = 0) {		// Schedule for eval if needed
	    if (!this._rdy && this._sched === undefined && (this._eager || this._cons.size)) r._queueEval(this, dis);
	    r.run();
	},
	_set (vvf) {			// Prototype setter
	    // Setting a static value clears any existing definition.
	    // Accepts a value or an old-to-new-value mapping function.
	    if (this._def) this.def = undefined;
	    if (typeof vvf === 'function') this._setNotify(vvf(this._v));
	    else this._setNotify(vvf);
	    return this._v;
	},
	_setNotify (v) {
	    const chg = (typeof this._cmp === 'function') ? this._cmp(this._v, v) : this._cmp;
	    this._v = v;
	    this._rdy = true;
	    delete this._error;
	    if (chg) this.ripple();
	},
    }, r._roPrototype);

    // Yielding recalculation queue runner
    async function runner () {
	if (!r._evalWait) {
	    ++r._evalWait;
	    const [ q0, q1, q2 ] = r._REQ;
	    const runFirst = q => { try { q.values().next().value.rv; } catch (_err) {/**/} };
	    let lastYield = performance.now();
	    const cede = async () => {
		if (performance.now() - lastYield >= r.sliceTime) {
		    await new Promise(r => setTimeout(r, 0));
		    lastYield = performance.now();
		}
	    };
	    /*
	     * NB: .rv exceptions will be rethrown to consumers; we
	     * deliberately ignore them and process the rest of the graph.
	     * Abort if evalWait goes up (running a batch).
	     */
	    while (r._evalWait < 2) {
		for (const ro of q0) {
		    if (r._evalWait < 2) try { ro.rv; } catch (_err) {/**/} finally { await cede(); }
		    else break;
		}
		if (r._evalWait > 1) break;
		else if (q1.size) runFirst(q1);
		else if (q2.size) runFirst(q2);
		else break;		// All queues empty
		await cede();
	    }
	    --r._evalWait;
	}
    }

    Object.assign(r, {
	_evalWait: 0,			// Suspend evaluation
	sliceTime: 5,			// Slice yield threshold (ms)
	_tasks: [],			// Run-queue tasks
	_untrack: 0,			// Suspend tracking
	// Reactive evaluation queues
	_REQ: [ new Set(), new Set(), new Set() ],
	/* PUBLIC METHODS */
	batch (cb) {			// Execute callback as a batch
	    ++r._evalWait;
	    const res = cb();
	    --r._evalWait;
	    r.run();
	    return res;
	},
	fv (v, bfv = false) {	// Final value in possibly-reactive chain
	    while (v?.$reactive === reactive.type) v = v.rv;
	    return ((bfv && typeof v?._bundle === 'function') ? v._bundle() : v);
	},
	run () {			// Run the eval queues (maybe)
	    if (!r._evalWait) setTimeout(runner, 0);
	},
	get type () { return 1; },	// Type 1: basic direct
	typeOf (v) { return v?.$reactive; },// Reactive type, if any
	untracked (cb) {		// Execute callback untracked
	    ++r._untrack;
	    const res = cb();
	    --r._untrack;
	    return res;
	},
	/* PRIVATE METHODS */
	_queueEval (ro, dis = 0) {	// Queue reactive evaluation
	    dis = Math.min(dis, 2);
	    if (typeof ro._sched === 'number') {
		if (ro._sched <= dis) return;
		r._REQ[ro._sched].delete(ro);
	    }
	    r._REQ[ro._sched = dis].add(ro);
	},
    });
})(reactive);

export { reactive, reactive as default };

// END
