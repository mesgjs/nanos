# NANOS Performance Optimization Opportunities

This document catalogues performance improvement opportunities identified after the
SLID optimization pass (see `arch/SLID-optimization.md`). All six issues from that
earlier pass are already implemented in the current source.

---

## High Impact

### 1. Replace `_storage` plain object with `Map`

**Affected:** `clear()`, `set()`, `delete()`, `has()`, `at()`, `#renumber()`,
`lock()`, `freeze()`, `isLocked()`, `storage` getter

**Problem:**  
`_storage = {}` is a plain JS object. Every key lookup goes through the engine's
property-lookup machinery (prototype-chain check, `Object.hasOwn()` call). More
critically, V8 de-optimizes ("dictionary-mode") objects that have had many `delete`
operations applied to them — exactly the pattern used by `shift()`, `pop()`, and
`next =` truncation. A `Map` has O(1) hash-table semantics with no prototype chain
and no hidden-class invalidation on mutation.

**Blocker:**  
The locking subsystem uses `Object.defineProperty(this._storage, key, { writable: false })`
to make individual values immutable, and `Object.freeze(this._storage)` for full
freeze. Neither mechanism works on a `Map`.

**Fix:**  
Replace `_storage` with a `Map`. Replace the `Object.defineProperty` locking
mechanism with a separate `_lockedKeys: Set<string>` that tracks locked keys.
Replace `Object.freeze(this._storage)` with a `_frozen: boolean` flag checked in
`set()` and `delete()`. Update `isLocked()` to check `_lockedKeys` instead of
`Object.getOwnPropertyDescriptor`.

```js
// clear()
this._storage = new Map();

// has()
return this._storage.has(skey);

// at()
if (this._storage.has(skey)) {
    let ret = this._storage.get(skey);
    ...
}

// set()
if (!this._storage.has(skey)) { ... }
this._storage.set(skey, value);

// delete()
if (this._storage.has(skey)) {
    this._storage.delete(skey);
    ...
}

// lock() — instead of Object.defineProperty
this._lockedKeys ??= new Set();
this._lockedKeys.add(skey);

// isLocked()
if (key === undefined) return !!this._locked;
return this._lockedKeys?.has(skey) ?? false;

// freeze()
this._frozen = true;
// (no Object.freeze on the Map itself)
```

**Note:** The public `storage` getter currently exposes `_storage` directly. If
`_storage` becomes a `Map`, callers using `nanos.storage['key']` would break.
The getter could return a `Proxy` or a plain-object snapshot, or the API could be
documented as returning a `Map`.

FEEDBACK: This is a complex change with significant consequences. Let's defer this one for now.

---

### 2. `delete()` — replace `Array.filter()` with `indexOf` + `splice`

**Affected:** `delete()` line 161

**Problem:**  
```js
this._keys = this._keys.filter((k) => k !== skey);
```
`Array.filter()` allocates a new array and scans every element on every delete.
For workloads that delete many keys (e.g. `shift()` in a loop, `next =`
truncation), this is O(n) per call with a fresh allocation each time.

**Fix:**  
```js
const ki = this._keys.indexOf(skey);
if (ki !== -1) this._keys.splice(ki, 1);
```
`splice` is in-place (no new array), and `indexOf` stops at the first match.

FEEDBACK: Approved

---

### 3. `set()` — insertion hint cache for `unshift`/`#renumber` patterns

**Affected:** `set()` lines 904–915

**Problem:**
When inserting an index that is not at the natural end (e.g. inserting index `3`
into `[0,1,2,5,6]`), the code does a linear scan of `_keys` to find the correct
position:

```js
let ki = 0;
while (ki < this._keys.length && (!isIndex(this._keys[ki]) || ind > this._keys[ki])) ++ki;
this._keys.splice(ki, 0, skey);
```

For large NANOS instances with many numeric indices this is O(n). The primary
callers of this out-of-order path are `unshift` (via `fromEntries(..., true)`) and
`#renumber`. Both insert entries sequentially near the same position — `unshift`
inserts all entries near the front, `#renumber` shifts a contiguous range.

**Binary search vs. insertion hint cache:**
Binary search reduces a single insertion from O(n) to O(log n), but `unshift` of
an n-element NANOS still does n insertions → O(n log n) total.

