/*
 * NANOS - Named and numbered ordered storage
 * Copyright 2024-2025 by Kappa Computer Solutions, LLC and Brian Katzung
 * Author: Brian Katzung <briank@kappacs.com>
 */

import { escapeJSString, unescapeJSString } from './vendor/escape-js.esm.js';

//////////////////////////////////////////////////////////////////////
// SLID and QJSON parsing details
//////////////////////////////////////////////////////////////////////

// SysCL List Data lexical token regexps
const slidPats = {
	mlc: '/\\*.*?\\*/',			// Multi-line comment
	// Numbers
	flt: '[+-]?\\d+(?:[.]\\d+)?(?:[eE][+-]?\\d+)?(?![0-9a-zA-Z])',
	int: '[+-]?(?:0[bB][01]+|0[oO][0-7]+|0[xX][0-9a-fA-F]+|\\d+)n?(?![0-9a-zA-Z])',
	sqs: "'(?:\\\\'|[^'])*'",	// Single-quoted string
	dqs: '"(?:\\\\"|[^"])*"',	// Double-quoted string
	stok: '[[=\\]]',			// Special tokens
	spc: '\\s+',				// Space
	oth: '(?:[^\'"/[=\\]\\s]|\\/(?![*]))+',		// Other
};
const slidRE = new RegExp('(' + 'mlc flt int sqs dqs stok spc oth'.split(' ').map((k) => slidPats[k]).join('|') + ')', 's');
const slidNum = new RegExp(`^(${slidPats.flt}|${slidPats.int})$`);

const qjMap = { '{': '[', '}': ']', ',': ' ', ':': '=' };

//////////////////////////////////////////////////////////////////////

/**
 * Checks if a key is a valid array index.
 * @param {string} key
 * @returns {boolean}
 */
export const isIndex = (key) => /^(?:0|[1-9]\d*)$/.test(key);

/**
 * Checks if a key is a negative index.
 * @param {string} key
 * @returns {boolean}
 */
export const isNegIndex = (key) => /^-[1-9]\d*$/.test(key);

/**
 * Checks if a value is a plain object.
 * @param {*} value
 * @returns {boolean}
 */
const isPlainObject = (value) => {
	if (typeof value !== 'object' || value === null) return false;
	const consName = value?.constructor?.name;
	return (consName === undefined || consName === 'Object');
};

/**
 * Named and Numbered Ordered Storage.
 * @class
 */
export class NANOS {
	/**
	 * Creates a new NANOS instance.
	 * @param {...*} items
	 */
	constructor (...items) {
		this._options = {};
		this.clear();
		this.push(...items);
	}

	/**
	 * Get value at key or index. If the value is reactive, the "final"
	 * (non-reactive) value is returned. See also `atRaw()`.
	 * @param {string|number|Array<(string|number)>} key Path to value
	 * @param {object} [opts] Options object
	 * @param {*} [opts.default] Default value to return if key is absent
	 * @param {boolean} [opts.raw=false] Return the raw value instead
	 * @returns {*}
	 */
	at (key, opts = {}) {
		opts = this.#getOpts(opts, 'default');
		if (Array.isArray(key)) {
			// deno-lint-ignore no-this-alias
			let next = this;
			for (const curKey of key) {
				next = this.#final(next);
				if (!(next instanceof NANOS) || !next.has(curKey)) return opts.default;
				next = next.atRaw(curKey);
			}
			if (!opts.raw && this._rio?.get) next = this.#final(next);
			return next;
		}
		this._rio?.depend();
		key = this.#wrapKey(key);
		if (Object.hasOwn(this._storage, key)) {
			let ret = this._storage[key];
			if (!opts.raw && this._rio?.get) ret = this.#final(ret);
			return ret;
		}
		return opts.default;
	}

	/**
	 * Get the "raw" value at a key or index (negative index relative to end).
	 * This may be a reactive value. See also `at()`.
	 * @param {string|number|Array<(string|number)>} key
	 * @param {object} [opts] Options object
	 * @param {*} [opts.default] Default value to return if key is absent
	 * @returns
	 */
	atRaw (key, opts = {}) {
		opts = this.#getOpts(opts, 'default', { raw: true });
		return this.at(key, opts);
	}

	/**
	 * Clears the NANOS instance.
	 * @returns {this}
	 */
	clear () {
		if (this._locked) throw new TypeError('NANOS: Cannot "clear" after locking');
		this._next = 0;
		this._keys = [];
		this._storage = {};
		this._lockInd = undefined;
		delete this._redacted;
		this._rio?.changed();
		return this;
	}

	/**
	 * Freezes this NANOS and all nested NANOS values recursively.
	 * @returns {this}
	 */
	deepFreeze () {
		this.freeze();
		for (const [_key, value] of this.entries()) {
			if (value instanceof NANOS) {
				value.deepFreeze();
			}
		}
		return this;
	}

