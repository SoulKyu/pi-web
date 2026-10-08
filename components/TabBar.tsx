"use client";

import { useEffect, useMemo, useRef } from "react";
import { getFileIcon } from "./FileIcons";
import { tabLabelSuffixes } from "./tab-labels";
import { useI18n } from "@/hooks/useI18n";
import type { FileViewerDisplayMode, FileViewerState } from "@/lib/file-viewer-state";

export interface Tab {
  id: string;
  label: string;
  filePath: string;
  kind?: "terminal";
  closing?: boolean;
  /** false: no close button and middle-click ignored (the Agent pseudo-tab). */
  closable?: boolean;
  sourceSessionId?: string | null;
  initialDisplayMode?: FileViewerDisplayMode;
  /** PDF page requested by the link that opened this tab (`#page=N`). */
  page?: number;
  viewerState?: FileViewerState;
  viewerRevision?: number;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const suffixes = useMemo(() => tabLabelSuffixes(tabs), [tabs]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeTabId]);

  return (
    <div
      ref={listRef}
      role="tablist"
      style={{
        display: "flex",
        alignItems: "flex-end",
        background: "var(--bg-panel)",
        overflowX: "auto",
        flexShrink: 0,
        height: 36,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const suffix = suffixes.get(tab.id);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-label={tab.kind === "terminal" ? t("terminal.tabLabel", { name: tab.label }) : suffix ? t("files.tabWithDir", { name: tab.label, dir: suffix }) : tab.label}
            aria-selected={isActive}
            tabIndex={isActive || (!activeTabId && tabs[0].id === tab.id) ? 0 : -1}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectTab(tab.id);
              } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const index = tabs.findIndex((item) => item.id === tab.id);
                const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                onSelectTab(tabs[next].id);
                (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
              }
            }}
            onClick={() => onSelectTab(tab.id)}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              e.stopPropagation();
              if (!tab.closing && tab.closable !== false) onCloseTab(tab.id);
            }}
            className={isActive
              ? "bg-bg text-white shadow-[inset_0_-2px_0_var(--color-tron-cyan)] outline-none focus-visible:shadow-glow-cyan"
              : "bg-bg-panel text-text-muted outline-none hover:bg-bg-hover hover:text-text focus-visible:shadow-glow-cyan"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              paddingLeft: 12,
              paddingRight: 6,
              borderRight: "1px solid var(--border)",
              cursor: "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
              maxWidth: suffix ? 240 : 180,
              minWidth: 80,
              flexShrink: 0,
              userSelect: "none",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7, display: "flex", alignItems: "center" }}>
              {tab.kind === "terminal" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              ) : getFileIcon(tab.label, 13)}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: suffix ? "0 1 auto" : 1,
                minWidth: 0,
                fontWeight: isActive ? 500 : 400,
              }}
              title={tab.filePath}
            >
              {tab.label}
            </span>
            {suffix && (
              <span
                aria-hidden="true"
                title={tab.filePath}
                style={{
                  flex: "1 1000 auto",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                {suffix}
              </span>
            )}
            {tab.closable !== false && <button
              disabled={tab.closing}
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className="bg-transparent text-text-dim outline-none hover:bg-bg-hover hover:text-text focus-visible:shadow-glow-cyan"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 24, height: 24,
                border: "none",
                borderRadius: 0,
                padding: 0,
                flexShrink: 0,
                transition: "background 0.1s, color 0.1s",
              }}
               title={t(tab.kind === "terminal" ? "terminal.close" : "i18n.close")}
               aria-label={`${t(tab.kind === "terminal" ? "terminal.close" : "i18n.close")} ${tab.label}`}
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>}
          </div>
        );
      })}
    </div>
  );
}