An **insertion hint cache** — storing the last `[ki, ind]` pair used — makes
*sequential* insertions O(1) amortized: if the new `ind` is adjacent to the cached
position, the scan starts there instead of from the beginning. For `unshift` and
`#renumber` (which insert in order), this degenerates to a single comparison per
insertion → O(n) total, better than binary search.

**Fix:**
Add a transient `_insertHint` property (cleared on any structural change that
invalidates it):

```js
// In set(), append mode out-of-order path:
let ki;
const hint = this._insertHint;
if (hint && isIndex(this._keys[hint.ki]) && ind >= parseInt(this._keys[hint.ki], 10)) {
    ki = hint.ki;  // resume from last position
} else {
    ki = 0;
}
while (ki < this._keys.length && (!isIndex(this._keys[ki]) || ind > parseInt(this._keys[ki], 10))) ++ki;
this._insertHint = { ki };
this._keys.splice(ki, 0, skey);
```

The hint is invalidated (set to `undefined`) in `delete()`, `clear()`, and
`#renumber()`.

FEEDBACK: Out-of-order insertion should be quite rare, except for unshift/#renumber. What's likely to be more efficient for these cases, binary search, or caching the last [key, index] information?

ANALYSIS: An insertion hint cache is better suited to the actual access pattern.
`unshift` and `#renumber` insert sequentially, so the hint degenerates to O(1) per
insertion (O(n) total), whereas binary search gives O(log n) per insertion
(O(n log n) total). For the rare truly-random out-of-order case, binary search
would win, but that case is uncommon enough that the hint cache is the better
default choice.

---

## Medium Impact

### 4. `#getOpts` — eliminate allocation on the no-options hot path

**Affected:** `#getOpts()` line 350–353, all ~15 public method signatures

**Problem:**  
Every public method defaults to `opts = {}`, so `#getOpts` always receives a plain
object and always executes the spread:

```js
#getOpts (optParam, defKey, defOpts = {}) {
    const optObj = isPlainObject(optParam) ? optParam : { [defKey]: optParam };
    return { ...defOpts, ...optObj };   // always allocates
}
```

The spread allocates a new object on every call to `at`, `set`, `entries`, `find`,
`forEach`, etc. — even when the caller passes no options at all.

**Fix:**  
Change every public method default from `opts = {}` to `opts = undefined`. Then
`#getOpts` can short-circuit for the common case:

```js
#getOpts (optParam, defKey, defOpts = OPTS_EMPTY) {
    if (optParam === undefined) return defOpts;   // zero allocation
    const optObj = isPlainObject(optParam) ? optParam : { [defKey]: optParam };
    return { ...defOpts, ...optObj };
}
```

Hoist the common `defOpts` sentinels to module-level constants (allocated once):

```js
const OPTS_EMPTY  = {};
const OPTS_RAW    = { raw: true };
```

**Cost comparison:**

| Scenario | Current | After fix |
|---|---|---|
| `method()` — no opts | `{}` at call site + spread in `#getOpts` | `undefined` → `return OPTS_EMPTY` — zero allocations |
| `method({ raw: true })` | spread in `#getOpts` | spread in `#getOpts` — identical |
| `method(true)` (legacy scalar) | `{ [defKey]: true }` + spread | `{ [defKey]: true }` + spread — identical |

**Note:** Pass-through sites like `atRaw()` and `setRaw()` are safe because the
receiving method calls `#getOpts` on its own parameter.

FEEDBACK: Approved

---

### 5. `isIndex()` — add numeric fast-path before regex

**Affected:** `isIndex()` line 38, called on every key in `set`, `entries`,
`#renumber`, `toSLID`, etc.

**Problem:**  
```js
export const isIndex = (key) => /^(?:0|[1-9]\d*)$/.test(key);
```
The regex is compiled once (module level), but `String.test()` still has overhead
for the common case where `key` is already a non-negative integer.

**Fix:**  
```js
export const isIndex = (key) => {
    if (typeof key === 'number') return Number.isInteger(key) && key >= 0;
    return /^(?:0|[1-9]\d*)$/.test(String(key));
};
```

FEEDBACK: Approved

---

### 6. `toSLID` compact mode — single-pass string builder

**Affected:** `squished()` lines 1098–1109, `itemsToStr()` lines 1172–1206

**Problem:**  
In compact mode, `itemsToStr` builds an `items[]` array of strings, then passes it
to `squished()` which builds a second `parts[]` array and joins. That is two full
array passes and two `join('')` calls per NANOS node.

