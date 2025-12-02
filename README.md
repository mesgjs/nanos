# NANOS - Named and Numbered Ordered Storage

**NANOS** is a versatile JavaScript data structure that combines the features of ordered, indexed arrays and named-key objects (maps). It provides a rich, fluent API for managing collections of data where both numerical position and unique keys are important, while strictly maintaining insertion order for all elements.

It is designed as a single ES module with no external dependencies.

## Features

*   **Hybrid Structure:** Stores both indexed (numbered) and keyed (named) values in a single data structure.
*   **Order-Preserving:** Maintains the original insertion order for all keys and indexes (subject to the constraint that indexed values appear in ascending order).
*   **Rich API:** Provides a comprehensive set of methods similar to `Array` and `Map`, including `push`, `pop`, `shift`, `unshift`, `set`, `get`, `at`, `filter`, `forEach`, `keys`, `values`, and `entries`.
*   **Array-like Indexing:** Supports negative indices to access elements from the end of the indexed list (e.g., `-1` for the last item).
*   **Immutability:** Includes methods like `freeze()`, `deepFreeze()`, and `lock()` to create read-only data structures.
*   **Custom Serialization:**
    *   **SLID (Static List Data):** A custom, human-readable data format for serialization and deserialization.
    *   **QJSON (Quasi-JSON):** A relaxed JSON-like parser for easier data entry.
*   **Reactive Interface:** Can integrate with reactive libraries through a `rio` (Reactive Interface Object) property to automatically track changes. The RIO can be a "basic" RIO that only tracks packaging changes (key addition/removal), or an "extended" RIO that also tracks value changes and can automatically wrap new values in reactives.
*   **Value Redaction:** Provides a `redact()` method to securely exclude sensitive values from string output.

## Installation

Since NANOS is an ES module, you can import it directly into your project.

```javascript
import { NANOS, parseSLID, parseQJSON } from './src/nanos.esm.js';
```

## Basic Usage

### Creating a NANOS Instance

```javascript
// Create an empty instance
const data = new NANOS();

// Create with initial items
const items = new NANOS('a', 'b', { key: 'value' });
```

### Adding and Accessing Data

`NANOS` allows you to add data using indexed positions or named keys.

```javascript
const n = new NANOS(10, { name: 'example', id: 123 }, [20, 30]);

// Access values using at() (get() is an alias)
console.log(n.at(0));      // Output: 10
console.log(n.at('name'));  // Output: 'example'

// Use negative indices to access from the end
console.log(n.at(-1));     // Output: 30
```

### Iteration

You can iterate over entries, keys, or values. The iteration order is always the (constrained-index) insertion order.

```javascript
// Continuing from above...
for (const [key, value] of n.entries()) {
  console.log(`${key}: ${value}`);
}
// Output:
// 0: 10
// name: example
// id: 123
// 1: 20
// 2: 30
```

### Serialization with SLID

The `toString()` method serializes the `NANOS` instance to the SLID format.

```javascript
const n = new NANOS(1, 'two', { id: 3, status: 'ok' }, 'last');

const slidString = n.toString();
console.log(slidString);
// Output: [(1 two id=3 status=ok last)]
```

You can parse a SLID string back into a `NANOS` instance.

```javascript
const parsed = NANOS.parseSLID(slidString);
console.log(parsed.at('status')); // Output: 'ok'
```

---

## API Reference

### `new NANOS(...items)`
Creates a new NANOS instance.
*   **`...items`**: Initial items to `.push` into the instance.

### `.at(key, [opts])`
Gets the value at a specified key or index. Negative indices are resolved relative to the end of the indexed portion. If the value is reactive, the "final" (non-reactive) value is returned by default.
*   **`key`**: The key or index to look up, or an array of keys/indexes to recursively traverse.
*   **`opts.default`**: An optional default value to return if the key is not found.
*   **`opts.raw`**: If `true`, returns the raw value, which may be a reactive.
*   **Returns**: The value, or `opts.default` if not found.
*   Alias: `.get()`

### `.atRaw(key, [opts])`
Gets the raw value at a specified key or index. This is a shortcut for `.at(key, { raw: true })`.
*   **`key`**: The key or index to look up.
*   **`opts.default`**: An optional default value to return if the key is not found.
*   **Returns**: The raw value, or `opts.default` if not found.

### `.clear()`
Removes all key-value pairs from the instance. Throws an error if the instance is locked.
*   **Returns**: `this`.

### `.deepFreeze()`
Recursively freezes this NANOS instance and any nested NANOS values, making them completely immutable.
*   **Returns**: `this`.

