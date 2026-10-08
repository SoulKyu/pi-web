"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useMemo, useRef } from "react";
import { useEnterSendMode } from "@/hooks/useEnterSendMode";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { detectShortcutPlatform } from "@/lib/shortcut-label";
import { openStackedDialog } from "@/lib/stacked-dialog";
import { backdropStyle, formStyle } from "./agents/dialog-styles";
import { shortcutGroups } from "./shortcuts-table";

/** The keyboard shortcuts list, opened by `?`, Settings › General and the mobile toolbar. z-index 1100 keeps it above Settings (1000). */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const sendMode = useEnterSendMode();
  const isMobile = useIsMobile();
  const groups = useMemo(() => shortcutGroups(sendMode, isMobile, detectShortcutPlatform(navigator)), [sendMode, isMobile]);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The shell re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, panelRef.current, () => onCloseRef.current()), []);

  // Two stops, the panel (it scrolls) and Close: Tab moves between them and never leaves the dialog.
  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    (document.activeElement === closeRef.current ? panelRef.current : closeRef.current)?.focus();
  };

  return (
    <div onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ ...backdropStyle, zIndex: 1100 }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="shortcuts-dialog"
        style={{ ...formStyle, width: "min(520px, 100%)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong id={titleId} style={{ fontSize: 14, color: "var(--text)" }}>{t("shortcuts.title")}</strong>
          <button ref={closeRef} type="button" onClick={onClose} title={t("i18n.close")} aria-label={t("i18n.close")} className="config-close-button">×</button>
        </div>
        {groups.map((group) => (
          <table key={group.titleKey} style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <caption style={{ textAlign: "left", padding: "4px 0", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{t(group.titleKey)}</caption>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.labelKey} style={{ borderTop: "1px solid var(--border)" }}>
                  <th scope="row" style={{ padding: "6px 12px 6px 0", textAlign: "left", fontWeight: "normal", whiteSpace: "nowrap", verticalAlign: "top" }}><kbd>{row.keys}</kbd></th>
                  <td style={{ padding: "6px 0", color: "var(--text)" }}>{t(row.labelKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
