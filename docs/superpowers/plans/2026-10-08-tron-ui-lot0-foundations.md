# Tron UI — Lot 0: Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pi Web a single Tron palette and type system, remove the multi-theme plumbing, and
ship the `components/ui` + `components/tron` primitives with a dev-only gallery. Lots 1–3 then
restyle the screens on top of this foundation.

**Architecture:**
- Every existing component reads legacy CSS variables (`--bg`, `--accent`, …). Remapping those
  variables to Tron values in one `:root` rule turns the whole app Tron-colored immediately and keeps
  it usable between lots.
- New primitives are shadcn-style files owned by the repo (Radix + Tailwind v4 utilities + `cva`).
- A dev-only `/dev/ui` page shows every primitive for visual review. It is guarded by `proxy.ts` like
  `/`, and it is a 404 in production.

**Tech Stack:** Next 16.3 (Turbopack dev), React 19.2, Tailwind v4.2 (`@theme`), `radix-ui` 1.7.0,
`class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `lucide-react` 1.53.0,
`next/font/google` (Geist, Orbitron, JetBrains Mono).

**Spec:** [docs/superpowers/specs/2026-10-08-tron-ui-design.md](../specs/2026-10-08-tron-ui-design.md).
Visual reference: [2026-10-08-tron-ui-mockup.html](../specs/2026-10-08-tron-ui-mockup.html).

**Deltas from the spec (agreed simplifications for this lot):**

| Spec item | Lot 0 decision | Why |
|---|---|---|
| `motion`, `cmdk`, `sonner` | Installed in Lot 1, where they are first used | No unused deps. |
| `geist` npm package | `next/font/google` `Geist` | Same font, self-hosted, no extra dep. |
| `ScrollArea` | Native scrollbars styled in CSS | Radix ScrollArea adds JS for no gain. |
| `IconButton` | `Button size="icon"` | One component. |
| `Sheet` | `DialogContent side="right" \| "left" \| "bottom"` | One component. |
| Motion enter/exit (≤200 ms) | CSS enter animation only (160 ms); exit lands with Motion in Lot 1 | Avoids Motion until Lot 1. |
| (new) `Chamfer` | Added to `components/tron` | `clip-path` clips `box-shadow`; a chamfered glow needs a wrapper `drop-shadow` and a 1 px border layer. |
| (new) `/dev/:path*` in proxy matcher | Added | Otherwise `/dev/ui` skips the web password. The dev server listens on `0.0.0.0`. |

## Global Constraints

- **Branch:** `feat/tron-ui`, worktree `/home/ubuntu/Workspace/soulkyu/pi-web`. Never commit to
  `local`. Rollback tag `pre-tron-ui` already exists.
- **Browser floor:** Safari / iOS **16.4**. `browserslist`: `chrome 111`, `edge 111`, `firefox 111`,
  `safari 16.4`, `ios_saf 16.4`.
- **Colors:**
  - cyan `#00d8ff` = system / assistant / selection / focus
  - orange `#ff9a00` = user / running / primary action
  - red `#ff4d5e` = errors only; no other hues
  - surfaces: bg `#000000`, panel `#03080b`, line `#0e3a4a`
  - text: `#dff6ff`, muted `#7fa6b5`, dim `#4f8fa3`
- **Glows:** 1 px line + ≤14 px blur. Use them only for focus, the active item, running state and
  the composer.
- **Corners:** square everywhere. Chamfers only on the composer and user messages (Lot 1). Agent
  avatars are hexagons.
- **Type:**
  - Orbitron for HUD labels only (uppercase, tracking, ≤10 px)
  - Geist for body
  - JetBrains Mono for code
- **Fonts:** self-hosted via `next/font`. No runtime request to Google.
- **Motion:** every animation stops under `prefers-reduced-motion: reduce`.
- **Touch targets:** interactive primitives reach 44 px on `pointer: coarse`.
- **Logic:** no change to logic, hooks, API routes or data flow beyond removing theme plumbing.
- **Allowed new deps in this lot (exact versions):** `radix-ui@1.7.0`,
  `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.7.0`, `lucide-react@1.53.0`.
- **Tests:**
  - full suite: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test`
  - single file: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test <file>`
- **Typecheck:** `node_modules/.bin/tsc --noEmit`. **Lint:** `npm run lint`.
- **Never run `next build`.** A dev server for this worktree is already running on port 30141; reuse
  it for visual checks.
- **`AGENTS.md`:** `next dev` appends a `BEGIN:nextjs-agent-rules` block to it. Never stage that
  block. Whenever a step says "stage AGENTS.md", run this non-interactive recipe:
  ```bash
  cp AGENTS.md /tmp/AGENTS.md.full
  perl -0pi -e 's/\n\n<!-- BEGIN:nextjs-agent-rules -->.*?<!-- END:nextjs-agent-rules -->\n/\n/s' AGENTS.md
  git add AGENTS.md
  cp /tmp/AGENTS.md.full AGENTS.md
  git diff --cached AGENTS.md | rg -c nextjs-agent-rules || true   # must print nothing / 0
  ```
- **Commits:** Conventional Commits, no AI attribution.
- **Deleted assertions:** every assertion deleted from a test (not rewritten) is listed in that
  commit's body.

## Review Focus

1. A browser still holding `localStorage["pi-theme"] = "rose"` from the old build gets the Tron UI
   with no error. Nothing reads `pi-theme` any more. Pinned in Task 2, Step 1 (layout has no
   theme script; no source reads `pi-theme`).
2. With `PI_WEB_PASSWORD` set, an unauthenticated `GET /dev/ui` redirects to `/login` and does not
   render. Pinned in Task 7, Step 1 (matcher includes `/dev/:path*`).
3. `/dev/ui` in a production build is a 404. Pinned in Task 7, Step 1.
4. Under `prefers-reduced-motion: reduce`, the scan bar, the cursor and the dialog enter animations
   do not run. Pinned in Task 5, Step 1 and Task 6, Step 1.
5. `Gauge` gets `NaN`, a negative number or more than 100 (context usage can exceed the window
   during compaction). It clamps to 0–100 and keeps a valid `aria-valuenow`. Pinned in Task 4,
   Step 1.

---

### Task 1: Revert the palette-only cyberpunk theme and raise the browser floor

**Files:**
- Revert: commit `3a4c9c1` (`app/globals.css`, `lib/theme.ts`, `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`)
- Modify: `package.json` (`browserslist`)
- Modify: `AGENTS.md` (section `## Old Safari (iOS 16.2)`)
- Create: `lib/browser-floor.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: a branch without the cyberpunk palette; Safari/iOS 16.4 floor.

- [ ] **Step 1: Record the baseline**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test 2>&1 | tail -15`
Expected: note the pass/fail counts. Any failure here is pre-existing. Write the failing test names
into the Task 1 commit body under `Baseline failures:` so later tasks are not blamed for them.

- [ ] **Step 2: Revert the cyberpunk commit**

```bash
git revert --no-edit 3a4c9c1
```
Expected: a new commit `Revert "feat: add cyberpunk theme (neon palette, scanlines, glows)"`, no conflicts.

