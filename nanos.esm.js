/*
 * NANOS - Named and numbered ordered storage
 * Copyright 2024-2025 by Kappa Computer Solutions, LLC and Brian Katzung
 * Author: Brian Katzung <briank@kappacs.com>
 */

import { escapeJSString, unescapeJSString } from 'syscl/escape.esm.js';

export const isIndex = key => /^(?:0|[1-9]\d*)$/.test(key);
export const isNegIndex = key => /^-[1-9]\d*$/.test(key);

export class NANOS {
    constructor (...items) {
	this.clear();
	this.push(...items);
    }

    // Get value at key or index (negative index relative to end)
    at (key, defVal) {
	this._rio?.depend();
	key = this.#wrapKey(key);
	return Object.hasOwn(this._storage, key) ? this._storage[key] : defVal;
    }

    get autoPromote () { return this._autoPromote; }

    set autoPromote (v) { this._autoPromote = v; }

    clear () {
	if (this._locked) throw new TypeError('NANOS: Cannot clear after locking');
	this._next = 0;
	this._keys = [];
	this._storage = {};
	this._lockInd = undefined;
	delete this._redacted;
	this._rio?.changed();
	return this;
    }

    // NOTE: unlike the delete statement, this returns the deleted value!
    delete (key) {
	if (this._locked) throw new TypeError('NANOS: Cannot delete after locking');
	const skey = '' + key;
	const ret = this._storage[skey];
	if (Object.hasOwn(this._storage, skey)) {
	    delete this._storage[skey];
	    this._keys = this._keys.filter(k => k !== skey);
	    this._rio?.changed();
	}
	return ret;
    }

    depend () { this._rio?.depend(); }

    /*
     * Returns [ [ key1, value1 ], ... [ keyN, valueN ] ]
     * Compact mode uses numeric index keys instead of the standard strings
     * (e.g. 0 instead of '0').
     */
    *entries (compact = false) {
	this._rio?.depend();
	const ik = compact ? (k => isIndex(k) ? parseInt(k, 10) : k) : (k => k);
	for (const k of this._keys) yield [ ik(k), this._storage[k] ];
    }

    // Returns a shallow copy of elements for which f(value, key) is true
    filter (f) {
	this._rio?.depend();
	return new NANOS.fromEntries([...this.entries()].filter(kv => f(kv[1], kv[0], this)));
    }

    // Returns first [key, value] where f(value, key) is true; cf find, findIndex
    find (f) {
	this._rio?.depend();
	const s = this._storage;
	for (const k of this._keys) if (f(s[k], k, this)) return [k, s[k]];
    }

    // Returns last [key, value] where f(value, key) is true; cf findLast, findLastIndex
    findLast (f) {
	this._rio?.depend();
	const s = this._storage;
	for (const k of this._keys.toReversed()) if (f(s[k], k, this)) return [k, s[k]];
    }

    forEach (f) {
	this._rio?.depend();
	for (const k of this._keys) f(this._storage[k], k, this);
    }

    // [ [ key1, value1 ], ... [ keyN, valueN ] ]
    fromEntries (entries, insert = false) {
	if (this._locked) throw new TypeError('NANOS: Cannot fromEntries after locking');
	if (insert && this._lockInd) throw new TypeError('NANOS: Cannot insert fromEntries after index lock');
	const batch = this._rio?.batch || (cb => cb());
	batch(() => {
	    if (insert) for (const e of [...entries].reverse()) this.set(e[0], e[1], true);
	    else for (const e of entries) this.set(e[0], e[1]);
	    this._rio?.changed();
	});
	return this;
    }

