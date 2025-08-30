import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { NANOS } from "../src/nanos.esm.js";

Deno.test("NANOS lock", () => {
    const n = new NANOS("a", "b");
    n.lock(0);
    assertThrows(() => { n.set(0, "z"); }, TypeError);
    n.set(1, "y");
    assertEquals(n.at(1), "y");
});

Deno.test("NANOS lockAll and lockKeys", () => {
    const n = new NANOS("a");
    n.lockAll();
    assertThrows(() => { n.set(0, "z"); }, TypeError);
    const n2 = new NANOS("b");
    n2.lockKeys();
    assertThrows(() => n2.set(0, 'y'), TypeError, 'NANOS: Cannot "set" after locking');
    assertThrows(() => n2.set('new', 'val'), TypeError, 'NANOS: Cannot "set" after locking');
});

Deno.test("NANOS isLocked", () => {
    const n = new NANOS("a", "b");
    n.lock(0);
    assertEquals(n.isLocked(0), true);
    assertEquals(n.isLocked(1), false);
    assertEquals(n.isLocked(), false);
    n.lockKeys();
    assertEquals(n.isLocked(), true);
});

// Missing: confirm all operations that should throw when locked actually do:
// clear, delete, fromEntries, fromPairs, next (setter), pop, push, reverse,
// shift, unshift