- [ ] **Step 3: Write the failing floor test**

Create `lib/browser-floor.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("targets Safari and iOS 16.4 or newer", () => {
  assert.ok(pkg.browserslist.includes("safari 16.4"), "safari 16.4");
  assert.ok(pkg.browserslist.includes("ios_saf 16.4"), "ios_saf 16.4");
  assert.ok(!pkg.browserslist.some((entry) => /\b16\.[0-3]\b/.test(entry)), "no 16.0-16.3 entry");
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test lib/browser-floor.test.mjs`
Expected: FAIL on `safari 16.4`.

- [ ] **Step 5: Raise the floor**

In `package.json`, replace the `browserslist` array with:
```json
  "browserslist": [
    "chrome 111",
    "edge 111",
    "firefox 111",
    "safari 16.4",
    "ios_saf 16.4"
  ],
```

In `AGENTS.md`, replace the whole `## Old Safari (iOS 16.2)` section (heading and both bullets) with:
```markdown
## Browser floor (Safari / iOS 16.4)

- The fork targets Safari and iOS 16.4+ (`browserslist` in `package.json`, pinned by `lib/browser-floor.test.mjs`). It was 16.2 upstream; the Tron UI raised it so Tailwind v4 (`@property`, cascade layers) and Radix work unmodified.
- `/` still renders entirely on the client: one chunk the browser cannot parse is a blank page. Keep new client dependencies to ones that support Safari 16.4.
- The RegExp-lookbehind workarounds (`replaceNotPrecededBy()` in `lib/markdown.ts`, `lib/gfm-autolink-email-loader.cjs`) date from the 16.2 floor. They are harmless at 16.4 and stay until someone removes them deliberately.
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test lib/browser-floor.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json lib/browser-floor.test.mjs
# stage AGENTS.md (recipe in Global Constraints)
git commit -m "chore: raise the browser floor to Safari/iOS 16.4" -m "Baseline failures: <list from Step 1 or 'none'>"
```

---

### Task 2: Remove the multi-theme plumbing

After this task the app always runs the existing dark palette (`html.dark`). Task 3 swaps that
palette for Tron.

**Files:**
- Delete: `lib/theme.ts`, `lib/theme.test.mjs`, `hooks/useTheme.ts`, `components/ThemeIcon.tsx`, `e2e/themes.mjs`
- Modify: `app/layout.tsx`, `components/AppShell.tsx:31,96`, `components/SettingsPanel.tsx:5-7,82,179-202`,
  `components/MermaidBlock.tsx:5,7,38,44,59,82,281,322`, `components/FileViewer.tsx:9,12,1140,1386,1416`,
  `app/globals.css` (palette rules), `app/settings.css` (`.settings-theme-option*` rules),
  `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts`, `e2e/code-background.mjs`, `AGENTS.md` (file map)
- Test: `components/SettingsPanel.test.mjs`, `components/AppShell.mobile-toolbar.test.mjs`,
  `components/diff-palette.test.mjs`, create `app/theme-removed.test.mjs`

**Interfaces:**
- Consumes: Task 1 branch state.
- Produces:
  - `<html>` always carries `class="dark"`; no `data-theme` attribute.
  - No `useTheme`, `THEME_OPTIONS`, `THEME_INIT_SCRIPT` or `ThemeIcon` symbol exists.

- [ ] **Step 1: Write the failing guard test**

Create `app/theme-removed.test.mjs`:
```js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the root layout is always dark and runs no theme script", () => {
  assert.match(layout, /<html[^>]*className=\{`[^`]*\bdark\b[^`]*`\}/);
  assert.doesNotMatch(layout, /THEME_INIT_SCRIPT|dangerouslySetInnerHTML/);
});

test("no theme module or stored theme preference remains", async () => {
  for (const path of ["../lib/theme.ts", "../hooks/useTheme.ts", "../components/ThemeIcon.tsx"]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, path);
  }
  for (const path of ["../components/AppShell.tsx", "../components/SettingsPanel.tsx", "../components/MermaidBlock.tsx", "../components/FileViewer.tsx"]) {
    const source = await read(path);
    assert.doesNotMatch(source, /useTheme|pi-theme|THEME_OPTIONS/, path);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test app/theme-removed.test.mjs`
Expected: FAIL (layout still uses `THEME_INIT_SCRIPT`).

- [ ] **Step 3: Remove theme plumbing from the layout**

In `app/layout.tsx`:
- delete `import { THEME_INIT_SCRIPT } from "@/lib/theme";`
- delete the whole `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />` element
- change the `<html>` className to `` className={`${notoSansMono.variable} dark notranslate`} ``
- replace the `themeColor` array in `viewport` with `themeColor: "#1a1a1a",` (Task 3 sets the Tron value)

- [ ] **Step 4: Remove the settings selector**

In `components/SettingsPanel.tsx`:
- delete the imports `useTheme`, `THEME_OPTIONS` and `ThemeIcon` (lines 5–7)
- delete `const { preference, setThemePreference } = useTheme();` (line 82)
- delete the whole first `<section className="settings-general-section">` (the one whose heading is
  `{t("settings.appearance")}`, lines ~179–202)

In `app/settings.css`, delete every rule whose selector starts with `.settings-theme-option`
(`.settings-theme-options`, `.settings-theme-option`, `:has(input:checked)`, `:hover`,
`:focus-visible`, `-label`). Check with `rg -n 'settings-theme' app components` → no output.

Delete the files: `git rm components/ThemeIcon.tsx lib/theme.ts lib/theme.test.mjs hooks/useTheme.ts e2e/themes.mjs`

- [ ] **Step 5: Make the remaining readers dark-only**

`components/AppShell.tsx`: delete `import { useTheme } from "@/hooks/useTheme";` (line 31) and the bare `useTheme();` call (line 96).

`components/MermaidBlock.tsx`:
- delete `import { useTheme } from "@/hooks/useTheme";` and the `vs` import on line 5
- line 38: delete `const { isDark } = useTheme();`
- line 44: `const currentKey = \`dark\n${code}\`;`
- line 59: `theme: "dark",`
- line 82: dependency array becomes `[code, currentKey, previewVisible]`
- line 281: delete `const { isDark } = useTheme();`
- line 322: `style={codeBlockDarkTheme}`
- the comment at ~330 about the light `vs` theme's border: delete it and the code it explains only
  if that code exists solely for `vs`. Otherwise keep the code and drop the sentence about `vs`.

`components/FileViewer.tsx`:
- delete the `vs` import (line 9) and `import { useTheme } from "@/hooks/useTheme";` (line 12)
- line 1140: delete `const { isDark } = useTheme();`
- line 1386: `style={vscDarkPlus}`
- line 1416: remove `isDark` from the dependency array

- [ ] **Step 6: Drop the light/extra palettes and theme strings**

In `app/globals.css`:
- delete the rules `[data-theme="mist"]`, `[data-theme="rose"]`, `html[data-theme="pine"], [data-theme="pine"]`
- change the selector `:root,\n[data-theme="light"]` to `:root`
- change `html.dark,\n[data-theme="dark"]` to `html.dark`

