```javascript
const rio = {
    // BASIC RIO
    batch (callback) {},    // Run callback in a reactive batch.
    changed () {},          // Send notification of packaging change.
    create () {},           // Create a new RIO for nested NANOS.
    depend () {},           // Record a packaging dependency.
    // EXTENDED RIO
    get (reactiveValue) {}, // Return a non-reactive value given a reactive one.
    isReactive (value) {},  // Return whether a value is reactive or not
    // This function is called whenever a NANOS value is being set. It
    // should return the (possibly changed, e.g. now-reactive) value to set.
    onSet (nanos, key, value) {} // => newValue
};
```