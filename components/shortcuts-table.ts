import type { EnterSendMode } from "../hooks/useEnterSendMode";
import { formatShortcut, type ShortcutPlatform } from "../lib/shortcut-label";

export interface ShortcutRow {
  keys: string;
  labelKey: string;
}

export interface ShortcutGroup {
  titleKey: string;
  rows: ShortcutRow[];
}

/**
 * The keyboard shortcuts dialog's rows. The composer's chords follow ChatInput's `sendShortcut`:
 * on a phone or in the Ctrl/Cmd+Enter mode, Enter sends only with Ctrl (Cmd on macOS, which
 * ChatInput accepts too), and Alt added to the send chord queues a follow-up while a run streams.
 */
export function shortcutGroups(sendMode: EnterSendMode, mobile: boolean, platform: ShortcutPlatform): ShortcutGroup[] {
  const chord = (...keys: string[]) => formatShortcut(keys, platform);
  const modifier = mobile || sendMode === "ctrlEnter" ? (platform === "mac" ? "Meta" : "Ctrl") : null;
  const followUp = modifier === "Meta" ? chord("Alt", "Meta", "Enter") : modifier === "Ctrl" ? chord("Ctrl", "Alt", "Enter") : chord("Alt", "Enter");
  return [
    {
      titleKey: "shortcuts.group.global",
      rows: [
        { keys: chord("Esc"), labelKey: "shortcuts.stopAgent" },
        { keys: chord("Ctrl", "Alt", "N"), labelKey: "shortcuts.newSession" },
        { keys: chord("?"), labelKey: "shortcuts.showHelp" },
        { keys: chord(platform === "mac" ? "Meta" : "Ctrl", "K"), labelKey: "shortcuts.commandPalette" },
      ],
    },
    {
      titleKey: "shortcuts.group.agents",
      rows: [
        { keys: `${chord("Alt", "ArrowDown")} / ${chord("Alt", "ArrowUp")}`, labelKey: "shortcuts.unreadAgent" },
        { keys: `${chord("Ctrl", "Alt", "1")}–9`, labelKey: "shortcuts.nthAgent" },
      ],
    },
    {
      titleKey: "shortcuts.group.composer",
      rows: [
        { keys: modifier ? chord(modifier, "Enter") : chord("Enter"), labelKey: "shortcuts.send" },
        { keys: followUp, labelKey: "shortcuts.followUp" },
      ],
    },
    {
      titleKey: "shortcuts.group.fileTabs",
      // ponytail: ←/→/Home/End read the same on every platform; the chord helper only maps ArrowUp/Down.
      rows: [{ keys: "← / → · Home / End", labelKey: "shortcuts.switchTab" }],
    },
  ];
}