In each of `lib/i18n/messages/en.ts`, `fr.ts`, `zh-CN.ts`, `zh-TW.ts`, delete these keys:
`settings.appearance`, `settings.themeLight`, `settings.themeDark`, `settings.themeMist`,
`settings.themeRose`, `settings.themePine`, `settings.themeSystem`.
Verify with `rg -n 'settings\.(appearance|theme[A-Z])' lib components app hooks` → no output.

`AGENTS.md` file map: delete the line `  useTheme.ts              theme state`.

- [ ] **Step 7: Rewrite the tests that pinned themes**

`components/SettingsPanel.test.mjs`:
- delete the `themeSource` and `themeOptionsSource` declarations (lines 10–11)
- replace the test `"offers five palettes and system theme selection with native radios"` with:
```js
test("General settings offer no theme selector: Tron is the only UI", () => {
  assert.doesNotMatch(panelSource, /THEME_OPTIONS|setThemePreference|settings\.appearance/);
});
```
- in the test `"groups chat display controls together without row backgrounds"`, delete the
  `appearanceSection` constant and the `assert.doesNotMatch(appearanceSection, …)` line. Keep the
  rest unchanged.

`components/AppShell.mobile-toolbar.test.mjs`: in the test `"keeps theme and language in settings
instead of the chat toolbar"`, replace the two `useTheme` assertions (lines 86–87) with:
```js
  assert.doesNotMatch(source, /useTheme/);
```

`components/diff-palette.test.mjs`: replace line 33 with
```js
const THEMES = [":root", "html.dark"];
```

`e2e/code-background.mjs`: replace the `try { for (const colorScheme …) { … } … } finally { … }`
block and the final `console.log` with a single pass:
```js
  try {
    await page.waitForFunction(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "color-mix(in srgb, var(--bg) 92%, var(--bg-panel))";
      document.body.append(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const nodes = [...document.querySelectorAll(".markdown-code-block pre")];
      return nodes.length === 2 && nodes.every((node) => (
        getComputedStyle(node).backgroundColor === expected
        && getComputedStyle(node).borderTopWidth === "0px"
        && getComputedStyle(node.querySelector("code")).backgroundColor === "rgba(0, 0, 0, 0)"
      ));
    });
    assert.deepEqual(warnings, [], "Code blocks must not mix background shorthand and backgroundColor");
  } finally {
    page.off("console", onConsole);
  }
  console.log("PASS: code and Mermaid source backgrounds use the panel mix");
```

- [ ] **Step 8: Verify**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test app/theme-removed.test.mjs components/SettingsPanel.test.mjs components/AppShell.mobile-toolbar.test.mjs components/diff-palette.test.mjs`
Expected: PASS.
Run: `node_modules/.bin/tsc --noEmit && npm run lint`
Expected: no errors. An `rg -n 'useTheme|lib/theme|ThemeIcon' --glob '!docs/**' --glob '!demo/**' .` lists nothing.

- [ ] **Step 9: Commit**

```bash
git add -A app components hooks lib e2e
# stage AGENTS.md (recipe in Global Constraints)
git commit -m "refactor: drop the theme selector and palettes; the UI is always dark" \
  -m "Deleted assertions: SettingsPanel 'offers five palettes and system theme selection' (theme radios removed); SettingsPanel appearance-section check (section removed); AppShell useTheme import/call (hook removed); lib/theme.test.mjs (module removed); e2e/themes.mjs (themes removed); code-background light/dark switching loop (single palette)."
```

---

### Task 3: Tron palette, design tokens and fonts

**Files:**
- Modify: `app/globals.css` (new `@theme static` block, palette rules, `--font-mono`, `html, body` font, reduced-motion guard)
- Modify: `app/layout.tsx` (fonts, `themeColor`), `app/manifest.ts:12-13`, `public/offline.html:6`
- Test: rewrite `components/diff-palette.test.mjs` theme list; create `app/tron-tokens.test.mjs`

**Interfaces:**
- Consumes: Task 2 (one dark palette).
- Produces the Tailwind utilities later tasks use:
  - colors: `bg-tron-cyan`, `text-tron-cyan`, `border-tron-cyan`, `…-tron-orange`, `…-tron-red`,
    `…-tron-line`, `…-tron-panel`
  - shadows and fonts: `shadow-glow-cyan`, `shadow-glow-orange`, `font-hud`, `font-sans`, `font-mono`
  - animations: `animate-tron-enter`, `animate-tron-fade`
  - legacy utilities kept and remapped: `bg-bg`, `bg-bg-panel`, `bg-bg-hover`, `bg-bg-selected`,
    `text-text`, `text-text-muted`, `text-text-dim`, `border-border`
  - CSS variables: `--font-geist`, `--font-orbitron`, `--font-jetbrains-mono`

- [ ] **Step 1: Write the failing token test**

Create `app/tron-tokens.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
const layout = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} rule`);
  return css.slice(start, css.indexOf("\n}", start));
}
const value = (rule, name) => rule.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("one palette: Tron surfaces and meaning colors", () => {
  assert.doesNotMatch(css, /\[data-theme=|html\.dark,\s*\n|html\.dark \{\n\s*color-scheme/);
  const root = block(":root");
  assert.equal(value(root, "--bg"), "#000000");
  assert.equal(value(root, "--bg-panel"), "#03080b");
  assert.equal(value(root, "--border"), "#0e3a4a");
  assert.equal(value(root, "--accent"), "#00d8ff");
  assert.equal(value(root, "color-scheme"), "dark");
  const theme = block("@theme static");
  for (const [name, hex] of [["--color-tron-cyan", "#00d8ff"], ["--color-tron-orange", "#ff9a00"], ["--color-tron-red", "#ff4d5e"], ["--color-tron-line", "#0e3a4a"], ["--color-tron-panel", "#03080b"]]) {
    assert.equal(value(theme, name), hex, name);
  }
  assert.match(value(theme, "--shadow-glow-cyan"), /^0 0 0 1px .*, 0 0 14px /);
});

test("text, muted and dim text stay readable on bg and panel", () => {
  const root = block(":root");
  for (const text of ["--text", "--text-muted", "--text-dim"]) {
    for (const surface of ["--bg", "--bg-panel"]) {
      const ratio = contrast(value(root, text), value(root, surface));
      assert.ok(ratio >= 4.5, `${text} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  }
});

test("fonts are self-hosted through next/font and wired to Tailwind", () => {
  assert.match(layout, /import \{ Geist, JetBrains_Mono, Orbitron \} from "next\/font\/google"/);
  for (const v of ["--font-geist", "--font-orbitron", "--font-jetbrains-mono"]) assert.match(layout, new RegExp(`variable: "${v}"`));
  const theme = block("@theme static");
  assert.match(value(theme, "--font-sans"), /^var\(--font-geist\)/);
  assert.match(value(theme, "--font-hud"), /^var\(--font-orbitron\)/);
  assert.match(value(theme, "--font-mono"), /^var\(--font-jetbrains-mono\)/);
  assert.doesNotMatch(css, /fonts\.googleapis/);
});

