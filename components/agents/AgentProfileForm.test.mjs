import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const form = await readFile(new URL("./AgentProfileForm.tsx", import.meta.url), "utf8");

test("the profile form is inline: no dialog role, backdrop or stacked-dialog registration", () => {
  assert.match(form, /export function AgentProfileForm\(\{ agent, onSaved, onDeleted, onThreadReset, onDiscard \}/);
  assert.doesNotMatch(form, /role="dialog"|backdropStyle|openStackedDialog|onClose\(\)/);
  assert.match(form, /<form className="agent-profile-form" aria-label=\{title\} onSubmit=/);
});

test("Discard asks the parent for a fresh form; saving keeps the form mounted", () => {
  assert.match(form, /<button type="button" disabled=\{busy\} onClick=\{onDiscard\}[^>]*>\{t\("agents\.profile\.discard"\)\}<\/button>/);
  assert.match(form, /onSaved\(data\.agent\);\s*\} catch/);
});

test("sub-dialogs are portaled to the body, above the sidebar", () => {
  assert.match(form, /createPortal\(\s*<>\s*\{rotated\[0\] && \(/);
  assert.match(form, /document\.body,\s*\)\}/);
});

test("the action row and both button groups wrap in a narrow sidebar", () => {
  const row = form.match(/<div style=\{\{ display: "flex", justifyContent: "space-between"[^}]*\}\}>[\s\S]*?<\/form>/)[0];
  assert.equal([...row.matchAll(/flexWrap: "wrap"/g)].length, 3);
});
