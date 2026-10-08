import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ChatInput, isRestorableDraft } = await jiti.import("./ChatInput.tsx");
const { clearDraft, setDraft } = await jiti.import("@/lib/draft-store.ts");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

const render = (draftKey) => renderToStaticMarkup(
  React.createElement(I18nProvider, null, React.createElement(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false, draftKey })),
);

test("only a draft with text or images counts as restored", () => {
  assert.equal(isRestorableDraft(null), false);
  assert.equal(isRestorableDraft({ value: "", images: [] }), false);
  assert.equal(isRestorableDraft({ value: "  \n", images: [] }), false);
  assert.equal(isRestorableDraft({ value: "half a thought", images: [] }), true);
  assert.equal(isRestorableDraft({ value: "", images: [{ data: "aW1hZ2U=", mimeType: "image/png" }] }), true);
});

test("mounting on a stored draft shows the chip above the textarea; no draft, no chip", () => {
  const key = "session:draft-restored-test";
  setDraft(key, { value: "half a thought", images: [] });
  try {
    const html = render(key);
    assert.match(html, /Draft restored/);
    assert.match(html, /aria-label="Dismiss"/);
    assert.ok(html.indexOf("Draft restored") < html.indexOf("<textarea"));
  } finally {
    clearDraft(key);
  }
  assert.doesNotMatch(render("session:no-draft-test"), /Draft restored/);
});

test("only the two restore-from-storage paths raise the flag; rekey and failed-send restore never do", () => {
  assert.match(source, /const \[draftRestored, setDraftRestored\] = useState\(\(\) => \(draftKey \? isRestorableDraft\(getDraft\(draftKey\)\) : false\)\);/);
  assert.match(source, /const draft = draftKey \? getDraft\(draftKey\) : null;[\s\S]*?setDraftRestored\(isRestorableDraft\(draft\)\);[\s\S]*?\}, \[draftKey\]\);/);
  assert.equal((source.match(/setDraftRestored\(isRestorableDraft/g) ?? []).length, 1);
  assert.equal((source.match(/setDraftRestored\(true/g) ?? []).length, 0);
  const rekey = source.slice(source.indexOf("rekeyDraft(previousKey: string, nextKey: string)"), source.indexOf("restoreSubmission(text: string"));
  assert.doesNotMatch(rekey, /setDraftRestored/);
});

test("the chip clears on dismiss, on send and when the composer empties; it stays in flow", () => {
  assert.match(source, /const clearInput = useCallback\(\(\) => \{[\s\S]*?setDraftRestored\(false\);[\s\S]*?\}, \[clearImages, draftKey\]\);/);
  assert.match(source, /if \(!value && attachedImages\.length === 0\) setDraftRestored\(false\);/);
  assert.match(source, /onClick=\{\(\) => setDraftRestored\(false\)\}/);
  const chip = source.slice(source.indexOf('className="chat-draft-restored"'), source.indexOf("{/* Image previews */}"));
  assert.ok(chip.length > 0);
  assert.doesNotMatch(chip, /position: "absolute"/);
});