test("reduced motion stops every animation and transition", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s*\*,\n\s*\*::before,\n\s*\*::after \{[\s\S]*?animation-duration: 0\.01ms !important;[\s\S]*?transition-duration: 0\.01ms !important;/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test app/tron-tokens.test.mjs`
Expected: FAIL (`--bg` is `#ffffff`).

- [ ] **Step 3: Replace the palettes with the Tron palette**

In `app/globals.css`, replace both palette rules (`:root { … }` light and `html.dark { … }`) with:
```css
:root {
  color-scheme: dark;
  --bg: #000000;
  --bg-panel: #03080b;
  --bg-hover: #0a1a22;
  --bg-selected: #0f2833;
  --border: #0e3a4a;
  --text: #dff6ff;
  --text-muted: #7fa6b5;
  --text-dim: #4f8fa3;
  --accent: #00d8ff;
  --accent-hover: #5ce6ff;
  --accent-contrast: #001014;
  --user-bg: #140c00;
  --assistant-bg: #000000;
  --tool-bg: #03080b;
  --bg-subtle: rgba(0, 216, 255, 0.04);
  --diff-added: #00d8ff;
  --diff-removed: #ff4d5e;
  --diff-added-bg: color-mix(in srgb, var(--diff-added) 14%, transparent);
  --diff-removed-bg: color-mix(in srgb, var(--diff-removed) 14%, transparent);
  --chat-content-max-width: 820px;
  --chat-content-font-size: 14px;
}
```
Keep the `html.dark .catppuccin-file-icon` rules: `<html>` always has `dark`, so the dark icon
variant always applies.

- [ ] **Step 4: Add the Tron tokens to `@theme`**

Add a new block right after the existing `@theme { … }` block. It is `static` because Tailwind v4
only emits the theme variables it sees used in class names, and these are also read from plain CSS
(`var(--color-tron-orange)`, `var(--font-mono)`):
```css
@theme static {
  --color-tron-cyan: #00d8ff;
  --color-tron-orange: #ff9a00;
  --color-tron-red: #ff4d5e;
  --color-tron-line: #0e3a4a;
  --color-tron-panel: #03080b;
  --shadow-glow-cyan: 0 0 0 1px rgb(0 216 255 / 0.55), 0 0 14px rgb(0 216 255 / 0.35);
  --shadow-glow-orange: 0 0 0 1px rgb(255 154 0 / 0.6), 0 0 14px rgb(255 154 0 / 0.35);
  --font-sans: var(--font-geist), ui-sans-serif, system-ui, sans-serif;
  --font-hud: var(--font-orbitron), var(--font-geist), sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, 'PingFang SC', 'Microsoft YaHei', monospace;
  --animate-tron-enter: tron-enter 160ms ease-out;
  --animate-tron-fade: tron-fade 160ms ease-out;

  @keyframes tron-enter {
    from { opacity: 0; transform: translateY(4px) scale(0.98); }
  }
  @keyframes tron-fade {
    from { opacity: 0; }
  }
}
```
Delete the later standalone rule `:root { --font-mono: var(--font-noto-mono), … }` (around line 856).
`--font-mono` now comes from `@theme`.

In the `html, body { … }` rule, replace the `font-family: -apple-system, …;` line with
`font-family: var(--font-sans);`.

At the end of `app/globals.css` add:
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Load the fonts and set the browser chrome color**

In `app/layout.tsx`:
- replace the `Noto_Sans_Mono` import and its `const notoSansMono = …` with:
```tsx
import { Geist, JetBrains_Mono, Orbitron } from "next/font/google";

const geist = Geist({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-geist", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-jetbrains-mono", display: "swap" });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-orbitron", display: "swap" });
```
- set `` className={`${geist.variable} ${jetbrainsMono.variable} ${orbitron.variable} dark notranslate`} `` on `<html>`
- set `themeColor: "#000000",` in `viewport`

In `app/manifest.ts`, set `background_color: "#000000"` and `theme_color: "#000000"`.
In `public/offline.html`, set `<meta name="theme-color" content="#000000" />`.

Check: `rg -n 'font-noto-mono|Noto_Sans_Mono' app components lib` → no output. If a match
remains, replace it with `var(--font-mono)`.

- [ ] **Step 6: Point the diff test at the single palette**

`components/diff-palette.test.mjs` line 33:
```js
const THEMES = [":root"];
```

- [ ] **Step 7: Verify**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test app/tron-tokens.test.mjs components/diff-palette.test.mjs app/theme-removed.test.mjs`
Expected: PASS.
Run: `node_modules/.bin/tsc --noEmit && npm run lint`
Expected: clean.
Visual: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:30141/` → `200`. Then ask the user
to reload `http://192.168.1.182:30141/`: the app is black / cyan with Geist text.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css app/layout.tsx app/manifest.ts public/offline.html app/tron-tokens.test.mjs components/diff-palette.test.mjs
git commit -m "feat(ui): Tron palette, tokens and self-hosted fonts"
```

---

### Task 4: Dependencies, `cn()` and the plain primitives

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/cn.ts`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/textarea.tsx`,
  `components/ui/kbd.tsx`, `components/ui/badge.tsx`, `components/ui/led.tsx`, `components/ui/gauge.tsx`
- Test: `components/ui/primitives.test.mjs`

**Interfaces:**
- Consumes: Task 3 utilities.
- Produces:
  - `cn(...inputs: ClassValue[]): string`
  - `Button`: props `ComponentProps<"button"> & { variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "icon"; asChild?: boolean }`; also exports `buttonVariants`
  - `Input`: props `ComponentProps<"input">`
  - `Textarea`: props `ComponentProps<"textarea">`
  - `Kbd`: props `ComponentProps<"kbd">`
  - `Badge`: props `ComponentProps<"span"> & { tone?: "cyan" | "orange" | "red" | "muted" }`
  - `Led`: props `{ status: "running" | "done" | "idle" | "error"; label?: string; className?: string }`
  - `Gauge`: props `{ value: number; label: string; size?: number; className?: string }`

- [ ] **Step 1: Write the failing tests**

Create `components/ui/primitives.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { cn } = await jiti.import("@/lib/cn");
const { Button } = await jiti.import("./button.tsx");
const { Input } = await jiti.import("./input.tsx");
const { Led } = await jiti.import("./led.tsx");
const { Gauge } = await jiti.import("./gauge.tsx");
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

test("cn lets the later Tailwind class win", () => {
  assert.equal(cn("px-2 text-sm", false && "hidden", "px-4"), "text-sm px-4");
});

test("Button is type=button by default and reaches 44px on coarse pointers", () => {
  const out = html(h(Button, null, "Go"));
  assert.match(out, /^<button[^>]*type="button"/);
  assert.match(out, /pointer-coarse:h-11/);
  assert.match(html(h(Button, { size: "icon", "aria-label": "Add" }, "+")), /pointer-coarse:size-11/);
});

test("Button asChild renders the child element and no button type", () => {
  const out = html(h(Button, { asChild: true }, h("a", { href: "/x" }, "Link")));
  assert.match(out, /^<a [^>]*href="\/x"/);
  assert.doesNotMatch(out, /type="button"/);
});

test("Input marks invalid fields in red", () => {
  assert.match(html(h(Input, { "aria-invalid": true })), /aria-invalid:border-tron-red/);
});

test("Led is decorative without a label and an image with one", () => {
  assert.match(html(h(Led, { status: "idle" })), /aria-hidden="true"/);
  const labelled = html(h(Led, { status: "running", label: "Running" }));
  assert.match(labelled, /role="img"/);
  assert.match(labelled, /aria-label="Running"/);
  assert.match(labelled, /data-status="running"/);
});

test("Gauge clamps out-of-range and non-numeric values", () => {
  for (const [input, expected] of [[-5, "0"], [150, "100"], [Number.NaN, "0"], [Number.POSITIVE_INFINITY, "0"], [42.4, "42"]]) {
    const out = html(h(Gauge, { value: input, label: "Context" }));
    assert.match(out, new RegExp(`aria-valuenow="${expected}"`), String(input));
    assert.match(out, /role="meter"/);
  }
});

test("Gauge turns orange from 75% and red from 90%", () => {
  assert.match(html(h(Gauge, { value: 50, label: "c" })), /var\(--color-tron-cyan\) 0 50%/);
  assert.match(html(h(Gauge, { value: 80, label: "c" })), /var\(--color-tron-orange\) 0 80%/);
  assert.match(html(h(Gauge, { value: 95, label: "c" })), /var\(--color-tron-red\) 0 95%/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/ui/primitives.test.mjs`
Expected: FAIL (`Cannot find module '@/lib/cn'`).

- [ ] **Step 3: Install the dependencies**

```bash
npm install --save-exact radix-ui@1.7.0 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.7.0 lucide-react@1.53.0
```
Expected: `package.json` `dependencies` gains the five exact versions. The dev server keeps
running; Turbopack picks the packages up.

- [ ] **Step 4: Implement**

`lib/cn.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

`components/ui/button.tsx`:
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-[box-shadow,color,background-color,border-color] duration-150 focus-visible:shadow-glow-cyan disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-tron-orange text-black hover:shadow-glow-orange",
        outline: "border border-tron-line text-text hover:border-tron-cyan hover:text-tron-cyan",
        ghost: "text-text-muted hover:bg-bg-hover hover:text-text",
        danger: "border border-tron-red/60 text-tron-red hover:bg-tron-red/10",
      },
      size: {
        sm: "h-8 px-3 text-xs pointer-coarse:h-11",
        md: "h-9 px-4 text-sm pointer-coarse:h-11",
        icon: "size-9 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
```

`components/ui/input.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const fieldClass = "w-full min-w-0 border border-tron-line bg-black px-3 text-sm text-text outline-none transition-shadow placeholder:text-text-dim focus-visible:border-tron-cyan focus-visible:shadow-glow-cyan aria-invalid:border-tron-red disabled:opacity-40";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={cn(fieldClass, "h-9 pointer-coarse:h-11", className)} {...props} />;
}
```

`components/ui/textarea.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { fieldClass } from "./input";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldClass, "min-h-16 resize-y py-2", className)} {...props} />;
}
```

`components/ui/kbd.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center border border-tron-line px-1 font-mono text-[10px] text-text-dim", className)} {...props} />;
}
```

`components/ui/badge.tsx`:
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-hud text-[9px] uppercase tracking-[0.14em]", {
  variants: {
    tone: {
      cyan: "border-tron-cyan/50 text-tron-cyan",
      orange: "border-tron-orange/60 text-tron-orange",
      red: "border-tron-red/60 text-tron-red",
      muted: "border-tron-line text-text-dim",
    },
  },
  defaultVariants: { tone: "muted" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
```

