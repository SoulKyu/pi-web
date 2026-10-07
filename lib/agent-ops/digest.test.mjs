import assert from "node:assert/strict";
import { test } from "node:test";
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { buildDigest, digestBody } = await jiti.import("./digest.ts");

const since = "2030-01-14T22:00:00.000Z";
const now = new Date("2030-01-15T08:05:00.000Z");
const task = (over) => ({ id: "x", status: "completed", target: "thread", title: "t", completedAt: "2030-01-15T03:00:00.000Z", ...over });

test("buildDigest counts only terminal tasks completed since, lists failed titles and groups by agent with cards", () => {
  const digest = buildDigest({
    since, now,
    tasks: [
      task({ agent: "Martin", status: "failed", title: "backup", target: "isolated" }),
      task({ agent: "Julien", target: "isolated" }),
      task({ agent: "Julien", target: "isolated" }),
      task({ agent: "Julien" }),
      task({ agent: "Julien", completedAt: "2030-01-14T21:59:59.000Z" }), // before the window
      task({ agent: "Julien", status: "running", completedAt: undefined }),
      task({ status: "cancelled" }),
    ],
  });
  assert.equal(digest.runs, 5);
  assert.deepEqual(digest.failed, [{ agent: "Martin", title: "backup" }]);
  assert.deepEqual(digest.byAgent.Julien, { runs: 3, failed: 0, cards: 2 });
  assert.deepEqual(digest.byAgent.Martin, { runs: 1, failed: 1, cards: 1 });
  assert.deepEqual(digest.byAgent["?"], { runs: 1, failed: 0, cards: 0 });
});

test("digestBody fills the placeholders in en and fr with sorted agents", () => {
  const digest = buildDigest({ since, now, tasks: [task({ agent: "Zed" }), task({ agent: "Ann", status: "failed" })] });
  assert.equal(digestBody(digest, "en"), "Quiet hours: 2 runs, 1 failed (Ann, Zed)");
  assert.match(digestBody(digest, "fr"), /2 .*1 .*Ann, Zed/);
  assert.doesNotMatch(digestBody(digest, "fr"), /\{/);
});