### `.delete(key, [opts])`
Deletes a key-value pair by its key or index.
*   **`key`**: The key or index to delete.
*   **`opts.raw`**: If `true`, returns the raw (potentially reactive) value.
*   **Returns**: The value that was deleted.

### `.depend()`
Signals a dependency for reactive interfaces (like Svelte or Vue).

### `.entries([opts])`
Returns an iterator that yields `[key, value]` pairs.
*   **`opts.compact`**: If `true`, index keys are returned as numbers instead of strings.
*   **`opts.raw`**: If `true`, yields raw (potentially reactive) values.
*   **Returns**: An iterator for all entries.

### `.filter(f)`
Creates a new NANOS instance with all elements that pass the test implemented by the provided function.
*   **`f(value, key, nanos)`**: The testing function.
*   **Returns**: A new, filtered NANOS instance.

### `.find(f, [opts])`
Returns the first `[key, value]` pair for which the testing function `f` returns true.
*   **`f(value, key, nanos)`**: The testing function.
*   **`opts.raw`**: If `true`, passes raw (potentially reactive) values to the testing function.
*   **Returns**: The `[key, value]` pair, or `undefined`.

### `.findLast(f, [opts])`
Returns the last `[key, value]` pair for which the testing function `f` returns true.
*   **`f(value, key, nanos)`**: The testing function.
*   **`opts.raw`**: If `true`, passes raw (potentially reactive) values to the testing function.
*   **Returns**: The `[key, value]` pair, or `undefined`.

### `.forEach(f, [opts])`
Executes a provided function once for each key/value pair.
*   **`f(value, key, nanos)`**: The function to execute.
*   **`opts.raw`**: If `true`, passes raw (potentially reactive) values to the function.

### `.freeze()`
Freezes the instance, making the key set and all values immutable.
*   **Returns**: `this`.

### `.fromEntries(entries, [insert=false])`
Populates the instance from an array of `[key, value]` entries.
*   **`entries`**: An array of `[key, value]` pairs.
*   **`insert`**: If `true`, entries are inserted at the beginning; otherwise, they are appended.
*   **Returns**: `this`.

### `.fromPairs(...pairs)`
Populates the instance from a flat list of `key1, value1, key2, value2, ...` pairs.
*   **`...pairs`**: The pairs to populate from.
*   **Returns**: `this`.

### `.has(key)`
Checks if a key exists in the instance.
*   **`key`**: The key or index to check.
*   **Returns**: `true` if the key exists, otherwise `false`.

### `.includes(value)`
Checks if a value exists in the instance.
*   **`value`**: The value to search for.
*   **Returns**: `true` if the value exists, otherwise `false`.

### `.indexEntries([compact=false])`
Returns an iterator that yields `[key, value]` pairs for indexed entries only.
*   **`compact`**: If `true`, index keys are returned as numbers instead of strings.
*   **Returns**: An iterator for indexed entries.

### `.indexKeys()`
Returns an iterator that yields the keys of indexed entries only.
*   **Returns**: An iterator for index keys.

### `.isLocked([key])`
Checks if the instance (or a specific key) is locked.
*   **`key`**: Optional key to check. If omitted, checks if the key set is locked.
*   **Returns**: `true` if locked, otherwise `false`.

### `.isRedacted(key)`
Checks if a specific key is redacted.
*   **`key`**: The key to check.
*   **Returns**: `true` if redacted, otherwise `false`.

### `.keyOf(value)`
Returns the first key associated with a given value.
*   **`value`**: The value to locate.
*   **Returns**: The key, or `undefined` if not found.

### `.keys()`
Returns an iterator that yields the keys of the instance in insertion order.

### `.lock(...keys)`
Locks specific values by key, making them read-only. Does not prevent adding or removing other keys.
*   **`...keys`**: The keys of the values to lock.
*   **Returns**: `this`.

### `.lockAll([andNew=false])`
Locks all current values.
*   **`andNew`**: If `true`, any new values added later will also be locked.
*   **Returns**: `this`.

### `.lockKeys()`
Locks the key set, preventing any additions or deletions of keys.
*   **Returns**: `this`.

### `.lastKeyOf(value)`
Returns the last key associated with a given value.
*   **`value`**: The value to locate.
*   **Returns**: The key, or `undefined` if not found.

### `.namedEntries()`
Returns an iterator that yields `[key, value]` pairs for named entries only.
*   **Returns**: An iterator for named entries.

### `.namedKeys()`
Returns an iterator that yields the keys of named entries only.
*   **Returns**: An iterator for named keys.