`components/ui/led.tsx`:
```tsx
import { cn } from "@/lib/cn";

const STATUS = {
  running: "bg-tron-orange shadow-[0_0_8px_var(--color-tron-orange)] animate-pulse motion-reduce:animate-none",
  done: "bg-tron-cyan shadow-[0_0_8px_var(--color-tron-cyan)]",
  idle: "bg-[#24414c]",
  error: "bg-tron-red shadow-[0_0_8px_var(--color-tron-red)]",
} as const;

export type LedStatus = keyof typeof STATUS;

export function Led({ status, label, className }: { status: LedStatus; label?: string; className?: string }) {
  return (
    <span
      data-status={status}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("inline-block size-1.5 shrink-0 rounded-full", STATUS[status], className)}
    />
  );
}
```

`components/ui/gauge.tsx`:
```tsx
import { cn } from "@/lib/cn";

export function Gauge({ value, label, size = 22, className }: { value: number; label: string; size?: number; className?: string }) {
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const rounded = Math.round(pct);
  const tone = pct >= 90 ? "var(--color-tron-red)" : pct >= 75 ? "var(--color-tron-orange)" : "var(--color-tron-cyan)";
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      className={cn("inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size, background: `conic-gradient(${tone} 0 ${rounded}%, var(--color-tron-line) ${rounded}% 100%)` }}
    >
      <span className="rounded-full bg-black" style={{ width: size - 6, height: size - 6 }} />
    </span>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/ui/primitives.test.mjs`
Expected: PASS. If `Slot.Root` is undefined, check `node -e "console.log(Object.keys(require('radix-ui').Slot))"`
and use the exported root name. Do not add `@radix-ui/react-slot`.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `node_modules/.bin/tsc --noEmit && npm run lint`
```bash
git add package.json package-lock.json lib/cn.ts components/ui
git commit -m "feat(ui): Tron primitives: Button, Input, Textarea, Kbd, Badge, Led, Gauge"
```

---

### Task 5: Radix primitives: Dialog (incl. side sheets), DropdownMenu, Popover, Tooltip, Tabs, Switch

**Files:**
- Create: `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/popover.tsx`,
  `components/ui/tooltip.tsx`, `components/ui/tabs.tsx`, `components/ui/switch.tsx`
- Test: `components/ui/radix.test.mjs`

**Interfaces:**
- Consumes: `cn` (Task 4), the `animate-tron-*` and `shadow-glow-*` utilities (Task 3).
- Produces:
  - `Dialog`, `DialogTrigger`, `DialogClose`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`
  - `DialogContent`: props `ComponentProps<typeof DialogPrimitive.Content> & { side?: "center" | "right" | "left" | "bottom"; closeLabel: string }`
  - `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`
  - `Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent`
  - `Tooltip`: props `{ content: ReactNode; children: ReactElement; side?: "top" | "right" | "bottom" | "left" }`
  - `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
  - `Switch`: props `ComponentProps<typeof SwitchPrimitive.Root>`

- [ ] **Step 1: Write the failing tests**

