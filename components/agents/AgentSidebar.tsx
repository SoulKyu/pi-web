"use client";

import { type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, SlidersHorizontal, Zap } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/hooks/useI18n";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import type { AgentDetail } from "@/lib/agents/agent-view";
import { loadAgentSidebarTab, saveAgentSidebarTab, type AgentSidebarTab } from "@/lib/agents/drawer-tab";
import { FileExplorer, type FileExplorerHandle } from "../FileExplorer";
import { CheckIcon, FolderIcon, PlusIcon, RefreshIcon, SearchIcon, TerminalIcon, UploadIcon } from "../SidebarIcons";
import { AgentProfileForm } from "./AgentProfileForm";
import { AgentTriggers } from "./AgentTriggers";
import { QueueTaskDialog } from "./QueueTaskDialog";

const TRIGGERS_POLL_MS = 10_000;

interface FileManagerAvailability { supported: boolean; reason: string | null; platform: string }

/** Copy of SessionSidebar's private useHeaderFit (upstream file left untouched): data-fit 0/1/2 drops labels to icons. */
function useHeaderFit(ref: RefObject<HTMLElement | null>, labels: string): void {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const fit = () => {
      for (const level of ["0", "1", "2"]) {
        header.dataset.fit = level;
        if (header.scrollWidth <= header.clientWidth) return;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(header);
    return () => observer.disconnect();
  }, [ref, labels]);
}