    /*
     * [ key1, value1, ... keyN, valueN ]
     * { type: '@NANOS@', next, pairs }
     */
    fromPairs (...pairs) {
	if (this._locked) throw new TypeError('NANOS: Cannot fromPairs after locking');
	const batch = this._rio?.batch || (cb => cb());
	if (pairs[0]?.type === '@NANOS@') {
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

    // Instead of "key in NANOS"
    has (key) {
	this._rio?.depend();
	return Object.hasOwn(this._storage, this.#wrapKey(key));
    }

    includes (value) {
	return this.keyOf(value) !== undefined;
    }

    // Just the index entries
    *indexEntries (compact = false) {
	for (const e of this.entries(compact)) if (isIndex(e[0])) yield e;
    }

    // Just the index keys
    *indexKeys () {
	this._rio?.depend();
	for (const k of this._keys) if (isIndex(k)) yield k;
    }

    // Is a key/value (or, if undef, the key-set) locked?
    isLocked (key) {
	this._rio?.depend();
	if (key === undefined) return this._locked;	// Key-set locked
	key = this.#wrapKey(key);
	if (this._locked && !Object.hasOwn(this._storage, key)) return true;
	return !Object.getOwnPropertyDescriptor(this._storage, key)?.writable;
    }

    // Is a key/value redacted?
    isRedacted (key) {
	this._rio?.depend();
	if (this._redacted === true) return true;
	key = this.#wrapKey(key);
	if (isIndex(key)) return this._redacted?.[0];
	return this._redacted?.[key];
    }

    // Returns first key/index with matching value, or undefined; cf indexOf
    keyOf (value) { return this.find(v => v === value)?.[0]; }

    // keys iterator
    keys () {
	this._rio?.depend();
	return this._keys.values();
    }

    // Returns last key/index with matchien value, or undefined; cf lastIndexOf
    lastKeyOf (value) {
	return this.findLast(v => v === value)?.[0];
    }

    // Lock specific *values* by key (doesn't affect key addition/removal)
    lock (...keys) {
	if (typeof keys[0] === 'object') key = keys[0];
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

    // Lock all current (and possibly new) *values* (doesn't affect keys)
    lockAll (andNew = false) {
	if (andNew) this._lockNew = true;
	this.lock(this._keys.values());
	return this;
    }

    // Lock the *key* set (unlocked values can still change)
    lockKeys () {
	this._locked = true;
	this._rio?.changed();
	return this;
    }

    // Just the named entries
    *namedEntries () {
	for (const e of this.entries()) if (!isIndex(e[0])) yield e;
    }

    // Just the named keys
    *namedKeys () {
	for (const e of this.entries()) if (!isIndex(e[0])) yield e[0];
    }

    // "Next" index (max index + 1); similar to array.length
    get next () {
	this._rio?.depend();
	return this._next;
    }
    set next (nn) {
	if (this._locked) throw new TypeError('NANOS: Cannot set next after locking');
	if (!Number.isInteger(nn) || nn < 0) return;
	for (let i = this._next; --i >= nn; this.delete(i));
	if (this._next !== nn) {
	    this._next = nn;
	    this._rio?.changed();
	}
    }

    pairs (compact = false) {
	return [...this.entries(compact)].flat(1);
    }

    // Like Array.pop (only applies to indexed values)
    pop () {
	if (this._locked) throw new TypeError('NANOS: Cannot pop after locking');
	if (this._lockInd) throw new TypeError('NANOS: Cannot pop after index lock');
	if (!this._next) return undefined;
	return this.delete(--this._next);
    }

    /*
     * When pushing an object (array, NANOS, object), named keys are set
     * directly and index keys are appended as an offset from _next
     * (therefore preserving any gaps).
     * Push [ object ] to add the actual object itself.
     */
    push (...items) {
	if (this._locked) throw new TypeError('NANOS: Cannot push after locking');
	const batch = this._rio?.batch || (cb => cb());
	batch(() => items.forEach(value => {
	    const base = this._next;
	    if (value instanceof NANOS) {
		for (const e of value.entries()) {
		    if (isIndex(e[0])) this.set(base + parseInt(e[0], 10), e[1]);
		    else this.set(e[0], e[1]);
		}
	    } else if (typeof value === 'object') {
		for (const k of Object.keys(value)) {
		    if (isIndex(k)) this.set(base + parseInt(k, 10), value[k]);
		    else this.set(k, value[k]);
		}
	    } else this.set(this._next, value);
	}));
	return this;
    }

    // NOTE: Only affects value returned by toString()
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
	if (by) this._keys = this._keys.map(key => {
	    const ind = isIndex(key) && parseInt(key, 10);
	    if (ind !== false && ind >= from && ind < to) return ind + by + '';
	    return key;
	});
    }

    // Reverse *in place*
    reverse () {
	if (this._locked) throw new TypeError('NANOS: Cannot reverse after locking');
	const s = this._storage, nks = [], ns = {}, last = this._next - 1;
	for (const ok of this._keys.toReversed()) {
	    const nk = isIndex(ok) ? (last - ok) : ok;
	    ns[nk] = s[ok];
	    nks.push(nk);
	}
	this._storage = ns;
	this._keys = nks;
	this._rio?.changed();
	return this;
    }

    // Get/set reactive-interface object
    get rio () { return this._rio; }

    set rio (r) {
	if (!r) delete this._rio;
	else if ((r?.batch && r.changed && r.create && r.depend)) this._rio = r;
    }

    /*
     * If the key is undefined, the next sequential index is used.
     * New keys are added in the first (insert true) or last (insert false)
     * possible position that maintain increasing-index ordering constraints.
     */
    set (key, value, insert = false) {
	if (this._locked) throw new TypeError('NANOS: Cannot set after locking');
	if (key === undefined) key = this._next;
	key = this.#wrapKey(key);
	if (key === undefined) return;
	const skey = '' + key;
	const ind = isIndex(skey) && parseInt(skey, 10);
	let changed = false;
	if (!Object.hasOwn(this._storage, skey)) {
	    changed = true;
	    if (insert) {
		if (ind === false || !this._next) this._keys.unshift(skey);
		else {
		    let ki = this._keys.length;
		    while (ki > 0 && (!isIndex(this._keys[ki - 1]) || ind < this._keys[ki - 1])) --ki;
		    this._keys.splice(ki, 0, skey);
		}
	    } else { // append
		if (ind === false || ind >= this._next) this._keys.push(skey);
		else {
		    let ki = 0;
		    while (ki < this._keys.length && (!isIndex(this._keys[ki]) || ind > this._keys[ki])) ++ki;
		    this._keys.splice(ki, 0, skey);
		}
	    }
	    if (ind !== false && ind >= this._next) this._next = ind + 1;
	}
	if (typeof value === 'object' && this._autoPromote && value !== null) {
	    switch (value?.constructor?.name) {
	    case undefined:
	    case 'Array':
	    case 'Object':
		this._storage[skey] = this.similar(value);
		break;
	    default:
		this._storage[skey] = value;
		break;
	    }
	} else this._storage[skey] = value;
	if (this._lockNew) this.lock(skey);
	if (changed) this._rio?.changed();
	return value;
    }

    setAutoPromote (v) {
	this._autoPromote = v;
	return this;
    }

    setRIO (r) {
	this.rio = r;
	return this;
    }

    // Like Array.shift (only applies to indexed values)
    shift () {
	if (this._locked) throw new TypeError('NANOS: Cannot shift after locking');
	if (this._lockInd) throw new TypeError('NANOS: Cannot shift after index lock');
	if (!this._next) return undefined;
	const batch = this._rio?.batch || (cb => cb());
	return batch(() => {
	    const res = this.delete(0);
	    this.#renumber(1, this._next, -1);
	    return res;
	});
    }

    // Size of list (# of keys / indexes)
    get size () {
	this._rio?.depend();
	return this._keys.length;
    }

    // Return a similarly-configured new NANOS
    similar (...items) {
	const nn = new NANOS();
	if (this._autoPromote) nn.autoPromote = true;
	nn.rio = this._rio?.create();
	if (items.length) nn.push(...items);
	return nn;
    }

    get storage () {
	this._rio?.depend();
	return this._storage;
    }

    toReversed () {
	this._rio?.depend();
	return this.similar().fromPairs(this.toJSON()).reverse();
    }

    // Might be the best we can do
    toJSON () {
	this._rio?.depend();
	return {type:'@NANOS@', next: this._next, pairs: this.pairs(true)};
    }

    // Generate SLID (SysCL List Data)-format string
    toSLID ({ compact = false, redact = false } = {}) {
	this._rio?.depend();
	const escape = str => escapeJSString(str).replace(/\)]/g, ')\\]');
	function squished (items) {
	    const parts = [];
	    for (const item of items) {
		const tail = parts.length ? parts.slice(-1).slice(-1) : '';
		const joint = tail + (item[0] || '')/* head */;
		if (tail && !/['"\[\]]/.test(joint)) parts.push(' ');
		parts.push(item);
	    }
	    return parts.join('');
	}
	function valueToStr (value) {
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
		if (/^[!()*.,:;<>?A-Z{}_][!()*.,0-9:;<>?@A-Z{}_-]*$/i.test(value)) return value;
		return "'" + escape(value) + "'";
	    }
	    if (value instanceof NANOS) return '[' + itemsToStr(value) + ']';
	    return '@u/*??*/';
	};
	function itemsToStr (node) {
	    let expInd = 0;			// Expected next index
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

    toString (options = {}) {
	return this.toSLID({ redact: true, ...options });
    }

    /*
     * Unshift works like push, except that indexed values are offset-from-0
     * inserted instead (therefore preserving any gaps).
     */
    unshift (...items) {
	if (this._locked) throw new TypeError('NANOS: Cannot unshift after locking');
	if (this._lockInd) throw new TypeError('NANOS: Cannot unshift after index lock');
	const batch = this._rio?.batch || (cb => cb());
	batch(() => items.toReversed().forEach(value => {
	    if (value instanceof NANOS) {
		this.#renumber(0, this._next, value.next);
		this.fromEntries(value.entries(), true);
	    } else if (typeof value === 'object') {
		const next = Array.isArray(value) ? value.length : Object.keys(value).filter(k => isIndex(k)).reduce((acc, cur) => Math.max(acc, cur), -1) + 1;
		this.#renumber(0, this._next, next);
		this.fromEntries(Object.entries(value), true);
	    } else this.unshift([value]);
	}));
	return this;
    }

    // Return a (non-sparse) iterator of *indexed* values [0.._next-1]
    *values () {
	this._rio?.depend();
	for (let i = 0; i < this._next; ++i) yield this.at(i);
    }

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

export { NANOS as default };

//////////////////////////////////////////////////////////////////////
// SLID Parsing Section
//////////////////////////////////////////////////////////////////////

// SysCL List Data lexical token regexps
const slidPats = {
    mlc: '/\\*.*?\\*/',		// Multi-line comment
    num: '[+-]?(?:0[bBoOxX])?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+|n)?(?![0-9a-zA-Z])',
    sqs: "'(?:\\\\'|[^'])*'",	// Single-quoted string
    dqs: '"(?:\\\\"|[^"])*"',	// Double-quoted string
    stok: '[[=\\]]',		// Special tokens
    spc: '\\s+',		// Space
    oth: '[^\'"/[=\\]\\s]+',	// Other
};
const slidRE = new RegExp('(' + 'mlc num sqs dqs stok spc oth'.split(' ').map(k => slidPats[k]).join('|') + ')', 's');
const slidNum = new RegExp('^' + slidPats.num + '$');

// Parse SLID-format data, returning (potentially nested) NANOS
export function parseSLID (str, qj = false) {
    let match = str.match(/\[\((.*?)\)\]/s);
    if (!match) throw new SyntaxError('SLID boundary marker(s) not found');
    const tokens = match[1].replace(/\)\\\]/g, ')]').split(slidRE).filter(t => !/^(\s*|\/\*.*\*\/)$/.test(t));
    match = undefined;
    const parseLeft = () => {	// Can be left of = (numbers, strings)
	const token = tokens.shift();
	if (slidNum.test(token)) {
	    if (/n$/i.test(token)) return BigInt(token.slice(0, -1));
	    if (/^[+-]?0b/i.test(token)) return parseInt(token.replace(/0b/i, ''), 2);
	    if (/^[+-]?0o/i.test(token)) return parseInt(token.replace(/0o/i, ''), 8);
	    if (/^[+-]?0x/i.test(token)) return parseInt(token.replace(/0x/i, ''), 16);
	    return parseFloat(token);
	}
	if (token[0] !== "'" && token[0] !== '"') return token;
	return unescapeJSString(token.slice(1, -1));
    }
    const parseRight = () => {	// More that can be right of =
	if (tokens[0] !== '[') {
	    if (!qj) switch (tokens[0]) {// Special values
	    case '@f': tokens.shift(); return false;
	    case '@n': tokens.shift(); return null;
	    case '@t': tokens.shift(); return true;
	    case '@u': tokens.shift(); return undefined;
	    }
	    return parseLeft();	// Everything OK on the left
	}
	tokens.shift();
	return parseItems();	// Nested lists
    }
    function parseItems () {
	const result = new NANOS();
	while (tokens.length && tokens[0] !== ']') {
	    let key;			// Default: positional
	    if (tokens[1] === '=') {	// Named value
		key = parseLeft();
		tokens.shift();
	    } else if (!qj && tokens[0] === '@e') {	// Empty
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

// Parse relaxed, "quasi-JSON" (by way of SLID)
const qjMap = { '{': '[', '}': ']', ',': ' ', ':': '=' };
export function parseQJSON (str) {
    return parseSLID('[(' + str.replaceAll(/^\s*[\[\{]?|[\]\}]\s*$/g, '')
      .split(/("(?:\\\\"|[^"])*")/)
      .map(s => (s[0] === '"') ? s : s.replace(/[{},:]/g, c => qjMap[c]))
      .join('') + ')]', true);
}

// END