Create `components/ui/radix.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { Tabs, TabsList, TabsTrigger, TabsContent } = await jiti.import("./tabs.tsx");
const { Switch } = await jiti.import("./switch.tsx");
const h = React.createElement;
const src = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");

test("Tabs render only the active panel", () => {
  const out = renderToStaticMarkup(h(Tabs, { defaultValue: "a" },
    h(TabsList, null, h(TabsTrigger, { value: "a" }, "A"), h(TabsTrigger, { value: "b" }, "B")),
    h(TabsContent, { value: "a" }, "panel A"),
    h(TabsContent, { value: "b" }, "panel B")));
  assert.ok(out.includes("panel A"));
  assert.ok(!out.includes("panel B"));
  assert.match(out, /role="tablist"/);
});

test("Switch exposes role=switch with its checked state", () => {
  const out = renderToStaticMarkup(h(Switch, { checked: true, "aria-label": "Expand thinking" }));
  assert.match(out, /role="switch"/);
  assert.match(out, /aria-checked="true"/);
});

test("DialogContent requires a translated close label", async () => {
  const dialog = await src("dialog.tsx");
  assert.match(dialog, /closeLabel: string/);
  assert.match(dialog, /aria-label=\{closeLabel\}/);
});

test("every entering animation is disabled under reduced motion", async () => {
  for (const file of ["dialog.tsx", "dropdown-menu.tsx", "popover.tsx", "tooltip.tsx"]) {
    const source = await src(file);
    const animated = source.match(/animate-tron-(enter|fade)/g) ?? [];
    const guarded = source.match(/motion-reduce:animate-none/g) ?? [];
    assert.ok(animated.length > 0, `${file} animates`);
    assert.equal(guarded.length, animated.length, `${file}: each animate-tron-* has motion-reduce:animate-none`);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/ui/radix.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`components/ui/dialog.tsx`:
```tsx
"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIDES = {
  center: "left-1/2 top-1/2 max-h-[85dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 border",
  right: "inset-y-0 right-0 h-full w-[min(92vw,26rem)] border-l",
  left: "inset-y-0 left-0 h-full w-[min(92vw,26rem)] border-r",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] border-t pb-[max(1.25rem,env(safe-area-inset-bottom))]",
} as const;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  side?: keyof typeof SIDES;
  closeLabel: string;
};

export function DialogContent({ className, children, side = "center", closeLabel, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-tron-fade motion-reduce:animate-none" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto border-tron-line bg-tron-panel p-5 text-text shadow-glow-cyan outline-none data-[state=open]:animate-tron-enter motion-reduce:animate-none",
          SIDES[side],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute right-2 top-2 grid size-9 place-items-center text-text-dim outline-none hover:text-tron-cyan focus-visible:shadow-glow-cyan pointer-coarse:size-11"
        >
          <XIcon aria-hidden className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-hud text-[11px] uppercase tracking-[0.16em] text-tron-cyan", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-text-muted", className)} {...props} />;
}
```

`components/ui/dropdown-menu.tsx`:
```tsx
"use client";

import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-44 border border-tron-line bg-black/95 p-1 text-sm text-text shadow-glow-cyan data-[state=open]:animate-tron-enter motion-reduce:animate-none", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn("flex min-h-8 cursor-default select-none items-center gap-2 px-2 text-text-muted outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-[linear-gradient(90deg,rgb(0_216_255/0.15),transparent)] data-[highlighted]:text-white data-[highlighted]:shadow-[inset_2px_0_0_var(--color-tron-cyan)] pointer-coarse:min-h-11 [&_svg]:size-4", className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2 py-1.5 font-hud text-[9px] uppercase tracking-[0.14em] text-text-dim", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-tron-line", className)} {...props} />;
}
```

`components/ui/popover.tsx`:
```tsx
"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className, sideOffset = 6, align = "center", ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 w-72 border border-tron-line bg-black/95 p-3 text-sm text-text shadow-glow-cyan outline-none data-[state=open]:animate-tron-enter motion-reduce:animate-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
```

`components/ui/tooltip.tsx`:
```tsx
"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

type TooltipProps = { content: ReactNode; children: ReactElement; side?: "top" | "right" | "bottom" | "left" };

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 border border-tron-line bg-black px-2 py-1 text-xs text-text shadow-glow-cyan data-[state=delayed-open]:animate-tron-fade motion-reduce:animate-none"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
```

`components/ui/tabs.tsx`:
```tsx
"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex border-b border-tron-line", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("-mb-px min-h-9 border-b-2 border-transparent px-3 font-mono text-xs text-text-muted outline-none hover:text-text focus-visible:shadow-glow-cyan data-[state=active]:border-tron-cyan data-[state=active]:text-white data-[state=active]:shadow-[0_6px_10px_-8px_var(--color-tron-cyan)] pointer-coarse:min-h-11", className)}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}
```

`components/ui/switch.tsx`:
```tsx
"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center border border-tron-line bg-black outline-none transition-[background-color,box-shadow] focus-visible:shadow-glow-cyan disabled:opacity-40 data-[state=checked]:border-tron-cyan data-[state=checked]:bg-tron-cyan/15", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3 translate-x-0.5 bg-text-dim transition-[translate,background-color] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-tron-cyan data-[state=checked]:shadow-[0_0_8px_var(--color-tron-cyan)]" />
    </SwitchPrimitive.Root>
  );
}
```
The switch is 20 px tall. On coarse pointers, callers wrap it in a ≥44 px label row (the
`SettingsUi` pattern in Lot 2).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/ui/radix.test.mjs`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `node_modules/.bin/tsc --noEmit && npm run lint`
```bash
git add components/ui
git commit -m "feat(ui): Radix primitives: Dialog/sheets, DropdownMenu, Popover, Tooltip, Tabs, Switch"
```

---

### Task 6: Tron identity pieces: PerspectiveGrid, ScanBar, StreamCursor, HexAvatar, Chamfer

**Files:**
- Modify: `app/globals.css` (append a `/* Tron identity */` block)
- Create: `components/tron/index.tsx`
- Test: `components/tron/tron.test.mjs`

**Interfaces:**
- Consumes: `cn`, Tron tokens.
- Produces (all from `@/components/tron`):
  - `PerspectiveGrid({ className?: string })`: decorative, `aria-hidden`. The parent must be
    `relative overflow-hidden`.
  - `ScanBar({ className?: string })`: 1 px running indicator, decorative.
  - `StreamCursor()`: blinking block cursor, decorative.
  - `HexAvatar({ label: string; active?: boolean; className?: string })`: up to 2 grapheme
    initials, decorative. The parent button carries the accessible name.
  - `Chamfer({ tone?: "cyan" | "orange"; glow?: boolean; cut?: number; className?: string;
    innerClassName?: string; children })`: chamfered box with a 1 px tone border and an optional
    outer glow.

- [ ] **Step 1: Write the failing tests**