**Fix:**  
Merge the two passes: instead of collecting items into an array and then squishing,
maintain a running `result` string and append each item directly with the
appropriate separator:

```js
// Sketch — replaces the items[] array + squished() call
let result = '';
for (const item of ...) {
    if (result) {
        const joint = result[result.length - 1] + (item[0] || '');
        if (!/['"\[\]]/.test(joint)) result += ' ';
    }
    result += item;
}
```

FEEDBACK: The goal of the array was to avoid frequent string reallocation, but presumably the squishing could be "inlined", rather than a separate pass.

ANALYSIS: Agreed. The `items[]` array is retained — it avoids O(n²) string
concatenation. The fix is to inline the squishing logic *into* `itemsToStr` so
that the separator decision is made as each item is appended to `items[]`, rather
than in a second pass over a `parts[]` array. `squished()` as a separate function
is eliminated; `itemsToStr` builds `items[]` and joins once.

---

### 7. Store index keys as numbers internally in `_keys`

**Affected:** `_keys` array throughout; `#renumber()`, `set()`, `delete()`,
`entries()`, `reverseEntries()`, `indexKeys()`, `isIndex()` call sites,
`toSLID`/`itemsToStr`, `#wrapKey`, `isLocked`, `isRedacted`

**Problem:**
Every index key is stored as a string (`'0'`, `'1'`, etc.) in `_keys`. This means:
- `isIndex(k)` runs a regex on a string for every key in every iteration
- `parseInt(k, 10)` is called repeatedly in `#renumber`, `set`, `toSLID`, etc.
- `#renumber` does string arithmetic: `ind + by + ''`
- The `map()` in `#renumber` allocates a new array (the original issue)

**Fix:**
Store numeric index keys as `number` in `_keys`; named keys remain `string`.
`isIndex(k)` becomes `typeof k === 'number'` — no regex, no parse. All internal
arithmetic on index keys operates on numbers directly. The user-facing boundary
(where string keys are accepted and returned) is already handled by `#wrapKey` and
`String(key)` in `set()`/`delete()`.

```js
// _keys stores: number for index keys, string for named keys
// isIndex check becomes:
const isIndexKey = (k) => typeof k === 'number';

// #renumber — in-place, no allocation, no parseInt:
for (let i = 0; i < this._keys.length; i++) {
    const k = this._keys[i];
    if (typeof k === 'number' && k >= from && k < to) this._keys[i] = k + by;
}

// set() — store number, not string, for index keys:
if (ind !== false) this._keys.push(ind);   // number, not skey

// entries() — compact mode already converts to number; non-compact now needs String():
const ik = opts.compact ? ((k) => k) : ((k) => typeof k === 'number' ? String(k) : k);
```

**Scope:**
This is a moderate refactor touching ~20 sites, but each change is mechanical.
The public API is unaffected — `keys()`, `entries()`, etc. still return string
keys for indices (or numbers in compact mode, as today). The `_keys` array type
changes from `Array<string>` to `Array<string|number>`.

**Note:** This subsumes the original `#renumber map() → for loop` fix — once index
keys are numbers, the in-place loop is trivially correct and no `parseInt` is needed.

FEEDBACK: It seems like it might be more efficient to store index keys as numbers internally (testable with typeof === 'number'), and only deal with index strings at the user interface.

ANALYSIS: Agreed. Storing index keys as numbers eliminates `isIndex` regex calls,
`parseInt` calls, and string-number conversions throughout the hot paths. The
`#renumber map() → for loop` fix is subsumed by this change.

---

### 8. `values()` — eliminate double indirection

**Affected:** `values()` lines 1249–1253

**Problem:**  
```js
for (const index of this.indexKeys()) yield toFinal(this.atRaw(index));
```
`indexKeys()` is a generator that calls `this._rio?.depend()` and iterates `_keys`.
Then `atRaw()` → `at()` → `#getOpts` + `#wrapKey` + `Object.hasOwn` — all for a
key that was just retrieved from `_keys`.

**Fix:**  
```js
*values (opts = undefined) {
    this._rio?.depend();
    const toFinal = (opts?.raw || !this._rio?.get) ? ((v) => v) : ((v) => this.#final(v));
    const storage = this._storage;
    for (const k of this._keys) {
        if (isIndex(k)) yield toFinal(storage[k]);
    }
}
```

FEEDBACK: Approved

---

## Low / Trivial

### 9. `parseLeft()` — replace sequential regex tests with character switch

**Affected:** `parseLeft()` lines 602–606

