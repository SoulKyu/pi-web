import assert from "node:assert/strict";
import test from "node:test";
const { inQuietHours, quietHoursEnd, dailyBucket } = await (await import("jiti")).createJiti(import.meta.url).import("./quiet-hours.ts");

test("window across midnight", () => {
  const q = { from: "23:00", to: "07:00" };
  assert.ok(inQuietHours(q, new Date("2026-10-07T23:30:00")));
  assert.ok(inQuietHours(q, new Date("2026-10-08T06:59:00")));
  assert.ok(!inQuietHours(q, new Date("2026-10-08T07:00:00")));
  assert.ok(!inQuietHours(undefined, new Date()));
  assert.equal(quietHoursEnd(q, new Date("2026-10-07T23:30:00")).toISOString(), new Date("2026-10-08T07:00:00").toISOString());
  assert.equal(quietHoursEnd(q, new Date("2026-10-08T03:00:00")).toISOString(), new Date("2026-10-08T07:00:00").toISOString());
  assert.equal(dailyBucket("07:30", new Date("2026-10-08T07:29:00")), null);
  assert.equal(dailyBucket("07:30", new Date("2026-10-08T07:31:00")), "2026-10-08");
});
test("same-day window and from === to (no window)", () => {
  const q = { from: "12:00", to: "14:00" };
  assert.ok(inQuietHours(q, new Date("2026-10-07T13:00:00")));
  assert.ok(!inQuietHours(q, new Date("2026-10-07T14:00:00")));
  assert.ok(!inQuietHours(q, new Date("2026-10-07T11:59:00")));
  assert.ok(!inQuietHours({ from: "08:00", to: "08:00" }, new Date("2026-10-07T08:00:00")));
  assert.ok(!inQuietHours({ from: "08:00", to: "08:00" }, new Date("2026-10-07T20:00:00")));
});