Create `components/tron/tron.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { HexAvatar, PerspectiveGrid, ScanBar, StreamCursor, Chamfer } = await jiti.import("./index.tsx");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

test("HexAvatar shows up to two uppercase initials, emoji-safe", () => {
  assert.match(html(h(HexAvatar, { label: "ops" })), />OP</);
  assert.match(html(h(HexAvatar, { label: "  review " })), />RE</);
  assert.match(html(h(HexAvatar, { label: "🤖bot" })), />🤖B</);
  assert.match(html(h(HexAvatar, { label: "" })), />\?</);
});

test("decorative pieces are hidden from assistive tech", () => {
  for (const el of [h(PerspectiveGrid), h(ScanBar), h(StreamCursor), h(HexAvatar, { label: "pi" })]) {
    assert.match(html(el), /^<span[^>]*aria-hidden="true"|^<div[^>]*aria-hidden="true"/);
  }
});

test("Chamfer draws a tone border layer and puts the glow on an outer wrapper", () => {
  const out = html(h(Chamfer, { tone: "orange", glow: true, cut: 10 }, "x"));
  assert.match(out, /drop-shadow/);
  assert.match(out, /--cut:10px/);
  assert.match(out, /--cut:9px/);
  assert.match(out, /bg-tron-orange/);
});

test("scan bar and cursor stop under reduced motion", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.tron-scan,\s*\.tron-cursor \{\s*animation: none;/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/tron/tron.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the CSS**

Append to `app/globals.css`, before the global reduced-motion block from Task 3:
```css
/* Tron identity (components/tron). clip-path clips box-shadow, so chamfered
   and hex shapes draw their border as an outer clipped layer and get their
   glow from a drop-shadow filter on a wrapper. */
.tron-chamfer {
  clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut));
}

.tron-hex {
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
}

