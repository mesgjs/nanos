# SLID Performance Analysis & Optimization Opportunities

Benchmarks show `JSON.parse` + `JSON.stringify` (native C++) is ~8.8× faster than
`parseSLID` + `toSLID({ compact: true })` (pure JS). This document analyses why,
identifies specific inefficiencies, and estimates the improvement potential.

---

## Why the Gap Exists (Structural Reasons)

JSON's native implementation is compiled C++ that operates on a flat byte stream.
SLID is pure JS that:

1. Builds a `NANOS` object (two parallel data structures: `_keys[]` + `_storage{}`)
   instead of a plain `Array`/`Object`.
2. Supports a richer type system (BigInt, `undefined`, sparse indices, named+indexed
   keys, `@e` holes, etc.).
3. Has a more complex tokenizer (8 alternation branches in the regex).
4. Produces a more complex output format (compact squishing, redaction, escape
   sequences, `)]` escaping).

A realistic floor for pure-JS serialization of equivalent data is probably 3–5×
slower than native JSON. The remaining gap is implementation overhead.

---

## Specific Inefficiencies Found

### 1. `parseSLID`: `tokens.shift()` is O(n) per token — **most impactful**

```javascript
// src/nanos.esm.js:584
const token = tokens.shift();
```

`Array.shift()` re-indexes the entire array on every call. For a document with *n*
tokens this is **O(n²)** total. Using an integer cursor (`let pos = 0; tokens[pos++]`)
would make it O(n). This is the single biggest fixable bottleneck.

### 2. `parseSLID`: Tokenizer uses `split` + `filter` — two full passes, many allocations

```javascript
// src/nanos.esm.js:581
const tokens = match[1].replace(/\)\\\]/g, ')]').split(slidRE).filter((t) => !/^(\s*|\/\*.*\*\/)$/.test(t));
```

`String.split()` with a capturing-group regex produces an array with **every token
AND every inter-token gap** (empty strings, whitespace). The `.filter()` then
re-scans every element with another regex. A single-pass tokenizer using
`RegExp.exec()` in a `while` loop (the standard lexer pattern) would avoid
allocating the gap strings entirely and skip the second regex pass.

### 3. `toSLID`: `squished()` allocates two arrays per item

```javascript
// src/nanos.esm.js:1085
const tail = parts.length ? parts.slice(-1).slice(-1) : '';
```

`parts.slice(-1).slice(-1)` creates **two new arrays per item** just to get the last
character of the last part. `parts[parts.length - 1]?.slice(-1) ?? ''` would be O(1)
with zero allocations.

### 4. `toSLID`: `itemsToStr` uses `node.entries()` generator with per-call overhead

```javascript
// src/nanos.esm.js:1115
for (const en of node.entries()) {
```

`node.entries()` calls `this._rio?.depend()` and creates two closures (`ik`, `fv`)
on every invocation. For serialization, direct iteration over `node._keys` and
`node._storage` would be faster and avoid the reactive-system overhead entirely.

### 5. `toSLID`: Wraps plain objects/arrays in a full `NANOS` instance mid-serialization

```javascript
// src/nanos.esm.js:1107
if (isPlainObject(value) || Array.isArray(value) || value instanceof Map || value instanceof Set) value = new this.constructor(value);
```

This allocates a full `NANOS` instance (with `_keys`, `_storage`, `_options`,
`_next`, `clear()` call) just to immediately serialize it. A direct recursive
serializer for plain objects/arrays would avoid this allocation entirely.

### 6. `toSLID`: `node.isRedacted()` called per key with reactive overhead

```javascript
// src/nanos.esm.js:1117
if (redact && node.isRedacted(0)) {
```

`node.isRedacted()` calls `this._rio?.depend()` and `this.#wrapKey()` on every key.
The redaction check could be hoisted and inlined since `_redacted` is a simple
property.

---

## Summary Table

| Issue | Location | Severity | Fix |
|---|---|---|---|
| `Array.shift()` O(n²) | `parseSLID` line 584 | **High** | Use integer cursor `tokens[pos++]` |
| `split`+`filter` tokenizer | `parseSLID` line 581 | **High** | Use `RegExp.exec()` loop |
| `parts.slice(-1).slice(-1)` | `toSLID` line 1085 | Medium | `parts[parts.length-1]?.slice(-1) ?? ''` |
| `entries()` overhead in serialize | `toSLID` line 1115 | Medium | Iterate `_keys`/`_storage` directly |
| `new NANOS()` for plain objects | `toSLID` line 1107 | Medium | Inline recursive serializer |
| `isRedacted()` per key | `toSLID` line 1117 | Low | Hoist and inline the check |

---

## Realistic Improvement Potential

Fixing the two **High** issues (O(n²) `shift` → O(n) cursor, and the double-pass
tokenizer) would likely cut parse time by **30–60%** for non-trivial inputs. The
serialize-side fixes (squished, entries overhead, plain-object NANOS wrapping) could
recover another **15–25%**. A realistic target after these fixes would be **4–6×
slower than JSON** rather than 8.8×, which is a reasonable outcome for a pure-JS
implementation with a richer data model.