**Problem:**  
After `slidNum.test(token)` confirms a token is a number, three more regexes run
sequentially to detect BigInt, binary, octal, and hex:

```js
if (/n$/i.test(token)) return BigInt(token.slice(0, -1));
if (/^[+-]?0b/i.test(token)) return parseInt(token.replace(/0b/i, ''), 2);
if (/^[+-]?0o/i.test(token)) return parseInt(token.replace(/0o/i, ''), 8);
if (/^[+-]?0x/i.test(token)) return parseInt(token.replace(/0x/i, ''), 16);
return parseFloat(token);
```

**Fix:**  
Use a `switch` on the prefix character(s) to avoid regex overhead for the common
decimal case:

```js
const last = token[token.length - 1];
if (last === 'n' || last === 'N') return BigInt(token.slice(0, -1));
const start = (token[0] === '+' || token[0] === '-') ? 1 : 0;
if (token[start] === '0' && token.length > start + 1) {
    switch (token[start + 1].toLowerCase()) {
    case 'b': return parseInt(token.slice(start + 2), 2) * (start ? -1 : 1);
    case 'o': return parseInt(token.slice(start + 2), 8) * (start ? -1 : 1);
    case 'x': return parseInt(token.slice(start + 2), 16) * (start ? -1 : 1);
    }
}
return parseFloat(token);
```

FEEDBACK: Approved

---

### 10. `valueToStr` — hoist word-literal regex to module scope

**Affected:** `valueToStr()` line 1165 (inside `toSLID`)

**Problem:**  
The word-literal regex is defined inside the `toSLID` closure, so it is
re-created on every `toSLID()` call:

```js
if (/^[~!#$%^&*()+.,:;<>/?A-Z{}_][~!@#$%^&*()+.,0-9:;<>/?A-Z{}_-]*$/i.test(value) && ...)
```

**Fix:**  
Hoist to module scope alongside `slidLexRE`:

```js
const slidWordRE = /^[~!#$%^&*()+.,:;<>/?A-Z{}_][~!@#$%^&*()+.,0-9:;<>/?A-Z{}_-]*$/i;
```

FEEDBACK: Approved

---

### 11. `itemsToStr_set` — remove dead `expInd` counter

**Affected:** `itemsToStr_set()` lines 1144–1151

**Problem:**  
`expInd` is incremented on every iteration but never read:

```js
let expInd = 0;
for (const v of set) {
    items.push(valueToStr(v));
    ++expInd;   // never used
}
```

**Fix:** Remove `expInd` entirely.

FEEDBACK: Approved

---

## Summary Table

| # | Issue | Location | Severity | Status | Fix |
|---|---|---|---|---|---|
| 1 | `_storage` plain object vs `Map` | `clear`, `set`, `delete`, `has` | **High** | Deferred | Replace with `Map`; refactor locking to use `_lockedKeys: Set` + `_frozen` flag |
| 2 | `delete()` uses `filter()` on `_keys` | `delete():161` | **High** | ✅ Approved | `indexOf` + `splice` in-place |
| 3 | `set()` linear scan for index insertion | `set():904` | **High** | ✅ Approved | Insertion hint cache (O(1) amortized for sequential patterns) |
| 4 | `#getOpts` spreads on every call | `#getOpts():352` | Medium | ✅ Approved | `opts = undefined` default; fast-path `if (optParam === undefined) return defOpts` |
| 5 | `isIndex` numeric fast-path missing | `isIndex():38` | Medium | ✅ Approved | Check `typeof key === 'number'` first |
| 6 | `squished` + `itemsToStr` two-pass | `squished():1098` | Medium | ✅ Approved | Inline squishing into `itemsToStr` — single pass, single array |
| 7 | Index keys stored as strings in `_keys` | `_keys` throughout | Medium | ✅ Approved | Store index keys as `number`; named keys remain `string` |
| 8 | `values()` double-indirects | `values():1252` | Medium | ✅ Approved | Direct `_keys` loop with `isIndex` check |
| 9 | `parseLeft` sequential regex for bases | `parseLeft():602` | Low | ✅ Approved | `switch` on prefix character |
| 10 | `valueToStr` word-literal regex inline | `valueToStr():1165` | Low | ✅ Approved | Hoist to module scope as `slidWordRE` |
| 11 | Dead `expInd` in `itemsToStr_set` | `itemsToStr_set():1145` | Trivial | ✅ Approved | Remove |