.tron-grid {
  background-image:
    linear-gradient(rgb(0 216 255 / 0.22) 1px, transparent 1px),
    linear-gradient(90deg, rgb(0 216 255 / 0.22) 1px, transparent 1px);
  background-size: 34px 34px;
  transform: perspective(260px) rotateX(62deg);
  transform-origin: bottom;
  -webkit-mask-image: linear-gradient(transparent, #000 70%);
  mask-image: linear-gradient(transparent, #000 70%);
}

.tron-scan {
  background: linear-gradient(90deg, transparent, var(--color-tron-orange), transparent) no-repeat;
  background-size: 50% 100%;
  animation: tron-scan 1.4s linear infinite;
}

@keyframes tron-scan {
  from { background-position: -50% 0; }
  to { background-position: 150% 0; }
}

.tron-cursor {
  display: inline-block;
  width: 0.5em;
  height: 1em;
  vertical-align: -0.15em;
  background: var(--color-tron-cyan);
  box-shadow: 0 0 8px var(--color-tron-cyan);
  animation: tron-blink 1s steps(2, start) infinite;
}

@keyframes tron-blink {
  to { visibility: hidden; }
}

@media (prefers-reduced-motion: reduce) {
  .tron-scan,
  .tron-cursor {
    animation: none;
  }
}
```

- [ ] **Step 4: Implement the components**

`components/tron/index.tsx`:
```tsx
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PerspectiveGrid({ className }: { className?: string }) {
  return <div aria-hidden className={cn("tron-grid pointer-events-none absolute inset-x-[-30%] bottom-[-14%] h-[42%]", className)} />;
}

export function ScanBar({ className }: { className?: string }) {
  return <span aria-hidden className={cn("tron-scan block h-px w-full", className)} />;
}

export function StreamCursor() {
  return <span aria-hidden className="tron-cursor" />;
}

function initials(label: string): string {
  const letters = Array.from(label.trim()).slice(0, 2).join("");
  return letters ? letters.toUpperCase() : "?";
}

export function HexAvatar({ label, active = false, className }: { label: string; active?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("tron-hex grid size-7 shrink-0 place-items-center p-px", active ? "bg-tron-cyan" : "bg-tron-line", className)}>
      <span className={cn("tron-hex grid size-full place-items-center font-hud text-[9px]", active ? "bg-[#00303a] text-white" : "bg-black text-tron-cyan")}>
        {initials(label)}
      </span>
    </span>
  );
}

const GLOW = {
  cyan: "drop-shadow-[0_0_6px_rgb(0_216_255/0.45)]",
  orange: "drop-shadow-[0_0_6px_rgb(255_154_0/0.5)]",
} as const;

type ChamferProps = {
  tone?: keyof typeof GLOW;
  glow?: boolean;
  cut?: number;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
};

export function Chamfer({ tone = "cyan", glow = false, cut = 12, className, innerClassName, children }: ChamferProps) {
  return (
    <div className={cn(glow && GLOW[tone], className)}>
      <div className={cn("tron-chamfer p-px", tone === "cyan" ? "bg-tron-cyan" : "bg-tron-orange")} style={{ "--cut": `${cut}px` } as CSSProperties}>
        <div className={cn("tron-chamfer bg-black", innerClassName)} style={{ "--cut": `${cut - 1}px` } as CSSProperties}>
          {children}
        </div>
      </div>
    </div>
  );
}
```
Note for Lot 1: a `filter` on the `Chamfer` wrapper makes it the containing block for `position:
fixed` descendants. Popovers opened from inside the composer must portal out; the Radix primitives
already do.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/tron/tron.test.mjs`
Expected: PASS. If the `--cut` assertions fail because React serializes the custom property as
`--cut:10px` with a different spacing, adjust only the regex, not the component.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `node_modules/.bin/tsc --noEmit && npm run lint`
```bash
git add app/globals.css components/tron
git commit -m "feat(ui): Tron identity pieces: grid, scan bar, cursor, hex avatar, chamfer"
```

---

### Task 7: `/dev/ui` gallery behind the proxy, docs, and the lot gate

**Files:**
- Create: `app/dev/ui/page.tsx`, `app/dev/ui/gallery.tsx`, `app/dev/ui/page.test.mjs`, `docs/agents/ui.md`
- Modify: `proxy.ts:103` (matcher), `AGENTS.md` (file map + topic note link)

**Interfaces:**
- Consumes: everything from Tasks 3–6.
- Produces: `GET /dev/ui` in dev (password-guarded like `/`), and a 404 in production.

- [ ] **Step 1: Write the failing tests**

Create `app/dev/ui/page.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
const proxy = await readFile(new URL("../../../proxy.ts", import.meta.url), "utf8");

test("the gallery is a 404 in production builds", () => {
  assert.match(page, /if \(process\.env\.NODE_ENV === "production"\) notFound\(\);/);
});

test("the proxy guards /dev like the app root, so the web password applies", () => {
  const matcher = proxy.match(/matcher: \[([^\]]*)\]/)?.[1] ?? "";
  for (const path of ['"/"', '"/login"', '"/api/:path*"', '"/dev/:path*"']) assert.ok(matcher.includes(path), path);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test app/dev/ui/page.test.mjs`
Expected: FAIL (page.tsx missing).

- [ ] **Step 3: Guard `/dev` in the proxy**

`proxy.ts` last line:
```ts
export const config = { matcher: ["/", "/login", "/api/:path*", "/dev/:path*"] };
```
A non-API path that fails auth already redirects to `/login` in `proxy()`, so no other change is
needed.

- [ ] **Step 4: Implement the page and the gallery**

`app/dev/ui/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
```

`app/dev/ui/gallery.tsx`:
```tsx
"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Chamfer, HexAvatar, PerspectiveGrid, ScanBar, StreamCursor } from "@/components/tron";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Gauge } from "@/components/ui/gauge";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Led } from "@/components/ui/led";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-tron-line pt-4">
      <h2 className="font-hud text-[10px] uppercase tracking-[0.16em] text-tron-cyan">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export function Gallery() {
  const [checked, setChecked] = useState(true);
  return (
    <main className="h-full overflow-y-auto bg-bg p-6 text-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="font-hud text-sm uppercase tracking-[0.2em] text-white">Tron UI — primitives</h1>

        <Section title="Buttons">
          <Button variant="primary">Send</Button>
          <Button>Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button size="sm">Small</Button>
          <Button size="icon" aria-label="Add"><Plus /></Button>
          <Button disabled>Disabled</Button>
        </Section>

        <Section title="Fields">
          <Input placeholder="Search sessions…" className="max-w-xs" />
          <Input aria-invalid placeholder="Invalid" className="max-w-xs" />
          <Textarea placeholder="Message…" className="max-w-md" />
        </Section>

        <Section title="Status">
          <Led status="running" label="Running" /> <Led status="done" label="Done" />
          <Led status="idle" label="Idle" /> <Led status="error" label="Error" />
          <Badge tone="orange">running</Badge><Badge tone="cyan">done</Badge><Badge tone="red">failed</Badge><Badge>idle</Badge>
          <Gauge value={42} label="Context" /><Gauge value={80} label="Context" /><Gauge value={97} label="Context" />
          <Kbd>⌘K</Kbd>
        </Section>

        <Section title="Overlays">
          <Dialog>
            <DialogTrigger asChild><Button>Dialog</Button></DialogTrigger>
            <DialogContent closeLabel="Close">
              <DialogHeader><DialogTitle>New session</DialogTitle><DialogDescription>Pick a working directory.</DialogDescription></DialogHeader>
              <Input placeholder="/home/ubuntu/Workspace" />
              <DialogFooter><Button variant="ghost">Cancel</Button><Button variant="primary">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild><Button>Sheet (right)</Button></DialogTrigger>
            <DialogContent side="right" closeLabel="Close">
              <DialogHeader><DialogTitle>Agents</DialogTitle><DialogDescription>Side sheet variant.</DialogDescription></DialogHeader>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Session</DropdownMenuLabel>
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Fork</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-tron-red">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild><Button>Popover</Button></PopoverTrigger>
            <PopoverContent>Model: claude-opus-5-5 · high</PopoverContent>
          </Popover>
          <Tooltip content="New session (Ctrl+Alt+N)"><Button size="icon" aria-label="New session"><Plus /></Button></Tooltip>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Switch checked={checked} onCheckedChange={setChecked} aria-label="Expand thinking" /> Expand thinking
          </label>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="file" className="w-full max-w-md">
            <TabsList><TabsTrigger value="file">models.ts</TabsTrigger><TabsTrigger value="term">terminal</TabsTrigger></TabsList>
            <TabsContent value="file" className="p-3 font-mono text-xs text-text-muted">export async function fetchModels() {"{…}"}</TabsContent>
            <TabsContent value="term" className="p-3 font-mono text-xs text-text-muted">$ npm test</TabsContent>
          </Tabs>
        </Section>

        <Section title="Identity">
          <HexAvatar label="pi" active /><HexAvatar label="ops" /><HexAvatar label="🤖bot" />
          <div className="w-64"><ScanBar /></div>
          <span className="text-sm">Streaming<StreamCursor /></span>
          <Chamfer tone="orange" glow className="max-w-sm" innerClassName="px-3 py-2 text-sm">User message, chamfered</Chamfer>
          <Chamfer glow className="w-full max-w-xl" innerClassName="px-3 py-3 text-sm text-text-muted">Composer shell — Message…</Chamfer>
          <div className="relative h-40 w-full overflow-hidden border border-tron-line"><PerspectiveGrid /></div>
        </Section>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test app/dev/ui/page.test.mjs`
Expected: PASS.
Run: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:30141/dev/ui`
Expected: `200` (no password configured on this host: `GET /api/web-auth` → `"enabled":false`).

- [ ] **Step 6: Document the design system**

Create `docs/agents/ui.md`:
```markdown
# UI: the Tron design system

Fork-only (not upstream). Spec: `docs/superpowers/specs/2026-10-08-tron-ui-design.md`.

- **One palette.** `app/globals.css` `:root` maps the legacy variables (`--bg`, `--accent`, …) to Tron values; `@theme` adds `tron-*` colors, `shadow-glow-*`, `font-hud/sans/mono`, `animate-tron-*`. There is no theme switch, `<html>` always has `class="dark"`.
- **Color = meaning.** Cyan: system / assistant / selection / focus. Orange: the user, running work, the primary action. Red: errors. Do not add hues.
- **Glow sparingly.** `shadow-glow-*` on focus, the active item, running state and the composer only.
- **Primitives live in `components/ui/`** (shadcn-style, Radix underneath, owned by us). Overlays always take a translated `closeLabel`. Every `animate-tron-*` pairs with `motion-reduce:animate-none` (pinned by `components/ui/radix.test.mjs`).
- **Chamfers and hexes:** `clip-path` clips `box-shadow`. Use `Chamfer` (`components/tron`): its border is a clipped outer layer and its glow a `drop-shadow` on a wrapper. A `filter` makes the wrapper the containing block for `position: fixed` children, so overlays inside must portal (Radix does).
- **Touch:** interactive primitives reach 44 px under `pointer-coarse:`. The 20 px `Switch` must sit in a ≥44 px label row.
- **`/dev/ui`** is the primitives gallery: 404 in production, behind the web password through the `proxy.ts` matcher (`/dev/:path*`).
```

`AGENTS.md`:
- under `## Topic Notes`, add after the `client-platform.md` bullet:
  `- [ui.md](docs/agents/ui.md): the Tron design system: single palette and tokens, color meaning, components/ui primitives, Chamfer/clip-path trap, reduced motion, /dev/ui. Files: app/globals.css, app/layout.tsx, lib/cn.ts, components/ui/**, components/tron/**, app/dev/ui/**.`
- in the File Map:
  - under `lib/`, add `  cn.ts                     clsx + tailwind-merge class joiner`
  - under `components/`, add
    `  ui/                      Tron primitives (Button, Input, Dialog/sheets, menus, Tabs, Switch, Led, Gauge…)` and
    `  tron/                    Tron identity pieces (PerspectiveGrid, ScanBar, StreamCursor, HexAvatar, Chamfer)`

- [ ] **Step 7: Lot gate**

Run, in order. Every command must pass:
```bash
node_modules/.bin/tsc --noEmit
npm run lint
env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test 2>&1 | tail -15
```
Expected: no new failures compared with the baseline recorded in Task 1.
Then **stop and ask the user** to:
- open `http://192.168.1.182:30141/dev/ui`: check every primitive, keyboard focus glow, Escape
  closes the dialog/menu, and the right sheet
- open `http://192.168.1.182:30141/`: the app is usable in the Tron palette
- approve the Playwright e2e run. It needs `npx playwright install chromium` (~150 MB) and a checkout
  without an active dev server (a separate worktree), per `e2e/run.mjs`.

- [ ] **Step 8: Commit**

```bash
git add proxy.ts app/dev docs/agents/ui.md
# stage AGENTS.md (recipe in Global Constraints)
git commit -m "feat(ui): dev-only /dev/ui primitives gallery behind the web password; design system notes"
```