export function AgentSidebar({ agent, isMobile, status, onOpenFile, onOpenTerminal, onOpenSession, onProfileSaved, onDeleted, onThreadReset }: {
  agent: AgentDetail;
  isMobile: boolean;
  /** The right panel's content, shown as a Status tab on phones only. */
  status: ReactNode;
  onOpenFile: ComponentProps<typeof FileExplorer>["onOpenFile"];
  onOpenTerminal: (cwd: string) => void;
  onOpenSession: (sessionId: string) => void;
  onProfileSaved: (agent: AgentDetail) => void;
  onDeleted: () => void;
  onThreadReset: () => void;
}) {
  const { t } = useI18n();
  const name = agent.name;
  const tabs: AgentSidebarTab[] = isMobile ? ["files", "triggers", "settings", "status"] : ["files", "triggers", "settings"];
  const [tab, setTab] = useState<AgentSidebarTab>(() => loadAgentSidebarTab(isMobile));
  const tabRefs = useRef<Partial<Record<AgentSidebarTab, HTMLButtonElement | null>>>({});
  const headerRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<FileExplorerHandle>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [explorerKey, setExplorerKey] = useState(0);
  const [refreshDone, setRefreshDone] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [fileManager, setFileManager] = useState<FileManagerAvailability | null>(null);
  const [triggers, setTriggers] = useState<PublicTrigger[]>([]);
  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);

  // A phone turned desktop loses its Status tab.
  useEffect(() => { if (!isMobile && tab === "status") setTab("files"); }, [isMobile, tab]);

  const switchTab = useCallback((next: AgentSidebarTab) => {
    setTab(next);
    saveAgentSidebarTab(next);
  }, []);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = event.key === "Home" ? tabs[0]
      : event.key === "End" ? tabs[tabs.length - 1]
      : tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    switchTab(next);
    tabRefs.current[next]?.focus();
  };

  // Triggers and their tasks: independent reads, a failing one keeps the last list.
  const load = useCallback(async (signal?: AbortSignal) => {
    const read = async <T,>(url: string, key: string): Promise<T | null> => {
      try {
        const response = await fetch(url, { cache: "no-store", signal });
        const data = await response.json() as Record<string, unknown>;
        return response.ok && Array.isArray(data[key]) ? data[key] as T : null;
      } catch { return null; }
    };
    const [nextTriggers, nextTasks] = await Promise.all([
      read<PublicTrigger[]>(`/api/agent-ops/triggers?agent=${encodeURIComponent(name)}`, "triggers"),
      read<AgentTaskListItem[]>(`/api/agents/${encodeURIComponent(name)}/tasks`, "tasks"),
    ]);
    if (signal?.aborted) return;
    if (nextTriggers) setTriggers(nextTriggers);
    if (nextTasks) setTasks(nextTasks);
  }, [name]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), TRIGGERS_POLL_MS);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/open-in-explorer")
      .then((res) => res.ok ? res.json() as Promise<FileManagerAvailability> : null)
      .then((data) => { if (!cancelled && data) setFileManager(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const openInFileManager = async () => {
    try {
      const res = await fetch("/api/open-in-explorer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd: agent.home }) });
      if (res.ok) return;
      const data = await res.json().catch(() => ({})) as { error?: string };
      toast.error(data.error ?? `HTTP ${res.status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  const fileManagerUnavailable = fileManager?.supported === false;
  const fileManagerLabel = t(fileManager?.platform === "darwin" ? "sidebar.openInFinder" : fileManager?.platform === "win32" ? "sidebar.openInExplorer" : "sidebar.openInFileManager");

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); }, []);
  const refresh = () => {
    setExplorerKey((key) => key + 1);
    setRefreshDone(true);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setRefreshDone(false), 2000);
  };

  const labels: Record<AgentSidebarTab, string> = {
    files: t("agents.sidebar.files"), triggers: t("agents.sidebar.triggers"), settings: t("agents.sidebar.settings"), status: t("agents.sidebar.status"),
  };
  const icons: Record<AgentSidebarTab, ReactNode> = {
    files: <FolderIcon size={13} className="sidebar-tab-icon" />,
    triggers: <Zap size={13} aria-hidden="true" className="sidebar-tab-icon" />,
    settings: <SlidersHorizontal size={13} aria-hidden="true" className="sidebar-tab-icon" />,
    status: <Activity size={13} aria-hidden="true" className="sidebar-tab-icon" />,
  };
  useHeaderFit(headerRef, [...tabs.map((id) => labels[id]), t("agents.sidebar.newTask"), tab].join("\n"));

  const tool = (title: string, onClick: () => void, icon: ReactNode, disabled = false, done = false) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title} className={`sidebar-tool-button${done ? " is-done" : ""}`}>{icon}</button>
  );

  return (
    <div className="session-sidebar agent-sidebar">
      <div ref={headerRef} className="sidebar-header">
        <div className="sidebar-tabs-list" role="tablist" aria-label={t("agents.sidebar.tabsLabel")}>
          {tabs.map((id) => (
            <button
              key={id}
              ref={(element) => { tabRefs.current[id] = element; }}
              type="button"
              role="tab"
              id={`agent-sidebar-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`agent-sidebar-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className={`sidebar-tab${tab === id ? " is-selected" : ""}`}
              onClick={() => switchTab(id)}
              onKeyDown={handleTabKeyDown}
            >
              {icons[id]}
              <span className="sidebar-tab-label">{labels[id]}</span>
            </button>
          ))}
        </div>
        <span className="sidebar-header-spacer" />
        <button type="button" className="sidebar-new-button" onClick={() => setQueueOpen(true)} title={t("agents.sidebar.newTask")}>
          <PlusIcon size={12} />
          <span className="sidebar-new-label">{t("agents.sidebar.newTask")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (tab !== "files") {
              switchTab("files");
              setFileSearchOpen(true);
              return;
            }
            setFileSearchOpen((open) => !open);
          }}
          title={t("sidebar.searchFiles")}
          aria-label={t("sidebar.searchFiles")}
          aria-expanded={fileSearchOpen}
          className={`sidebar-search-toggle${fileSearchOpen ? " is-active" : ""}`}
        >
          <SearchIcon size={16} />
        </button>
      </div>

      <div id="agent-sidebar-panel-files" role="tabpanel" aria-labelledby="agent-sidebar-tab-files" hidden={tab !== "files"} className="sidebar-panel">
        <div className="sidebar-files-head">
          <div className="sidebar-files-actions" role="group" aria-label={t("sidebar.fileActions")}>
            {tool(t("terminal.open"), () => onOpenTerminal(agent.home), <TerminalIcon size={14} />)}
            {tool(fileManagerUnavailable ? t(fileManager?.reason === "remote" ? "sidebar.openInExplorerRemoteOnly" : "sidebar.openInExplorerUnsupported") : fileManagerLabel, () => { void openInFileManager(); }, <FolderIcon size={14} />, fileManagerUnavailable)}
            {tool(t("sidebar.uploadFilesTitle"), () => explorerRef.current?.openUploadPicker(), <UploadIcon size={14} />, uploadBusy)}
            {tool(t("sidebar.refreshExplorer"), refresh, refreshDone ? <CheckIcon size={14} /> : <RefreshIcon size={14} />, false, refreshDone)}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <FileExplorer
            ref={explorerRef}
            cwd={agent.home}
            onOpenFile={onOpenFile}
            refreshKey={explorerKey}
            onUploadBusyChange={setUploadBusy}
            changesCollapsed
            fileSearchOpen={fileSearchOpen}
            onFileSearchOpenChange={setFileSearchOpen}
          />
        </div>
      </div>

      <div id="agent-sidebar-panel-triggers" role="tabpanel" aria-labelledby="agent-sidebar-tab-triggers" hidden={tab !== "triggers"} className="sidebar-panel agent-sidebar-scroll">
        <AgentTriggers agentName={name} triggers={triggers} tasks={tasks} onOpenSession={onOpenSession} onChanged={() => void load()} />
      </div>

      <div id="agent-sidebar-panel-settings" role="tabpanel" aria-labelledby="agent-sidebar-tab-settings" hidden={tab !== "settings"} className="sidebar-panel agent-sidebar-scroll">
        <AgentProfileForm key={formKey} agent={agent} onSaved={onProfileSaved} onDeleted={onDeleted} onThreadReset={onThreadReset} onDiscard={() => setFormKey((key) => key + 1)} />
      </div>

      {isMobile && (
        <div id="agent-sidebar-panel-status" role="tabpanel" aria-labelledby="agent-sidebar-tab-status" hidden={tab !== "status"} className="sidebar-panel agent-sidebar-scroll">
          {status}
        </div>
      )}

      {queueOpen && typeof document !== "undefined" && createPortal(<QueueTaskDialog agentName={agent.name} onClose={() => setQueueOpen(false)} onQueued={() => setQueueOpen(false)} />, document.body)}
    </div>
  );
}
