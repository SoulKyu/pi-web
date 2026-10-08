/** Client-safe keyboard chord labels for hints and the shortcuts list. */
export type ShortcutPlatform = "mac" | "other";

const MAC_MODIFIERS: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" };
const ARROWS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓" };

/** macOS, iOS and iPadOS (whose desktop-class UA says "Macintosh") use ⌃⌥⇧⌘ glyphs. */
export function detectShortcutPlatform(nav?: { platform?: string; userAgent?: string }): ShortcutPlatform {
  return /Mac|iPhone|iPad|iPod/.test(`${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`) ? "mac" : "other";
}

/** `["Ctrl", "Alt", "N"]` → `⌃⌥N` on mac, `Ctrl+Alt+N` elsewhere; arrows become ↑/↓, Esc and Enter stay words. */
export function formatShortcut(keys: readonly string[], platform: ShortcutPlatform): string {
  const labels = keys.map((key) => ARROWS[key] ?? (platform === "mac" ? MAC_MODIFIERS[key] ?? key : key));
  return labels.join(platform === "mac" ? "" : "+");
}