### `.next` (getter)
Returns the next available numerical index (equivalent to `array.length`).

### `.pairs([compact=false])`
Returns a flat array of `[key1, value1, key2, value2, ...]`.
*   **`compact`**: If `true`, index keys are returned as numbers instead of strings.
*   **Returns**: A flat array of key-value pairs.

### `NANOS.parseQJSON(str)` (static)
Parses a relaxed, "quasi-JSON" string into a NANOS instance or tree of NANOS instances.
*   **`str`**: The string to parse.
*   **Returns**: A new NANOS instance.
* The distinction between objects (`{ }`) and arrays (`[ ]`) is ignored.
* Values may be separated by commas or spaces.
* Text without special characters need not be quoted.
* Key-value pairs may be separated by `:` or `=`.

### `NANOS.parseSLID(str)` (static)
Parses a SLID (Static List Data) formatted string into a NANOS instance or tree of NANOS instances.
*   **`str`**: The string to parse.
*   **Returns**: A new NANOS instance.
* See the included SLID documentation for details.

### `.pathSet(path, [opts])`
Sets or adds a value along a key path with auto-vivification. Automatically creates intermediate NANOS instances as needed to traverse the path.
*   **`path`**: The key path to traverse. Can be a single key or an array of keys.
*   **`opts.to`**: Value to set at the final key in the path.
*   **`opts.first`**: Value to unshift at the target path.
*   **`opts.next`**: Value to push at the target path.
*   **`opts.insert`**: If `true` with `opts.to`, insert instead of append.
*   **`opts.raw`**: If `true` with `opts.to`, set raw value without RIO processing.
*   **Returns**: Object with `base` (this instance), `leaf` (target NANOS), and operation-specific properties (`key`/`value` for `to`, `first` for unshift, `next` for push).
* Auto-vivification means that if any intermediate keys in the path don't exist or don't contain NANOS instances, they will be automatically created/overwritten. The path is always traversed and extended as needed, even if no operation is specified.
* `opts.to` cannot be combined with `opts.first` or `opts.next`, but `opts.first` and `opts.next` can be used together.
* Examples:
  * `n.pathSet(['user', 'profile', 'name'], { to: 'Alice' })` - Sets a value at a nested path
  * `n.pathSet(['data', 'items'], { next: 'newItem' })` - Pushes a value to a nested array
  * `n.pathSet(['data', 'items'], { first: 'firstItem' })` - Unshifts a value to a nested array
  * `n.pathSet(['data', 'items'], { first: 'a', next: 'z' })` - Both unshifts and pushes to a nested array

### `.pop([opts])`
Removes and returns the last indexed value.
*   **`opts.raw`**: If `true`, returns the raw (potentially reactive) value.
*   **Returns**: The removed value, or `undefined` if empty.

### `.push(...items)`
Appends one or more elements to the end of the instance.
*   **`...items`**: The items to add.
*   **Returns**: `this`.
* If an item is a scalar value, it is added directly.
* If an item is an array or Set, the values in the array or Set are added (preserving any array gaps).
* If an item is a plain object or Map, the key/value entries are added.
* If an item is another NANOS instance, all of its key/value pairs (both indexed and named) are added.
* Index (positional) keys in the source will be relative to the previous end of the NANOS.
* To push an array, object, Map, or Set directly, wrap it in an array (`[value]`).

### `.redact(...keys)`
Hides specified values from `toString()` or `toSLID()` output.
*   **`...keys`**: Keys to redact. Can also pass `true` to redact all values.
*   **Returns**: `this`.

### `.reverse()`
Reverses the order of all elements *in place*.
*   **Returns**: `this`.

### `.reverseEntries([compact=false])`
Returns an iterator that yields `[key, value]` pairs in reverse (last-to-first) key order.
*   **`compact`**: If `true`, index keys are returned as numbers instead of strings.
*   **Returns**: An iterator for all entries in reverse order.

### `.rio` (getter/setter)
Gets or sets the reactive-interface object for integration with UI frameworks.

### `.set(key, value, [opts])`
Sets a key-value pair. If `key` is `undefined`, the next sequential index is used.
*   **`key`**: The key or index.
*   **`value`**: The value to set.
*   **`opts.insert`**: If `true`, the new key is inserted instead of appended.
*   **`opts.raw`**: If `true`, sets the value directly without invoking the RIO's `onSet` handler.
*   **Returns**: The `value` that was set.
* In append mode (the default), new named values are added at the end, and indexed values are added at the last position that preserves ascending index order.
* In insert mode, new named values are inserted at the beginning, and indexed values are added at the first position that preserves ascending index order.
* Example: If the current keys are `['a', '1', 'b', '3', 'c']`, named values (with names other than `a`, `b`, or `c`) will be *inserted* before `a` or *appended* after `c`; a value with index 2 would be *inserted* before `b` (2 may not appear before 1, so this is the *first* eligible position in this key-set) or *appended* after `b` (2 may not appear after 3, so this is the *last* eligible position in this key-set).

