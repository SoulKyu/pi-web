import assert from "node:assert/strict";
import test from "node:test";
const { memAvailableMb, automaticCapacity } = await (await import("jiti")).createJiti(import.meta.url).import("./capacity.ts");
test("memAvailableMb parses /proc/meminfo and tolerates its absence", () => {
  assert.equal(memAvailableMb(() => "MemTotal: 12240000 kB\nMemAvailable:  3072000 kB\n"), 3000);
  assert.equal(memAvailableMb(() => { throw new Error("no proc"); }), undefined);
});
test("capacity is the common cap minus every automatic run, zero under the memory floor", () => {
  assert.equal(automaticCapacity({ maxAutomaticRuns: 2, minFreeMb: 1500, running: 0, freeMb: 4000 }), 2);
  assert.equal(automaticCapacity({ maxAutomaticRuns: 2, minFreeMb: 1500, running: 1, freeMb: 4000 }), 1);
  assert.equal(automaticCapacity({ maxAutomaticRuns: 2, minFreeMb: 1500, running: 0, freeMb: 900 }), 0);
  assert.equal(automaticCapacity({ maxAutomaticRuns: 2, minFreeMb: 1500, running: 3, freeMb: undefined }), 0);
});