	/**
	 * Deletes a key-value pair.
	 * NOTE: unlike the delete statement, this returns the deleted value!
	 * @param {string|number} key
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.raw=false] Return the raw, rather than final, deleted value
	 * @returns {*}
	 */
	delete (key, opts = {}) {
		if (this._locked) throw new TypeError('NANOS: Cannot "delete" after locking');
		const skey = String(key);
		const ret = this._storage[skey];
		if (Object.hasOwn(this._storage, skey)) {
			delete this._storage[skey];
			this._keys = this._keys.filter((k) => k !== skey);
			this._rio?.changed();
		}
		return (opts.raw ? ret : this.#final(ret));
	}

	/** Signals a dependency for reactive interfaces. */
	depend () { this._rio?.depend(); }

	/**
	 * Returns an iterator of [key, value] pairs.
	 * Compact mode uses numeric index keys instead of the standard strings
	 * (e.g. 0 instead of '0').
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.compact=false] Return numeric index keys instead of strings
	 * @param {boolean} [opts.raw=false] Return raw, rather than final, reactive values
	 * @yields {[string|number, *]}
	 */
	*entries (opts = {}) {
		opts = this.#getOpts(opts, 'compact');
		this._rio?.depend();
		const storage = this._storage;
		const ik = opts.compact ? ((k) => isIndex(k) ? parseInt(k, 10) : k) : ((k) => k);
		const fv = (opts.raw || !this._rio?.get) ? ((v) => v) : ((v) => this.#final(v));
		for (const k of this._keys) yield [ ik(k), fv(storage[k]) ];
	}

	/**
	 * Returns a shallow copy of elements for which f(value, key) is true.
	 * @param {function(*, string|number, NANOS): boolean} f The filter function
	 * @param {object} [opts] Options object, passed to entries()
	 * @returns {NANOS}
	 */
	filter (f, opts = {}) {
		this._rio?.depend();
		const result = this.similar();
		result.fromEntries([...this.entries(opts)].filter((kv) => f(kv[1], kv[0], this)));
		return result;
	}

	#final (value) {
		while (this._rio?.isReactive?.(value)) value = this._rio.get(value);
		return value;
	}

	/**
	 * Returns first [key, value] where f(value, key) is true; cf find, findIndex.
	 * @param {function(*, string|number, NANOS): boolean} f
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.raw=false] Pass the filter raw, rather than final, reactive values
	 * @returns {[string|number, *]|undefined}
	 */
	find (f, opts = {}) {
		this._rio?.depend();
		const s = this._storage;
		const toFinal = (opts.raw || !this._rio?.get) ? ((v) => v) : ((v) => this.#final(v));
		for (const k of this._keys) {
			const final = toFinal(s[k]);
			if (f(final, k, this)) return [k, final];
		}
	}

	/**
	 * Returns last [key, value] where f(value, key) is true; cf findLast, findLastIndex.
	 * @param {function(*, string|number, NANOS): boolean} f
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.raw=false] Pass the filter raw, rather than final, reactive values
	 * @returns {[string|number, *]|undefined}
	 */
	findLast (f, opts = {}) {
		this._rio?.depend();
		const s = this._storage;
		const toFinal = (opts.raw || !this._rio?.get) ? ((v) => v) : ((v) => this.#final(v));
		for (const k of this._keys.toReversed()) {
			const final = toFinal(s[k]);
			if (f(final, k, this)) return [k, final];
		}
	}

	/**
	 * Executes a function for each element.
	 * @param {function(*, string|number, NANOS): void} f
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.raw=false] Pass the filter raw, rather than final, reactive values
	 */
	forEach (f, opts = {}) {
		this._rio?.depend();
		const storage = this._storage;
		const toFinal = (opts.raw || !this._rio?.get) ? ((v) => v) : ((v) => this.#final(v));
		for (const k of this._keys) {
			const final = toFinal(storage[k]);
			f(final, k, this);
		}
	}

	/**
	 * Renders the NANOS completely locked and immutable.
	 * @returns {this}
	 */
	freeze () {
		if (!Object.isFrozen(this)) {
			this._locked = true;
			this._lockInd = true;
			Object.freeze(this);
		}
		Object.freeze(this._keys);
		Object.freeze(this._storage);
		if (typeof this._redacted === 'object') Object.freeze(this._redacted);
		return this;
	}

	/**
	 * Populates the NANOS from another NANOS
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.deep] Deep-copy instead of shallow
	 * @param {boolean} [opts.raw] Transfer raw values
	 */
	from (source, opts = {}) {
		if (this._locked) throw new TypeError('NANOS: Cannot "from" after locking');
		if (!(source instanceof NANOS)) return this;
		const batch = this._rio?.batch || ((cb) => cb());
		batch(() => {
			for (const kv of source.entries({ raw: opts.raw })) {
				let [key, value] = kv;
				if (opts.deep && value instanceof NANOS) {
					value = this.similar().from(value, opts);
				}
				this.set(key, value, { raw: true });
			}
			this.next = source.next;
		});
		return this;
	}

	/**
	 * Populates the NANOS from an array of [key, value] entries.
	 * @param {Array<[string|number, *]>} entries
	 * @param {boolean} [insert=false] Use insert mode instead of append mode
	 * @returns {this}
	 */
	fromEntries (entries, insert = false) {
		if (this._locked) throw new TypeError('NANOS: Cannot "fromEntries" after locking');
		if (insert && this._lockInd) throw new TypeError('NANOS: Cannot insert "fromEntries" after index lock');
		const batch = this._rio?.batch || ((cb) => cb());
		batch(() => {
			if (insert) for (const e of [...entries].reverse()) this.set(e[0], e[1], true);
			else for (const e of entries) this.set(e[0], e[1]);
			this._rio?.changed();
		});
		return this;
	}

	/**
	 * Populates from a list of key-value pairs.
	 * Can be [ key1, value1, ... keyN, valueN ]
	 * or { type: '@NANOS@', next, pairs }
	 * @param {...*} pairs
	 * @returns {this}
	 */
	fromPairs (...pairs) {
		if (this._locked) throw new TypeError('NANOS: Cannot "fromPairs" after locking');
		const batch = this._rio?.batch || ((cb) => cb());
		if (isPlainObject(pairs[0]) && pairs[0].type === '@NANOS@') {
			batch(() => {
				this.fromPairs(pairs[0].pairs);
				this.next = pairs[0].next;
				this._rio?.changed();
			});
			return this;
		}
		if (Array.isArray(pairs[0])) pairs = pairs[0];
		const end = pairs.length - 1;
		batch(() => {
			for (let i = 0; i < end; i += 2) {
				if (pairs[i] === undefined && !(i + 1 in pairs)) ++this._next;
				else this.set(pairs[i], pairs[i + 1]);
			}
			this._rio?.changed();
		});
		return this;
	}

	/**
	 * Return a normalized options object when the value might historically have been a single scalar option.
	 * @param {object|boolean} optParam 
	 * @param {string} defKey 
	 * @param {object} defOpts 
	 * @returns 
	 */
	#getOpts (optParam, defKey, defOpts = {}) {
		const optObj = isPlainObject(optParam) ? optParam : { [defKey]: optParam };
		return { ...defOpts, ...optObj };
	}

	/**
	 * Checks for the existence of a key.
	 * Instead of "key in NANOS".
	 * @param {string|number} key
	 * @returns {boolean}
	 */
	has (key) {
		this._rio?.depend();
		return Object.hasOwn(this._storage, this.#wrapKey(key));
	}

	/**
	 * Checks if a value exists.
	 * @param {*} value
	 * @param {object} [opts] Options object, passed to keyOf/find
	 * @returns {boolean}
	 */
	includes (value, opts = {}) {
		return this.keyOf(value, opts) !== undefined;
	}

	/**
	 * Iterates over indexed entries.
	 * @param {object} [opts] Options object, passed to entries
	 * @param {boolean} [opts.compact=false] Return number indexes rather than strings
	 * @param {boolean} [opts.raw=false] Return raw, rather than final, reactive values
	 * @yields {[string|number, *]}
	 */
	*indexEntries (opts) {
		opts = this.#getOpts(opts, 'compact');
		for (const kv of this.entries(opts)) if (isIndex(kv[0])) yield kv;
	}

	/**
	 * Iterates over index keys.
	 * @yields {string}
	 */
	*indexKeys () {
		this._rio?.depend();
		for (const k of this._keys) if (isIndex(k)) yield k;
	}

	/**
	 * Is a key/value (or, if undef, the key-set) locked?
	 * @param {string|number} [key]
	 * @returns {boolean}
	 */
	isLocked (key) {
		this._rio?.depend();
		if (key === undefined) return !!this._locked;	// Key-set locked
		key = this.#wrapKey(key);
		if (this._locked && !Object.hasOwn(this._storage, key)) return true;
		return !Object.getOwnPropertyDescriptor(this._storage, key)?.writable;
	}

	/**
	 * Is a key/value redacted?
	 * @param {string|number} key
	 * @returns {boolean}
	 */
	isRedacted (key) {
		this._rio?.depend();
		if (this._redacted === true) return true;
		key = this.#wrapKey(key);
		if (isIndex(key)) return !!this._redacted?.[0];
		return !!this._redacted?.[key];
	}

	/**
	 * Returns first key/index with matching value, or undefined; cf indexOf.
	 * @param {*} value
	 * @param {object} [opts] Options object, passed to find
	 * @returns {string|number|undefined}
	 */
	keyOf (value, opts = {}) { return this.find((v) => v === value, opts)?.[0]; }

	/**
	 * Returns an iterator for the keys.
	 * @returns {Iterator<string>}
	 */
	keys () {
		this._rio?.depend();
		return this._keys.values();
	}

	/**
	 * Returns last key/index with matching value, or undefined; cf lastIndexOf.
	 * @param {*} value
	 * @param {object} [opts] Options object, passed to findLast
	 * @returns {string|number|undefined}
	 */
	lastKeyOf (value, opts = {}) {
		return this.findLast((v) => v === value, opts)?.[0];
	}

	/**
	 * Lock specific *values* by key (doesn't affect key addition/removal).
	 * @param {...(string|number)} keys
	 * @returns {this}
	 */
	lock (...keys) {
		if (keys.length === 1 && Array.isArray(keys[0])) keys = keys[0];
		for (let key of keys) {
			key = this.#wrapKey(key);
			if (isIndex(key)) this._lockInd = true;
			if (key !== undefined) Object.defineProperty(this._storage, key, {
				value: this.at(key), enumerable: true,
				writable: false, configurable: false
			});
		}
		this._rio?.changed();
		return this;
	}

	/**
	 * Lock all current (and possibly new) *values* (doesn't affect keys).
	 * @param {boolean} [andNew=false] Also lock new keys' values as they are added
	 * @returns {this}
	 */
	lockAll (andNew = false) {
		if (andNew) this._lockNew = true;
		this.lock(this._keys);
		return this;
	}

	/**
	 * Lock the *key* set (no new keys or indexes, but unlocked values can still change).
	 * @returns {this}
	 */
	lockKeys () {
		this._locked = true;
		this._rio?.changed();
		return this;
	}

	/**
	 * Determine if a value is map-like (key: value, ...).
	 * @param {*} value
	 * @returns {boolean}
	 */
	#mapish (value) {
		return (isPlainObject(value) || (!this._options.opaqueMaps && value instanceof Map));
	}

	/**
	 * Iterates over named entries.
	 * @param {object} [opts] Options block, passed to entries
	 * @yields {[string, *]}
	 */
	*namedEntries (opts = {}) {
		for (const kv of this.entries(opts)) if (!isIndex(kv[0])) yield kv;
	}

	/**
	 * Iterates over named keys.
	 * @param {object} [opts] Options block, passed to entries
	 * @yields {string}
	 */
	*namedKeys (opts = {}) {
		for (const kv of this.entries({ ...opts, raw: true })) if (!isIndex(kv[0])) yield kv[0];
	}

	/**
	 * "Next" index (max index + 1); similar to array.length.
	 * @returns {number}
	 */
	get next () {
		this._rio?.depend();
		return this._next;
	}
	/**
	 * Sets the next index, truncating if necessary.
	 * @param {number} nn
	 */
	set next (nn) {
		if (this._locked) throw new TypeError('NANOS: Cannot set "next" after locking');
		if (!Number.isInteger(nn) || nn < 0) return;
		for (let i = this._next; --i >= nn; this.delete(i));
		if (this._next !== nn) {
			this._next = nn;
			this._rio?.changed();
		}
	}

	/**
	 * Return the current options.
	 * @returns {object}
	 */
	get options () {
		return Object.assign({}, this._options);
	}

	/**
	 * Returns a flat array of key-value pairs.
	 * @param {boolean} [compact=false]
	 * @returns {Array<*>}
	 */
	pairs (opts = {}) {
		opts = this.#getOpts(opts, 'compact');
		return [...this.entries(opts)].flat(1);
	}

	/**
	 * Parse relaxed, "quasi-JSON" (by way of SLID).
	 * The distinction between { } and [ ] is ignored.
	 * Values may be separated by commas or spaces.
	 * Text without special characters need not be quoted.
	 * Key-value pairs may be separated by `:` or `=`.
	 * @param {string} str
	 * @returns {NANOS}
	 */
	static parseQJSON (str) {
		return parseSLID('[(' + str.replaceAll(/^\s*[\[\{]?|[\]\}]\s*$/g, '')
		.split(/("(?:\\\\"|[^"])*")/)
		.map((s) => (s[0] === '"') ? s : s.replace(/[{},:]/g, (c) => qjMap[c]))
		.join('') + ')]', true);
	}

	/**
	 * Parse SLID-format data, returning (potentially nested) NANOS.
	 * @param {string} str
	 * @param {boolean} [qj=false]
	 * @returns {NANOS}
	 */
	static parseSLID (str, qj = false) {
		let match = str.match(/\[\((.*?)\)\]/s);
		if (!match) throw new SyntaxError('Missing SLID boundary marker(s)');
		const tokens = match[1].replace(/\)\\\]/g, ')]').split(slidRE).filter((t) => !/^(\s*|\/\*.*\*\/)$/.test(t));
		match = undefined;
		const parseLeft = () => {		// Can be left of = (numbers, strings)
			const token = tokens.shift();
			if (slidNum.test(token)) {
				if (/n$/i.test(token)) return BigInt(token.slice(0, -1));
				if (/^[+-]?0b/i.test(token)) return parseInt(token.replace(/0b/i, ''), 2);
				if (/^[+-]?0o/i.test(token)) return parseInt(token.replace(/0o/i, ''), 8);
				if (/^[+-]?0x/i.test(token)) return parseInt(token.replace(/0x/i, ''), 16);
				return parseFloat(token);
			}
			if (token === "'" || token === '"') throw new SyntaxError(`Unmatched ${token} in SLID`);
			if (token[0] !== "'" && token[0] !== '"') return token;
			return unescapeJSString(token.slice(1, -1));
		}
		const parseRight = () => {		// More that can be right of =
			if (tokens[0] !== '[') {
				if (qj) switch (tokens[0]) {
				case 'false': tokens.shift(); return false;
				case 'null': tokens.shift(); return null;
				case 'true': tokens.shift(); return true;
				} else switch (tokens[0]) {// Special values
				case '@f': tokens.shift(); return false;
				case '@n': tokens.shift(); return null;
				case '@t': tokens.shift(); return true;
				case '@u': tokens.shift(); return undefined;
				}
				return parseLeft();		// Everything OK on the left
			}
			tokens.shift();
			return parseItems.call(this);		// Nested lists
		}
		const parseItems = () => {
			const result = new NANOS();
			while (tokens.length && tokens[0] !== ']') {
				let key;						// Default: positional
				if (tokens[1] === '=') {		// Named value
					key = parseLeft();
					tokens.shift();
				} else if (!qj && tokens[0] === '@e') { // Empty
					tokens.shift();
					++result.next;
					continue;
				}
				result.set(key, parseRight());
			}
			if (tokens[0] === ']') tokens.shift();
			return result;
		}
		const result = parseItems();
		// SLID was malformed if any tokens are left
		if (tokens.length) throw new SyntaxError('Malformed SLID');
		return result;
	}

	/**
	 * Sets or adds a value along a key path with auto-vivification.
	 * Automatically creates intermediate NANOS instances as needed to traverse the path.
	 * @param {string|number|Array<(string|number)>} path - The key path to traverse. Can be a single key or an array of keys.
	 * @param {object} [opts] - Options object
	 * @param {*} [opts.to] - Value to set at the final key in the path
	 * @param {*} [opts.first] - Value to unshift at the target path
	 * @param {*} [opts.next] - Value to push at the target path
	 * @param {boolean} [opts.insert=false] - If true with `opts.to`, insert instead of append
	 * @param {boolean} [opts.raw=false] - If true with `opts.to`, set raw value without RIO processing
	 * @returns {{base: NANOS, leaf: NANOS, key?: (string|number), value?: *, first?: *, next?: *}} Object with `base` (this instance), `leaf` (target NANOS), and operation-specific properties (`key`/`value` for `to`, `first` for unshift, `next` for push)
	 * @example
	 * // Set a value at a nested path
	 * n.pathSet(['user', 'profile', 'name'], { to: 'Alice' });
	 *
	 * // Push a value to a nested array
	 * n.pathSet(['data', 'items'], { next: 'newItem' });
	 *
	 * // Unshift a value to a nested array
	 * n.pathSet(['data', 'items'], { first: 'firstItem' });
	 */
	pathSet (path, opts = {}) {
		// Auto-vivifying traversal
		const avt = (path) => {
			let leaf = this;
			for (const key of path) {
				let val = leaf.at(key);
				if (!(val instanceof NANOS)) {
					val = leaf.similar();
					leaf.set(key, val);
				}
				leaf = val;
			}
			return leaf;
		};
		if (!Array.isArray(path)) path = [path];
		if (Object.hasOwn(opts, 'to') && path.length) {
			const { to: value, insert=false, raw=false } = opts;
			const leaf = avt(path.slice(0, -1)), key = path.slice(-1)[0];
			leaf.set(key, value, { insert, raw });
			return { base: this, leaf, key, value };
		}
		const leaf = avt(path), res = { base: this, leaf };
		if (Object.hasOwn(opts, 'first')) {
			const first = opts.first;
			leaf.unshift(first);
			res.first = first;
		}
		if (Object.hasOwn(opts, 'next')) {
			const next = opts.next;
			leaf.push(next);
			res.next = next;
		}
		return res;
	}

	/**
	 * Like Array.pop (only applies to indexed values).
	 * @param {object} [opts] Options block, passed to delete
	 * @param {boolean} [opts.raw=false] Return the raw, rather than final, popped value
	 * @returns {*}
	 */
	pop (opts = {}) {
		if (this._locked) throw new TypeError('NANOS: Cannot "pop" after locking');
		if (this._lockInd) throw new TypeError('NANOS: Cannot "pop" after index lock');
		if (!this._next) return undefined;
		return this.delete(--this._next, opts);
	}

	/**
	 * Appends new elements.
	 * When pushing transparent objects (array, NANOS, object), named keys
	 * are set directly and index keys are appended as an offset from _next
	 * (therefore preserving any gaps).
	 * Push [ object ] to add the actual object itself.
	 * @param {...*} values
	 * @returns {this}
	 */
	push (...values) {
		if (this._locked) throw new TypeError('NANOS: Cannot "push" after locking');
		const batch = this._rio?.batch || ((cb) => cb());
		const options = this._options, transform = options.transform;
		const pushEntries = (entries, next = 0) => {
			const base = this._next, minNext = base + next;
			for (let [key, value] of entries) {
				if (isIndex(key)) {
					// Positional: preserve sparseness, potentially transforming
					// map-ish and set-ish values into nested NANOS
					const newKey = base + parseInt(key, 10);
					if (transform && (this.#mapish(value) || this.#setish(value))) value = this.similar(value);
					this.set(newKey, value);
				} else this.set(key, value);
			}
			if (this._next < minNext) this._next = minNext;
		};
		const mergeMaps = (entries) => {
			for (let [key, value] of entries) {
				if (isIndex(key)) {
					// Positional maps get merged; positional sets become nested NANOS
					if (this.#mapish(value)) mergeMaps((this.similar(value)).entries());
					else {
						if (this.#setish(value)) value = this.similar(value);
						this.set(undefined, value);
					}
				} else {
					// Named values just get set (promoting transparent containers)
					this.set(key, value);
				}
			}
		};
		const pushInner = (transform === 'sets') ? mergeMaps : pushEntries;
		const pushOuter = (outer) => {
			if (isPlainObject(outer)) pushInner(Object.entries(outer));
			else if (Array.isArray(outer)) pushInner(Object.entries(outer), outer.length);
			else if (outer instanceof NANOS) pushInner(outer.entries(), outer.next);
			else if (!options.opaqueMaps && outer instanceof Map) pushInner(outer.entries());
			else if (!options.opaqueSets && outer instanceof Set) pushInner([...outer.values()].entries());
			else this.set(undefined, outer);
		};
		batch(() => values.forEach(pushOuter));
		return this;
	}

	/**
	 * Redacts values from string output.
	 * NOTE: Only affects value returned by toString().
	 * @param {...(string|number|boolean)} keys
	 * @returns {this}
	 */
	redact (...keys) {
		for (const key of keys) {
			if (key === true) this._redacted = true;
			if (this._redacted === true) return;
			this._redacted ||= {};
			if (isIndex(key)) this._redacted[0] = true;
			else this._redacted[key] = true;
		}
		this._rio?.changed();
		return this;
	}

	/**
	 * Internal method to renumber indices.
	 * @param {number} from
	 * @param {number} to
	 * @param {number} by
	 */
	#renumber (from, to, by) {
		const move = (k, by) => {
			if (Object.hasOwn(this._storage, k)) {
				this._storage[k + by] = this._storage[k];
				delete this._storage[k];
			}
		};

		if (by > 0) {
			if (to + by > this._next) this._next = to + by;
			for (let k = to; --k >= from; ) move(k, by);
		} else if (by < 0) {
			if (to >= this._next) this._next += by;
			for (let k = from; k < to; ++k) move(k, by);
		}
		if (by) this._keys = this._keys.map((key) => {
			const ind = isIndex(key) && parseInt(key, 10);
			if (ind !== false && ind >= from && ind < to) return ind + by + '';
			return key;
		});
	}

	/**
	 * Reverse *in place*.
	 * @returns {this}
	 */
	reverse () {
		if (this._locked) throw new TypeError('NANOS: Cannot "reverse" after locking');
		const s = this._storage, nks = [], ns = {}, last = this._next - 1;
		for (const ok of this._keys.toReversed()) {
			const nk = isIndex(ok) ? String(last - parseInt(ok, 10)) : ok;
			ns[nk] = s[ok];
			nks.push(nk);
		}
		this._storage = ns;
		this._keys = nks;
		this._rio?.changed();
		return this;
	}

	/**
	 * Returns an iterator of [key, value] pairs in reverse (last-to-first key order).
	 * Compact mode uses numeric index keys instead of the standard strings
	 * (e.g. 0 instead of '0').
	 * @param {boolean} [compact=false]
	 * @yields {[string|number, *]}
	 */
	*reverseEntries (opts = {}) {
		opts = this.#getOpts(opts, 'compact');
		this._rio?.depend();
		const storage = this._storage;
		const ik = opts.compact ? ((k) => isIndex(k) ? parseInt(k, 10) : k) : ((k) => k);
		const toFinal = (opts.raw || !this._rio?.get) ? ((v) => v) : ((v) => this.#final(v));
		for (const k of this._keys.toReversed()) yield [ ik(k), toFinal(storage[k]) ];
	}

	/**
	 * Get/set reactive-interface object.
	 * @returns {object|undefined}
	 */
	get rio () { return this._rio; }

	/**
	 * @param {object|undefined} r
	 */
	set rio (r) {
		if (!r) delete this._rio;
		else if ((r?.batch && r.changed && r.create && r.depend)) this._rio = r;
	}

	/**
	 * Sets a key-value pair.
	 * If the key is undefined, the next sequential index is used.
	 * New keys are added in the first (insert true) or last (insert false)
	 * possible position that maintain increasing-index ordering constraints.
	 * @param {string|number} [key]
	 * @param {*} value
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.insert=false] Add to beginning instead of end
	 * @param {boolean} [opts.raw=false] Do not auto-wrap value in a reactive
	 * @returns {*}
	 */
	set (key, value, opts = {}) {
		opts = this.#getOpts(opts, 'insert');
		if (this._locked) throw new TypeError('NANOS: Cannot "set" after locking');
		if (key === undefined) key = this._next;
		key = this.#wrapKey(key);
		if (key === undefined) return;
		const skey = String(key);
		const ind = isIndex(skey) && parseInt(skey, 10);
		let changed = false;

		if (!Object.hasOwn(this._storage, skey)) {
			// The key or index is new; add it in the proper place
			changed = true;
			if (opts.insert) {
				if (ind === false || !this._next) this._keys.unshift(skey);
				else {
					// Earliest placement maintaining ascending index order
					let ki = this._keys.length;
					while (ki > 0 && (!isIndex(this._keys[ki - 1]) || ind < this._keys[ki - 1])) --ki;
					this._keys.splice(ki, 0, skey);
				}
			} else { // append
				if (ind === false || ind >= this._next) this._keys.push(skey);
				else {
					// Latest placement maintaining ascending index order
					let ki = 0;
					while (ki < this._keys.length && (!isIndex(this._keys[ki]) || ind > this._keys[ki])) ++ki;
					this._keys.splice(ki, 0, skey);
				}
			}
			if (ind !== false && ind >= this._next) this._next = ind + 1;
		}

		if (!opts.raw && this._rio?.onSet) value = this._rio.onSet(this, key, value);

		if (this._options.transform && (this.#setish(value) || this.#mapish(value))) {
			// Convert transparent containers to NANOS
			this._storage[skey] = this.similar(value);
		} else {
			this._storage[skey] = value;
		}
		if (this._lockNew) this.lock(skey);
		if (changed) this._rio?.changed();
		return value;
	}
	/**
	 * Set a raw value, bypassing any RIO `onSet` handler.
	 * @param {string|number} [key]
	 * @param {*} value
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.insert=false] Add to beginning instead of end
	 * @returns
	 */
	setRaw (key, value, opts = {}) {
		opts = this.#getOpts(opts, 'insert', { raw: true });
		return this.set(key, value, opts);
	}

	/**
	 * Determine if a value is set-like (value, ...).
	 * @param {*} value
	 * @returns {boolean}
	 */
	#setish (value) {
		return (Array.isArray(value) || (!this._options.opaqueSets && value instanceof Set));
	}

	/**
	 * Set (merge) options
	 * @param {object} options
	 * @returns {this}
	 *
	 * opaqueMaps - Treat Map objects as opaque
	 * opaqueSets - Treat Set objects as opaque
	 * transform - Promote map-ish or set-ish values into nested NANOS objects,
	 *	   or merge them into the containing NANOS object, depending on the setting
	 */
	setOpts (options) {
		Object.assign(this._options, options);
		return this;
	}

	/**
	 * Fluent interface for setting the RIO.
	 * @param {object} r
	 * @returns {this}
	 */
	setRIO (r) {
		this.rio = r;
		return this;
	}

	/**
	 * Like Array.shift (only applies to indexed values).
	 * @param {object} [opts] Options block, passed to delete
	 * @param {boolean} [opts.raw=false] Return the raw, rather than final, shifted value
	 * @returns {*}
	 */
	shift (opts = {}) {
		if (this._locked) throw new TypeError('NANOS: Cannot "shift" after locking');
		if (this._lockInd) throw new TypeError('NANOS: Cannot "shift" after index lock');
		if (!this._next) return undefined;
		const batch = this._rio?.batch || ((cb) => cb());
		return batch(() => {
			const res = this.delete(0, opts);
			this.#renumber(1, this._next, -1);
			return res;
		});
	}

	/**
	 * Size of list (# of keys / indexes).
	 * @returns {number}
	 */
	get size () {
		this._rio?.depend();
		return this._keys.length;
	}

	/**
	 * Return a similarly-configured new NANOS.
	 * @param {...*} items
	 * @returns {NANOS}
	 */
	similar (...items) {
		const nn = new this.constructor();
		nn.setOptions(this._options);
		nn.rio = this._rio?.create();
		if (items.length) nn.push(...items);
		return nn;
	}

	/**
	 * Gets the underlying storage object.
	 * Reactive values will always be raw.
	 * @returns {object}
	 */
	get storage () {
		this._rio?.depend();
		return this._storage;
	}

	/**
	 * Return a (potentially nested) plain Object view of the NANOS.
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.array=false] Use arrays for levels with no named keys
	 * @param {boolean} [opts.raw=false] Return raw values instead
	 * @returns {object}
	 */
	toObject (opts = {}) {
		let isArray = opts?.array, obj = isArray ? [] : Object.create(null);
		for (const key of this._keys) {
			if (isArray && !isIndex(key)) {
				obj = Object.setPrototypeOf(Object.fromEntries(Object.entries(obj)), null);
				isArray = false;
			}
			const value = this.at(key, opts);
			if (value instanceof NANOS) obj[key] = value.toObject(opts);
			else obj[key] = value;
		}
		return obj;
	}

	/**
	 * Returns a reversed shallow copy.
	 * @returns {NANOS}
	 */
	toReversed () {
		this._rio?.depend();
		return this.similar().from(this).reverse();
	}

	/**
	 * Returns a JSON-representable object.
	 * Might be the best we can do.
	 * @returns {{type: string, next: number, pairs: Array<*>}}
	 */
	toJSON () {
		this._rio?.depend();
		return {type:'@NANOS@', next: this._next, pairs: this.pairs(true)};
	}

	/**
	 * Generate SLID (SysCL List Data)-format string.
	 * @param {{compact?: boolean, redact?: boolean}} [options]
	 * @returns {string}
	 */
	toSLID ({ compact = false, redact = false } = {}) {
		this._rio?.depend();
		const escape = (str) => escapeJSString(str).replace(/\)]/g, ')\\]');
		const squished = (items) => {
			const parts = [];
			for (const item of items) {
				const tail = parts.length ? parts.slice(-1).slice(-1) : '';
				const joint = tail + (item[0] || '')/* head */;
				if (tail && !/['"\[\]]/.test(joint)) parts.push(' ');
				parts.push(item);
			}
			return parts.join('');
		};
		const valueToStr = (value) => {
			switch (value) {
			case false: return '@f';
			case null: return '@n';
			case true: return '@t';
			case undefined: return '@u';
			}
			switch (typeof value) {
			case 'bigint': return value.toString() + 'n';
			case 'number': return value.toString();
			case 'string':
				// Word-literal or quoted string
				if (/^[~!#$%^&*()+.,:;<>?A-Z{}_][~!@#$%^&*()+.,0-9:;<>?A-Z{}_-]*$/i.test(value)) return value;
				return "'" + escape(value) + "'";
			}
			if (isPlainObject(value) || Array.isArray(value) || value instanceof Map || value instanceof Set) value = new this.constructor(value);
			if (value instanceof NANOS) return '[' + itemsToStr(value) + ']';
			return '@u/*??*/';
		};
		const itemsToStr = (node) => {
			let expInd = 0;						// Expected next index
			if (redact && node._redacted === true) return ((redact === 'comment') ? '/*???*/' : '');
			const items = [];
			for (const en of node.entries()) {
				if (isIndex(en[0])) {
					if (redact && node.isRedacted(0)) {
						if (redact === 'comment') items.push('/*?*/');
						continue;
					}
					const ind = parseInt(en[0], 10);
					items.push(((ind === expInd) ? '' : `${ind}=`) + valueToStr(en[1]));
					expInd = ind + 1;
				} else {
					if (redact && node.isRedacted(en[0])) {
						if (redact === 'comment') items.push('/*?=?*/');
					} else items.push(valueToStr(en[0]) + '=' + valueToStr(en[1]));
				}
			}
			return (compact ? squished(items) : items.join(' '));
		};
		return '[(' + itemsToStr(this).replace(/\)\]/g, ')\\]') + ')]';
	}

	static toSLID (value, options = {}) {
		if (value instanceof NANOS) return value.toSLID(options);
		else return ((new NANOS(value)).toSLID(options));
	}

	/**
	 * Converts to a string (SLID format).
	 * @param {object} [options]
	 * @returns {string}
	 */
	toString (options = {}) {
		return this.toSLID({ redact: true, ...options });
	}

	/**
	 * Prepends new elements.
	 * Unshift works like push, except that indexed values are offset-from-0
	 * inserted instead (preserving sparseness except for transform sets).
	 * @param {...*} items
	 * @returns {this}
	 */
	unshift (...values) {
		if (this._locked) throw new TypeError('NANOS: Cannot "unshift" after locking');
		if (this._lockInd) throw new TypeError('NANOS: Cannot "unshift" after index lock');
		const batch = this._rio?.batch || ((cb) => cb());
		batch(() => values.toReversed().forEach((outer) => {
			if (!(outer instanceof NANOS)) outer = this.similar(outer);
			this.#renumber(0, this._next, outer.next);
			this.fromEntries(outer.entries(), true);
		}));
		return this;
	}

	/**
	 * Return a (sparse) iterator of *indexed* values.
	 * @param {object} [opts] Options object
	 * @param {boolean} [opts.raw] Yields raw, rather than final, reactive values
	 * @yields {*}
	 */
	*values (opts = {}) {
		this._rio?.depend();
		const toFinal = (opts.raw || !this._rio?.get) ? ((v) => v) : ((v) => this.#final(v));
		for (const index of this.indexKeys()) yield toFinal(this.atRaw(index));
	}

	/**
	 * Internal method to handle negative indices.
	 * @param {string|number} key
	 * @returns {string|number|undefined}
	 */
	#wrapKey (key) {
		if (isNegIndex(key)) {
			key = parseInt(key, 10) + this._next;
			if (key < 0) return;
		}
		return key;
	}
}

// Alias .get() to .at()
NANOS.prototype.get = NANOS.prototype.at;
// Alias .setOpts() to .setOptions()
NANOS.prototype.setOptions = NANOS.prototype.setOpts;

// Make parseQJSON and parseSLID directly importable
export const { parseQJSON, parseSLID, toSLID } = NANOS;
export { NANOS as default };

// END