### `.setRaw(key, value, [opts])`
Sets a raw value, bypassing any RIO `onSet` handler. This is a shortcut for `.set(key, value, { raw: true })`.
*   **`key`**: The key or index.
*   **`value`**: The value to set.
*   **`opts.insert`**: If `true`, the new key is inserted instead of appended.
*   **Returns**: The `value` that was set.

### `.setOpts(options)`
Sets (merges) options for the NANOS instance.
*   **`options`**: An object containing options to set.
    *   `autoReactive`: If `true`, automatically wraps new values in reactives when using an extended RIO.
    *   `opaqueMaps`: If `true`, `Map` objects are treated as opaque values and not introspected.
    *   `opaqueSets`: If `true`, `Set` objects are treated as opaque values and not introspected.
    *   `transform`: A string that controls how object-like values are handled when being set or pushed. See the [Object-Value Transformations](#object-value-transformations) section for details.
*   **Returns**: `this`.
*   Alias: `.setOptions()`

### `.setRIO(r)`
Fluent interface for setting the reactive-interface object (RIO).
*   **`r`**: The RIO object.
*   **Returns**: `this`.

### `.shift([opts])`
Removes and returns the first indexed value.
*   **`opts.raw`**: If `true`, returns the raw (potentially reactive) value.
*   **Returns**: The removed value, or `undefined` if empty.

### `.size` (getter)
Returns the total number of key-value pairs.

### `.similar(...items)`
Creates a new NANOS instance with the same configuration as the current one.
*   **`...items`**: Optional initial items for the new instance.
*   **Returns**: A new NANOS instance.

### `.storage` (getter)
Gets the underlying storage object, which contains the key-value data.
*   **Returns**: The internal storage object.

### `.toObject([opts])`
Returns a plain Object (or Array) view of the NANOS instance, recursively converting nested NANOS instances.
*   **`opts.array`**: If `true`, returns an array for levels without named keys (i.e. empty or only index keys). A plain object is returned for levels that include named keys.
*   **`opts.raw`**: If `true`, returns raw (potentially reactive) values instead of final values.
*   **Returns**: A plain object (or array) representation.
* The returned object has a `null` prototype (created with [`Object.create(null)`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create:1)) unless it's an array.
* Nested NANOS instances are recursively converted to plain objects/arrays.
* Examples:
  * `new NANOS("a", "b", { foo: "bar" }).toObject()` → `{ 0: "a", 1: "b", foo: "bar" }`
  * `new NANOS("a", "b", "c").toObject()` → `{ 0: "a", 1: "b", 2: "c" }`
  * `new NANOS("a", "b", "c").toObject({ array: true })` → `["a", "b", "c"]`
  * `new NANOS("a", { foo: "bar" }).toObject({ array: true })` → `{ 0: "a", foo: "bar" }` (returns a plain object instead of an array because of named key "foo")

### `.toReversed()`
Returns a new, reversed copy of the instance.
*   **Returns**: A new NANOS instance.

### `.toJSON()`
Returns a JSON-representable object for `JSON.stringify()`.
*   **Returns**: An object with `type`, `next`, and `pairs` properties.

### `.toSLID({ compact, redact })`
Generates a SLID (Static List Data) formatted string.
*   **`options`**: An object with `compact` and `redact` booleans.
*   **Returns**: The SLID string.

### `NANOS.toSLID(value, { options })` (static)
Generatea a SLID-formatted string for `value`.
*   **Returns**: The SLID string.

### `.toString(options)`
Converts the instance to a SLID string, redacting sensitive data by default.

### `.unshift(...items)`
Prepends one or more elements to the beginning of the instance.
*   **`...items`**: The items to add.
*   **Returns**: `this`.
* See `.push` for the interpretation of `items`.
* Existing indexed items are renumbered to accomodate new indexed items as needed.
* Example: `.unshift(['a', /*gap*/, 'b']);` increases current indexes by *3*; `.at(0)` will be `a` and `.at(2)` will be `b`.
* Unlike `push`, which processes left-to-right, `unshift` processes right-to-left:\
`push({k:'a'},{k:'b'}).unshift({k:'c'},{k:'d'}) // k: a->b->d->c (final)`

### `.values([opts])`
Returns an iterator that yields the (sparse) *indexed* values in order.
*   **`opts.raw`**: If `true`, yields raw (potentially reactive) values.

---

## Exported Helper Functions

### `isIndex(key)`
Checks if a given key is a valid, non-negative integer string.
*   **`key`**: The key to check.
*   **Returns**: `true` if the key is a valid index.

### `isNegIndex(key)`
Checks if a given key is a valid negative integer string.
*   **`key`**: The key to check.
*   **Returns**: `true` if the key is a negative index.

---

## Object-Value Transformations

| Context | Array | Map | NANOS | Object | Set |
| --- | --- | --- | --- | --- | --- |
| set/named (disabled) | original | original | original | original | original |
| set/named (enabled) | NANOS | NANOS | original | NANOS | NANOS |
| push/unshift (outer) | contents | contents | contents | contents | contents |
| push/unshift (disabled) | original | original | original | original | original |
| push/unshift (sets) | NANOS | contents | original | contents | NANOS |
| push/unshift (all) | NANOS | NANOS | original | NANOS | NANOS |

**KEY**:  
set/named: Applies to `.set` operations and named (non-positional) values  
push/unshift: Applies to `.push` and `.unshift` operations  
disabled: Applies when the `transform` option is JavaScript-"falsey"  
enabled: Applies when the `transform` option is JavaScript-"truthy"  
sets: Applies when the `transform` option is `sets`  
all: Applies when the `transform` option is `all`  
outer: Applies to outer/top-level (as opposed to inner/nested) values:  
`push(outerValue)` versus `push([ innerValue ], { key: innerValue })`  
normal
original: The original object value is used  
contents: The object contents are added to/merged with the target NANOS  
NANOS: A new NANOS object with equivalent content is used in place of the original value  

**NOTES**:  
- In `all` transformation mode, both set-ish (Array and transparent Set) inner values and map-ish (plain Object and transparent Map) inner values are transformed into nested NANOS values.
- In `sets` transformation mode, set-ish inner values are transformed into nested NANOS values and map-ish inner values are merged into the containing NANOS.
- In `sets` transformation mode, inner value sparseness is not preserved (e.g., for `['first',{key:'value'},'last']`, `last` is at index 1 of the NANOS, even though it's at index 2 of the input).
- "Map"-column entries only apply when transparent (i.e., `opaqueMaps` mode is not enabled)  
- "Set"-column entries only apply when transparent (i.e., `opaqueSets` mode is not enabled)

---

## Basic and Extended RIO API

A RIO (reactive interface object) is an interface abstraction object that allows NANOS to potentially work with a variety of different reactive-value implementations.

### Basic RIO
A basic RIO only handles "packaging" changes and must provide four functions as properties:

### `.batch(callback)`
Executes the `callback` function in a reactive batch, deferring dependency recalculations as much as possible during the batch.
*  **`callback`**: The callback function that performs the actions to be done in a batch
*  **Returns**: The return value of the callback function.

### `.changed()`
Called to indicate a state change not directly tracked by other reactive values (e.g. keys added, removed, or locked; changes to the next available index; etc.). This should trigger dependent reactive consumers to reevaluate/rerun.

### `.create()`
Called to create a new RIO object instance for additional, automatically-generated, nested NANOS instances.
*  **Returns**: A new RIO object with its own, independent, reactive value.

### `.depend()`
Called to record a reactive tracking dependency (in other words, any pending reactive computation or effect should be notified when `.changed` is called).

### Extended RIO
An extended RIO adds support for value-level reactivity. In addition to the four basic RIO methods, it must also provide the following:

### `.get(reactiveValue)`
Returns the non-reactive value from a reactive one.
*  **`reactiveValue`**: The reactive value to get the final value of.

### `.isReactive(value)`
Returns `true` if a value is reactive.
*  **`value`**: The value to check.

### `.onSet(nanos, key, value)`
Called whenever a value is being set in a NANOS instance. This function should return the raw value to be stored. Typical return values include the unwrapped `value` if it shouldn't be reactive (i.e. for new keys when `nanos.options.autoReactive` is not set), a new reactive wrapper around `value` for new keys, or the existing reactive wrapper updated with `value` for existing keys.
*  **`nanos`**: The NANOS instance being modified.
*  **`key`**: The key being set.
*  **`value`**: The value being set.
*  **Returns**: The value to be stored.

---

## License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file. Copyright 2024-2025 by Kappa Computer Solutions, LLC and Brian Katzung.
