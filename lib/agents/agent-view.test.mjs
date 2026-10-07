import assert from "node:assert/strict";
import test from "node:test";
const view = await (await import("jiti")).createJiti(import.meta.url).import("./agent-view.ts");

test("toAgentListItem is an allowlist without the role", () => {
  const item = view.toAgentListItem({ name: "a", avatar: { emoji: "x", color: "#000000" }, createdAt: "t", role: "SECRET", toolsPreset: "full", mcpServers: ["github"], home: "/h", threadSessionId: "s", lastReadEntryId: "e" }, true, 3);
  assert.deepEqual(Object.keys(item).sort(), ["avatar", "createdAt", "home", "mcpServers", "name", "paused", "running", "threadSessionId", "toolsPreset", "unread"]);
  assert.equal(item.running, true);
  assert.equal(item.unread, 3);
});
test("labels", () => {
  assert.equal(view.unreadLabel(0), "");
  assert.equal(view.unreadLabel(7), "7");
  assert.equal(view.unreadLabel(120), "99+");
  assert.equal(view.modelLabel("claude-bridge/claude-sonnet-5-5"), "sonnet-5-5");
  assert.equal(view.modelLabel("zai/glm-5.3"), "glm-5.3");
  assert.equal(view.modelLabel(undefined), "");
  assert.deepEqual(view.splitModel("zai/glm-5.3"), { provider: "zai", modelId: "glm-5.3" });
  assert.equal(view.splitModel("glm"), null);
});
test("canEditProfile refuses while the thread runs (Review Focus 5)", () => {
  assert.deepEqual(view.canEditProfile(true), { ok: false, status: 409, error: "agent_running" });
  assert.deepEqual(view.canEditProfile(false), { ok: true });
});
