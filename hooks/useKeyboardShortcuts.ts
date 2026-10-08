"use client";

import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Module-level registry — ChatWindow registers the abort handler here so that
// the global Esc listener in AppShell can call it without prop-drilling.
// ---------------------------------------------------------------------------
let globalAbortHandler: (() => void) | null = null;

/**
 * Register (or clear) the abort handler for the global Esc shortcut.
 * Call this from ChatWindow whenever agentRunning or handleAbort changes.
 */
export function registerAbortHandler(handler: (() => void) | null): void {
  globalAbortHandler = handler;
}

/**
 * The global Esc shortcut: stops the running agent, unless the key belongs to
 * something else. Typed into a textarea or input, it is that field's (ChatInput
 * has its own Esc logic). Marked handled already (`defaultPrevented`), it was
 * something nearer's: Settings, a menu or a viewer that closed on it. Those
 * listen on `document` or below and run before this one on `window`, and
 * closing them must not stop a run as well. Returns whether it stopped the
 * agent.
 */
export function handleGlobalEscape(event: KeyboardEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || !globalAbortHandler) return false;

  const tag = (event.target as HTMLElement | null)?.tagName;
  // Let textarea/input handle Esc internally (ChatInput menus / stop).
  if (tag === "TEXTAREA" || tag === "INPUT") return false;

  event.preventDefault();
  globalAbortHandler();
  return true;
}

/**
 * `?` opens the keyboard shortcuts dialog, unless it is typed into a field (input, textarea,
 * select, contenteditable: the composer, the terminal, a rename box), an input method is
 * composing, a dialog is open already, or something nearer took the key.
 */
export function isShortcutsHelpKey(event: KeyboardEvent, dialogOpen: boolean): boolean {
  if (event.key !== "?" || event.defaultPrevented || event.isComposing || event.metaKey || dialogOpen) return false;
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !target?.isContentEditable;
}

/**
 * Cmd+K (mac) / Ctrl+K (elsewhere) opens the command palette. Not with Alt or Shift, not while an
 * input method composes, not when something nearer took the key. Ctrl+K inside the terminal belongs
 * to the shell; Cmd+K is unused there. On mac Ctrl+K stays the text-field "kill line".
 */
export function isCommandPaletteKey(event: KeyboardEvent, platform: "mac" | "other"): boolean {
  if (event.key.toLowerCase() !== "k" || event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey) return false;
  const primary = platform === "mac" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!primary) return false;
  if (platform === "mac") return true;
  const target = event.target as Element | null;
  return !target?.closest?.(".terminal-xterm");
}

// ---------------------------------------------------------------------------
// Hook: global keyboard shortcuts
// ---------------------------------------------------------------------------

interface UseGlobalKeyboardShortcutsOptions {
  /** Called when Ctrl+Alt+N is pressed. Receives current cwd. */
  onNewSession?: (cwd: string) => void;
  /** The currently selected project directory (sidebar cwd). */
  activeCwd?: string | null;
  /** Called when `?` is pressed outside a field with no dialog open (see `isShortcutsHelpKey()`). */
  onShowShortcuts?: () => void;
}

/**
 * Register global keyboard shortcuts for the application.
 *
 * Shortcuts handled here:
 *   Esc          – stop the running agent (via module-level abort handler)
 *   Ctrl+Alt+N   – create a new session in the active project directory
 *   ?            – open the keyboard shortcuts dialog
 *
 * Note: Esc inside <textarea> or <input> is deliberately NOT handled here.
 * ChatInput manages its own Esc logic (closing slash / @ file menus, stopping
 * the agent when no menu is open) because it needs intimate knowledge of menu
 * state that is local to that component. Nor is an Esc something nearer
 * already handled (see `handleGlobalEscape()`).
 */
export function useGlobalKeyboardShortcuts(
  options: UseGlobalKeyboardShortcutsOptions,
): void {
  const { onNewSession, activeCwd, onShowShortcuts } = options;

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // ---- Esc: stop agent ----
      if (e.key === "Escape") {
        handleGlobalEscape(e);
        return;
      }

      // ---- ?: keyboard shortcuts dialog ----
      if (onShowShortcuts && isShortcutsHelpKey(e, document.querySelector('[role="dialog"]') !== null)) {
        e.preventDefault();
        onShowShortcuts();
        return;
      }

      // ---- Ctrl+Alt+N: new session ----
      if (e.key === "n" && e.ctrlKey && e.altKey) {
        if (!activeCwd || !onNewSession) return;
        e.preventDefault();
        onNewSession(activeCwd);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeCwd, onNewSession, onShowShortcuts]);
}
