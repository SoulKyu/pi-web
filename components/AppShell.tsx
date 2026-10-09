"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isCommandPaletteKey, useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRailShortcuts } from "@/hooks/useRailShortcuts";
import { SessionSidebar, type SelectSessionOptions, type SessionSidebarControl } from "./SessionSidebar";
import { ChatWindow } from "./ChatWindow";
import { NewSessionContextBar, type NewSessionContextControl } from "./NewSessionContextBar";
import type { ChatScrollPosition } from "@/lib/chat-scroll-position";
import { FileViewer } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { openFileTab, saveFileViewerState } from "./file-tab-state";
import { SettingsPanel, SettingsSectionIcon } from "./SettingsPanel";
import { loadRailExpanded, RAIL_EXPANDED_KEY, savePref } from "./agents/conversation/prefs";
import { AgentRail, useAgentsPoll, useHealthPoll } from "./agents/AgentRail";
import { NewAgentDialog } from "./agents/NewAgentDialog";
import { InboxPanel } from "./agents/InboxPanel";
import { TasksBoard } from "./agents/TasksBoard";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { AgentAvatar } from "./agents/AgentAvatar";
import { AgentSidebar } from "./agents/AgentSidebar";
import { AgentSpaceRight } from "./agents/AgentSpaceRight";
import type { AgentDetail } from "@/lib/agents/agent-view";
import { ProjectTrustDialog, type ProjectTrustFailure } from "./ProjectTrustDialog";
import { BranchNavigator, hasSessionBranches } from "./BranchNavigator";
import { SystemPromptPanel } from "./SystemPromptPanel";
import { ToolDefinitionsPanel } from "./ToolDefinitionsPanel";
import { AgentSessionPanel } from "./AgentSessionPanel";
import { TerminalPanel } from "./TerminalPanel";
import { newTerminalTab, restoreTerminalTabs, TERMINAL_TABS_KEY, type TerminalTab } from "./terminal-tab-state";
import { useFontPreferences } from "@/hooks/useFontPreferences";
import { useI18n } from "@/hooks/useI18n";
import { ArrowDown, ArrowUp, Bot, Check, Ellipsis, FileText, GitBranch, History, Keyboard, LoaderCircle, PanelLeftClose, PanelLeftOpen, PanelRight, RefreshCw, Info, ShieldAlert, WandSparkles, Wrench, X } from "lucide-react";
import { TopBarButton, contextTone } from "./shell/TopBarButton";
import { CommandPalette, type PaletteCommand } from "./shell/CommandPalette";
import { Toaster, toast } from "sonner";
import { useShortcutPlatform } from "@/hooks/useShortcutPlatform";
import { formatShortcut } from "@/lib/shortcut-label";
import { Badge } from "./ui/badge";
import { Gauge } from "./ui/gauge";
import { Led } from "./ui/led";
import { cn } from "@/lib/cn";
import { useIsMobile, useIsNarrowMobile } from "@/hooks/useIsMobile";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useAudio } from "@/hooks/useAudio";
import { copyText } from "@/lib/clipboard";
import { sendAgentCommand } from "@/lib/agent-client";
import { getFileName } from "@/lib/file-paths";
import { buildAtMentionText, buildFileAtMentionsText, buildFileLineMentionText } from "@/lib/file-fuzzy";
import {
  claimExtensionAttentionNotification,
  shouldShowBrowserNotification,
  showBrowserNotification,
} from "@/lib/browser-notifications";
import { setupPushSubscription } from "@/lib/push-client";
import { getInitialNavigation, withTabOpen } from "@/lib/initial-navigation";
import { clearTabOpenSession, getTabOpen, setTabOpenNewSession, setTabOpenSession } from "@/lib/tab-session";
import { mergeCatalogRow } from "./session-catalog-helpers";
import { getDraft, rekeyDraft } from "@/lib/draft-store";
import {
  contextForCwd,
  type NewSessionContext,
  type NewSessionMove,
  type NewSessionOptions,
  type NewSessionTarget,
  type ProjectChoice,
} from "@/lib/new-session-context";
import {
  clearLastOpen,
  getLastOpenSession,
  setLastOpenSession,
  workspaceKeyOf,
} from "@/lib/workspace-memory";
import {
  getDefaultRightPanelWidth,
  getRightPanelMaxWidth,
  getSidebarMaxWidth,
  RIGHT_PANEL_FALLBACK_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/lib/panel-layout";
import type { BlockingExtensionUiRequest, SessionInfo, SessionTreeNode } from "@/lib/types";
import type { McpErrorResponse, ProjectTrustStatus } from "@/lib/api-types";
import type { ChatInputHandle } from "./ChatInput";
import type { AgentEndInfo, NewSessionChoices } from "@/hooks/useAgentSession";
import type { SessionStatsInfo } from "@/lib/pi-types";
import type { FileViewerState } from "@/lib/file-viewer-state";
import type { ToolEntry } from "@/lib/tool-presets";
import { getSessionFamily } from "@/lib/session-family";
import { getLastSettingsSection, settingsSectionRequiresProject, SETTINGS_SECTION_VALUES, type SettingsSection } from "@/lib/settings-navigation";

type SessionCopyField = "file" | "id" | "projectDir" | "gitBranch" | "gitWorktree";
type AutoNameStatus =
  | { kind: "idle" }
  | { kind: "naming" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const TOP_BAR_ICON_BUTTON_SIZE = 36;
const AGENT_PANEL_WIDTH = 420;

function parkedNewSessionDraftKey(cwd: string): string {
  return `parked-new:${cwd}`;
}

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialNavigation, setInitialNavigation] = useState(() => getInitialNavigation(searchParams));
  // Restore fonts even when Settings and the chat composer have not been opened.
  useFontPreferences();
  const { locale, t: translate } = useI18n();
  const isMobile = useIsMobile();
  const isNarrowMobile = useIsNarrowMobile();
  useViewportHeight();

  // Once the user has granted notification permission, register a Web Push
  // subscription so the server can notify backgrounded PWAs (notably iOS,
  // which suspends page JS and never receives the SSE completion event).
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    void setupPushSubscription(locale);
  }, [locale]);
  // Audio ownership lives here (not in ChatWindow) so the completion tone can
  // also fire for tasks finishing in a non-active workspace whose ChatWindow
  // is not mounted. ChatWindow receives the audio callbacks as props.
  const { soundEnabled, onSoundToggle, playDoneSound, unlockAudio, soundEnabledRef } = useAudio();
  const [quoteSelectionEnabled, setQuoteSelectionEnabled] = useState(false);
  useEffect(() => {
    try {
      setQuoteSelectionEnabled(localStorage.getItem("pi-quote-selection-enabled") === "true");
    } catch {
      // Browser storage is best-effort.
    }
  }, []);
  const handleQuoteSelectionChange = useCallback((enabled: boolean) => {
    setQuoteSelectionEnabled(enabled);
    try {
      localStorage.setItem("pi-quote-selection-enabled", String(enabled));
    } catch {
      // Keep the current page usable when storage is unavailable.
    }
  }, []);
  const notifiedAttentionRequestIdsRef = useRef(new Set<string>());
  const handleBackgroundTaskDone = useCallback(() => {
    if (soundEnabledRef.current) playDoneSound();
  }, [playDoneSound, soundEnabledRef]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  // Latest selection readable from async callbacks whose captured state is
  // stale (e.g. a delete that completes after the user navigated away).
  const selectedSessionRef = useRef(selectedSession);
  selectedSessionRef.current = selectedSession;
  const [sessionCatalog, setSessionCatalog] = useState<SessionInfo[]>([]);
  const handleSessionsChange = useCallback((sessions: SessionInfo[]) => {
    setSessionCatalog(sessions);
    // The sidebar hydrates metadata after the selected session has already
    // mounted. Merge that update into the active session without changing the
    // ChatWindow key or restarting its history load.
    setSelectedSession((current) => {
      if (!current) return current;
      const refreshed = sessions.find((session) => session.id === current.id);
      return refreshed ? mergeCatalogRow(current, refreshed) : current;
    });
  }, []);
  const sessionsWithSelection = useMemo(() => {
    if (!selectedSession) return sessionCatalog;
    return [
      ...sessionCatalog.filter((session) => session.id !== selectedSession.id),
      selectedSession,
    ];
  }, [selectedSession, sessionCatalog]);
  const activeSessionFamily = useMemo(
    () => getSessionFamily(sessionsWithSelection, selectedSession?.id),
    [selectedSession?.id, sessionsWithSelection],
  );
  const hasSubagentSessions = Boolean(activeSessionFamily?.subagents.length);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(() => new Set());
  const handleRunningSessionIdsChange = useCallback((ids: Set<string>) => {
    setRunningSessionIds((previous) => {
      if (previous.size === ids.size && [...ids].every((id) => previous.has(id))) return previous;
      return ids;
    });
  }, []);
  // The temporary id distinguishes consecutive fresh composers in one cwd.
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [newSessionDraftId, setNewSessionDraftId] = useState("initial");
  const activeNewSessionDraftKeyRef = useRef<string | null>(null);
  // The bar above a fresh composer (NewSessionContextBar): the sidebar reports
  // what it shows and carries out its moves, which remount the composer. Its
  // model and reasoning picks, as it last reported them, go along with the
  // draft to the composer that replaces it, which takes them once.
  const sidebarControlRef = useRef<SessionSidebarControl | null>(null);
  const [sidebarNewSessionContext, setSidebarNewSessionContext] = useState<NewSessionContext | null>(null);
  // The bar's last move until the sidebar reports that cwd (a commit later),
  // so the bar of the new composer shows the target's project, and a worktree
  // it just created, from its first frame.
  const newSessionMoveRef = useRef<NewSessionMove | null>(null);
  const handleSidebarNewSessionContext = useCallback((context: NewSessionContext | null) => {
    if (context && context.cwd === newSessionMoveRef.current?.cwd) newSessionMoveRef.current = null;
    setSidebarNewSessionContext(context);
  }, []);
  const newSessionBarFocusRef = useRef<NewSessionContextControl | null>(null);
  const newSessionChoicesRef = useRef<NewSessionChoices | null>(null);
  const [carriedNewSessionChoices, setCarriedNewSessionChoices] = useState<NewSessionChoices | null>(null);
  const handleNewSessionChoicesChange = useCallback((choices: NewSessionChoices) => {
    newSessionChoicesRef.current = choices;
    setCarriedNewSessionChoices(null);
  }, []);
  const [initialCwdStatus, setInitialCwdStatus] = useState<"idle" | "validating" | "ready" | "error">(
    () => initialNavigation.requestedCwd ? "validating" : "idle",
  );
  const [initialCwdError, setInitialCwdError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const sessionScrollPositionsRef = useRef(new Map<string, ChatScrollPosition>());
  const handleSessionScrollPositionChange = useCallback((sessionId: string, position: ChatScrollPosition) => {
    sessionScrollPositionsRef.current.set(sessionId, position);
  }, []);
  const [searchTarget, setSearchTarget] = useState<{ sessionId: string; entryId: string; blockIndex?: number } | null>(null);
  const handleSearchTargetHandled = useCallback((target: { sessionId: string; entryId: string }) => {
    setSearchTarget((current) => current === target ? null : current);
  }, []);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(initialNavigation.agentName);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [agentUnreadMarker, setAgentUnreadMarker] = useState<string | null>(null);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [tasksBoardOpen, setTasksBoardOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const shortcutsFromMobileLayerRef = useRef(false);
  const pendingAgentRef = useRef<{ sessionId: string; agentName: string } | null>(null);
  const agentMountOpenedRef = useRef(false);
  const { agents, agentsHomeDir, paused: allPaused, error: agentsError, lastOkAt: agentsLastOkAt, reload: reloadAgents } = useAgentsPoll();
  const healthState = useHealthPoll();
  const [railExpanded, setRailExpanded] = useState(loadRailExpanded);
  const changeRailExpanded = useCallback((next: boolean) => {
    setRailExpanded(next);
    savePref(RAIL_EXPANDED_KEY, next);
  }, []);
  const handToAgents = useMemo(() => agents.map(({ name, paused, running }) => ({ name, paused: paused || allPaused, running })), [agents, allPaused]);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [projectTrust, setProjectTrust] = useState<ProjectTrustStatus | null>(null);
  const [projectTrustDialogOpen, setProjectTrustDialogOpen] = useState(false);
  const [projectTrustBusy, setProjectTrustBusy] = useState(false);
  const [projectTrustError, setProjectTrustError] = useState<ProjectTrustFailure | null>(null);
  // Fork: the sidebar starts collapsed everywhere, so the chat gets the width;
  // ?sidebar=collapsed is then the default. The toggle opens it.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const desktopSidebarOpenRef = useRef(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const rightPanelFullWidth = rightPanelOpen && rightPanelExpanded && !isMobile;
  useEffect(() => {
    if (!rightPanelOpen || isMobile) setRightPanelExpanded(false);
  }, [rightPanelOpen, isMobile]);
  const [mobileToolbarMoreOpen, setMobileToolbarMoreOpen] = useState(false);
  const [mobileSidebarReady, setMobileSidebarReady] = useState(false);
  const sidebarWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const rightPanelWidthRef = useRef(RIGHT_PANEL_FALLBACK_WIDTH);
  const getResponsiveRightPanelWidth = useCallback(
    () => typeof window === "undefined"
      ? RIGHT_PANEL_FALLBACK_WIDTH
      : getDefaultRightPanelWidth(window.innerWidth),
    [],
  );
  const getResponsiveSidebarMaxWidth = useCallback(
    () => typeof window === "undefined"
      ? SIDEBAR_MAX_WIDTH
      : getSidebarMaxWidth({
        viewportWidth: window.innerWidth,
        rightPanelOpen,
        rightPanelWidth: rightPanelWidthRef.current,
      }),
    [rightPanelOpen],
  );
  const getResponsiveRightPanelMaxWidth = useCallback(
    () => typeof window === "undefined"
      ? RIGHT_PANEL_MAX_WIDTH
      : getRightPanelMaxWidth({
        viewportWidth: window.innerWidth,
        sidebarOpen,
        sidebarWidth: sidebarWidthRef.current,
      }),
    [sidebarOpen],
  );
  const sidebarResizer = useResizablePanel({
    ariaLabel: translate("layout.resizeSidebar"),
    cssVariable: "--sidebar-width",
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    getMaxWidth: getResponsiveSidebarMaxWidth,
    growthDirection: "right",
    maxWidth: SIDEBAR_MAX_WIDTH,
    minWidth: SIDEBAR_MIN_WIDTH,
    storageKey: "pi-sidebar-width",
    widthRef: sidebarWidthRef,
  });
  const rightPanelResizer = useResizablePanel({
    ariaLabel: translate("layout.resizeFilePanel"),
    cssVariable: "--right-panel-width",
    defaultWidth: RIGHT_PANEL_FALLBACK_WIDTH,
    getDefaultWidth: getResponsiveRightPanelWidth,
    getMaxWidth: getResponsiveRightPanelMaxWidth,
    growthDirection: "left",
    maxWidth: RIGHT_PANEL_MAX_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    storageKey: "pi-right-panel-width",
    widthRef: rightPanelWidthRef,
  });
  const reclampSidebarWidth = sidebarResizer.reclampWidth;
  const reclampRightPanelWidth = rightPanelResizer.reclampWidth;
  // On mobile the sidebar is an overlay drawer; hide it by default so the chat
  // is visible on load. Runs once the breakpoint resolves after hydration.
  // Mobile drawer actions must not change the remembered desktop preference.
  useEffect(() => {
    setSidebarOpen(isMobile ? false : desktopSidebarOpenRef.current);
  }, [isMobile]);
  useEffect(() => {
    setMobileSidebarReady(true);
  }, []);
  useEffect(() => {
    if (!rightPanelOpen) return;
    reclampSidebarWidth();
    reclampRightPanelWidth();
  }, [reclampRightPanelWidth, reclampSidebarWidth, rightPanelOpen]);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const [pendingQuotePrompt, setPendingQuotePrompt] = useState<{ sessionId: string; text: string } | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const mobileToolbarRef = useRef<HTMLDivElement>(null);
  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const [branchSwitchLocked, setBranchSwitchLocked] = useState(false);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);
  const sessionHasBranches = hasSessionBranches(branchTree);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void, locked: boolean) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    setBranchSwitchLocked(locked);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [systemTools, setSystemTools] = useState<ToolEntry[] | null>(null);
  const [systemInfoLoading, setSystemInfoLoading] = useState(false);
  const systemInfoLoaderRef = useRef<(() => Promise<void>) | null>(null);
  const systemInfoLoadIdRef = useRef(0);
  const systemBtnRef = useRef<HTMLButtonElement>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
    setSystemInfoLoading(false);
  }, []);

  const handleSystemToolsChange = useCallback((tools: ToolEntry[] | null) => {
    setSystemTools(tools);
  }, []);

  const handleSystemInfoLoaderChange = useCallback((loader: (() => Promise<void>) | null) => {
    systemInfoLoadIdRef.current += 1;
    systemInfoLoaderRef.current = loader;
    setSystemInfoLoading(false);
  }, []);

  // Session stats (tokens + cost) — populated by ChatWindow, displayed in top bar
  const [sessionStats, setSessionStats] = useState<SessionStatsInfo | null>(null);
  const [autoNameStatus, setAutoNameStatus] = useState<AutoNameStatus>({ kind: "idle" });
  const autoNameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef<string | null>(selectedSession?.id ?? null);
  activeSessionIdRef.current = selectedSession?.id ?? null;
  const handleSessionStatsChange = useCallback((stats: SessionStatsInfo | null) => {
    setSessionStats(stats);
  }, []);
  const [copiedSessionField, setCopiedSessionField] = useState<SessionCopyField | null>(null);
  const sessionCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopySessionField = useCallback((field: SessionCopyField, value: string) => {
    void copyText(value).then(() => {
      if (sessionCopyTimerRef.current) clearTimeout(sessionCopyTimerRef.current);
      setCopiedSessionField(field);
      sessionCopyTimerRef.current = setTimeout(() => setCopiedSessionField(null), 1400);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (sessionCopyTimerRef.current) clearTimeout(sessionCopyTimerRef.current);
      if (autoNameTimerRef.current) clearTimeout(autoNameTimerRef.current);
    };
  }, []);

  // Context usage — populated by ChatWindow, displayed in top bar
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const handleContextUsageChange = useCallback((usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => {
    setContextUsage(usage);
  }, []);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"agents" | "branches" | "system" | "tools" | "session" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!sessionHasBranches) {
      setActiveTopPanel((panel) => panel === "branches" ? null : panel);
    }
  }, [sessionHasBranches]);

  useEffect(() => {
    if (!hasSubagentSessions) {
      setActiveTopPanel((panel) => panel === "agents" ? null : panel);
    }
  }, [hasSubagentSessions]);

  useEffect(() => {
    if (rightPanelFullWidth) setActiveTopPanel(null);
  }, [rightPanelFullWidth]);

  const toggleTopPanel = useCallback((
    panel: "agents" | "branches" | "system" | "tools" | "session",
    keepMobileToolbarOpen = false,
  ) => {
    if (isMobile) setSidebarOpen(false);
    setActiveTopPanel((cur) => cur === panel ? null : panel);
    if (isMobile && isNarrowMobile && keepMobileToolbarOpen) setMobileToolbarMoreOpen(true);
  }, [isMobile, isNarrowMobile]);

  const handleSystemInfoToggle = useCallback((
    panel: "system" | "tools",
    keepMobileToolbarOpen = false,
  ) => {
    const opening = activeTopPanel !== panel;
    toggleTopPanel(panel, keepMobileToolbarOpen);
    if (!opening || systemInfoLoading) return;

    const load = systemInfoLoaderRef.current;
    if (!load) return;
    const loadId = ++systemInfoLoadIdRef.current;
    setSystemInfoLoading(true);
    void load().catch((error) => {
      console.error("Failed to load system information:", error);
    }).finally(() => {
      if (systemInfoLoadIdRef.current === loadId) {
        setSystemInfoLoading(false);
      }
    });
  }, [activeTopPanel, systemInfoLoading, toggleTopPanel]);

  const openSessionStatsPanel = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
    setMobileToolbarMoreOpen(false);
    setActiveTopPanel("session");
  }, [isMobile]);

  // The composer opens Settings too: a bare /mcp opens Settings › MCP (useAgentSession).
  const openSettingsSection = useCallback((section: SettingsSection) => {
    setSettingsSection(section);
  }, []);

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) {
      setActiveTopPanel(null);
      setMobileToolbarMoreOpen(false);
    }
    setSidebarOpen((open) => {
      const next = !open;
      if (!isMobile) desktopSidebarOpenRef.current = next;
      return next;
    });
  }, [isMobile]);

  const handleMobileToolbarMoreToggle = useCallback(() => {
    setSidebarOpen(false);
    setActiveTopPanel(null);
    setMobileToolbarMoreOpen((open) => !open);
  }, []);

  const handleRightPanelToggle = useCallback(() => {
    if (isMobile) {
      setSidebarOpen(false);
      setActiveTopPanel(null);
      setMobileToolbarMoreOpen(false);
    }
    setRightPanelOpen((open) => !open);
  }, [isMobile]);

  const handleRightPanelExpandToggle = useCallback(() => {
    setActiveTopPanel(null);
    setRightPanelExpanded((expanded) => !expanded);
  }, []);

  useEffect(() => {
    if (!mobileToolbarMoreOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const toolbar = mobileToolbarRef.current;
      if (toolbar && event.composedPath().includes(toolbar)) return;
      setMobileToolbarMoreOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMobileToolbarMoreOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [mobileToolbarMoreOpen]);

  useEffect(() => {
    setMobileToolbarMoreOpen(false);
  }, [isMobile, isNarrowMobile, selectedSession?.id, newSessionDraftId]);

  useEffect(() => {
    if (!activeTopPanel || !topBarRef.current) return;
    const update = () => {
      const topBarRect = topBarRef.current!.getBoundingClientRect();
      if (activeTopPanel === "agents") {
        setTopPanelPos({
          top: topBarRect.bottom,
          left: topBarRect.left,
          width: Math.min(AGENT_PANEL_WIDTH, topBarRect.width),
        });
        return;
      }
      setTopPanelPos({ top: topBarRect.bottom, left: topBarRect.left, width: topBarRect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel, isMobile]);

  // Files unmount when inactive; workspace terminals stay mounted until closed.
  const AGENT_TAB_ID = "agent"; // pseudo-tab: never persisted
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [terminalsRestored, setTerminalsRestored] = useState(false);
  const panelTabs: Tab[] = [...(activeAgent && agentDetail ? [{ id: AGENT_TAB_ID, label: agentDetail.name, filePath: agentDetail.home, closable: false }] : []), ...fileTabs, ...terminalTabs.map((tab) => ({
    id: tab.id,
    label: getFileName(tab.cwd) || tab.cwd,
    filePath: tab.cwd,
    kind: "terminal" as const,
    closing: Boolean(tab.closing),
  }))];

  useEffect(() => {
    try {
      const saved = restoreTerminalTabs(window.sessionStorage.getItem(TERMINAL_TABS_KEY));
      setTerminalTabs(saved.tabs);
      if (saved.activeId) {
        setActiveFileTabId(saved.activeId);
        setRightPanelOpen(saved.open);
      }
    } catch { /* storage is optional */ }
    setTerminalsRestored(true);
  }, []);

  useEffect(() => {
    if (!terminalsRestored) return;
    try {
      window.sessionStorage.setItem(TERMINAL_TABS_KEY, JSON.stringify({
        tabs: terminalTabs.map(({ id, cwd }) => ({ id, cwd })),
        activeId: activeFileTabId === AGENT_TAB_ID ? null : activeFileTabId,
        open: rightPanelOpen,
      }));
    } catch { /* storage is optional */ }
  }, [terminalTabs, activeFileTabId, rightPanelOpen, terminalsRestored]);

  const handleFileViewerStateChange = useCallback((
    tabId: string,
    viewerRevision: number,
    viewerState: FileViewerState,
  ) => {
    setFileTabs((prev) => saveFileViewerState(prev, tabId, viewerRevision, viewerState));
  }, []);

  // Same @mention format as the chat input's @ autocomplete, so the agent's
  // read tool resolves it the same way (it strips the @ prefix).
  const handleAtMention = useCallback((relativePath: string, isDir: boolean) => {
    chatInputRef.current?.insertText(buildAtMentionText(relativePath, isDir));
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);

  const handleAtMentions = useCallback((relativePaths: string[]) => {
    const mentions = buildFileAtMentionsText(relativePaths);
    if (mentions) chatInputRef.current?.insertText(mentions);
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);

  const handleFileLineMention = useCallback((relativePath: string, startLine: number, endLine: number) => {
    chatInputRef.current?.insertText(buildFileLineMentionText(relativePath, startLine, endLine));
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);

  const initialSessionId = initialNavigation.sessionId;
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const activeProjectKeyRef = useRef<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !initialSessionId);
  // sessionStorage is empty during SSR. Applying the tab's remembered session
  // in the useState initializer made the first client tree differ from the
  // server HTML (sidebar "select project" vs ""). Restore after mount instead.
  useLayoutEffect(() => {
    const next = withTabOpen(initialNavigation, getTabOpen());
    if (next === initialNavigation) return;
    setInitialNavigation(next);
    if (next.sessionId) setInitialSessionRestored(false);
  }, [initialNavigation]);
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);
  // Guards the async workspace restore so a slow response from an earlier
  // switch cannot resurrect a session into a project the user already left.
  const workspaceRestoreTokenRef = useRef(0);

  const invalidateWorkspaceRestore = useCallback(() => {
    workspaceRestoreTokenRef.current += 1;
  }, []);

  // Persist every active-session transition, including new and forked sessions
  // that bypass the sidebar selection handler. Transient sessions do not yet
  // carry projectKey, so use the active project identity until hydration.
  // The workspace memory is shared by every tab; the tab memory keeps this
  // tab's own session so a reload does not follow another tab's last pick.
  // New session is a selection too: remember the composer cwd so reload stays
  // on that UI instead of resurrecting the previous chat.
  useEffect(() => {
    if (selectedSession) {
      const projectKey = selectedSession.projectKey
        ?? activeProjectKeyRef.current
        ?? workspaceKeyOf(selectedSession);
      setLastOpenSession(projectKey, selectedSession.id);
      if (pendingAgentRef.current?.sessionId !== selectedSession.id) setTabOpenSession(selectedSession.id); // an agent thread is not an ordinary session on a bare reload
      return;
    }
    if (newSessionCwd) setTabOpenNewSession(newSessionCwd);
  }, [newSessionCwd, selectedSession]);

  useEffect(() => {
    const requestedCwd = initialNavigation.requestedCwd;
    if (!requestedCwd) return;

    const controller = new AbortController();
    setInitialCwdStatus("validating");
    setInitialCwdError(null);

    void fetch("/api/cwd/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: requestedCwd }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { cwd?: string; error?: string };
        if (!response.ok || !data.cwd) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        // The sidebar will notify us when it adopts this cwd. Avoid remounting
        // the just-created empty chat during that initial synchronization.
        suppressCwdBumpRef.current = true;
        const draftId = `initial:${requestedCwd}`;
        setNewSessionDraftId(draftId);
        activeNewSessionDraftKeyRef.current = `new:${draftId}:${data.cwd}`;
        setNewSessionCwd(data.cwd);
        setInitialCwdStatus("ready");
        if (!new URLSearchParams(window.location.search).get("cwd")) {
          router.replace(`?cwd=${encodeURIComponent(data.cwd)}`, { scroll: false });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setInitialCwdError(error instanceof Error ? error.message : String(error));
        setInitialCwdStatus("error");
      });

    return () => controller.abort();
  }, [initialNavigation, router]);

  // Restore the workspace's last open session after switching to it. Called
  // from handleCwdChange once the outgoing context has been reset. The session
  // is looked up against the live list so a deleted or drifted session falls
  // back to the default welcome page instead of erroring.
  const restoreWorkspaceContext = useCallback((projectKey: string, cwd: string) => {
    const token = ++workspaceRestoreTokenRef.current;
    const lastOpenSessionId = getLastOpenSession(projectKey);
    if (!lastOpenSessionId) return;
    const adopt = (d: { sessions: SessionInfo[] } | null) => {
      if (token !== workspaceRestoreTokenRef.current) return; // stale switch
      const s = d?.sessions.find((x) => x.id === lastOpenSessionId);
      if (!s) {
        // The list loaded but the remembered session is gone — forget it.
        // When the list itself failed (d === null) keep the memory so a
        // later switch retries the restore.
        if (d) clearLastOpen(projectKey);
        return;
      }
      if (workspaceKeyOf(s) !== projectKey) {
        // Defensive: the remembered session drifted out of this workspace.
        clearLastOpen(projectKey);
        return;
      }
      // Keep the temporary composer's draft in its cwd, even when the
      // remembered session belongs to another worktree of this project.
      const activeDraftKey = activeNewSessionDraftKeyRef.current;
      if (activeDraftKey) {
        rekeyDraft(activeDraftKey, parkedNewSessionDraftKey(cwd));
      }
      activeNewSessionDraftKeyRef.current = null;
      // Selecting the session must remount the chat with the session
      // present: useAgentSession loads content in a mount-only effect, so
      // the null-session welcome mount from the switch would never load
      // the restored session's messages.
      setSelectedSession(s);
      setSessionKey((k) => k + 1);
      if (new URLSearchParams(window.location.search).get("session") !== s.id) {
        router.replace(`?session=${encodeURIComponent(s.id)}`, { scroll: false });
      }
    };
    // Fast path: the sidebar already delivered the catalogue — restore
    // without waiting on a fresh /api/sessions round trip.
    if (sessionCatalog.length > 0) {
      adopt({ sessions: sessionCatalog });
      return;
    }
    void fetch("/api/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then(adopt)
      .catch(() => {
        // Network hiccup: keep the remembered session for a later retry.
      });
  }, [router, sessionCatalog]);

  const handleCwdChange = useCallback((
    cwd: string | null,
    projectRoot?: string | null,
    projectKey?: string | null,
  ) => {
    invalidateWorkspaceRestore();
    const currentFreshCwd = newSessionCwd ?? activeCwd;
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount).
    if (!cwd) return;
    const newProject = projectKey ?? projectRoot ?? cwd;
    const currentProject = activeProjectKeyRef.current
      ?? (selectedSession ? workspaceKeyOf(selectedSession) : null);
    activeProjectKeyRef.current = newProject;

    // Keep the project identity in sync during the initial URL restore without
    // remounting the just-created or restored chat.
    if (suppressCwdBumpRef.current) {
      suppressCwdBumpRef.current = false;
      return;
    }
    // The server may hydrate a normalized key after a custom cwd is already
    // active. Updating identity for the exact same cwd is not a user switch.
    if (currentFreshCwd === cwd && currentProject !== newProject) return;
    // Existing sessions stay open when the worktree selector moves within the
    // same project. A fresh composer must remount when its effective cwd moves,
    // otherwise its already-created runtime would keep sending to the old cwd.
    if (
      currentProject === newProject
      && (selectedSession !== null || currentFreshCwd === cwd)
    ) {
      return;
    }
    // Close any session that belongs to a different project — it no longer
    // matches the selected project directory.
    const previousDraftKey = activeNewSessionDraftKeyRef.current;
    if (previousDraftKey && currentFreshCwd) {
      rekeyDraft(previousDraftKey, parkedNewSessionDraftKey(currentFreshCwd));
    }
    const draftId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const draftKey = `new:${draftId}:${cwd}`;
    rekeyDraft(parkedNewSessionDraftKey(cwd), draftKey);
    setNewSessionDraftId(draftId);
    activeNewSessionDraftKeyRef.current = draftKey;
    setSelectedSession(null);
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setBranchSwitchLocked(false);
    setSystemPrompt(null);
    setSystemTools(null);
    setSystemInfoLoading(false);
    setActiveTopPanel(null);
    if (currentProject !== newProject) {
      // File tabs are keyed by absolute path, so tabs opened in the previous
      // project must not linger. Same-project worktree switches keep them.
      setFileTabs([]);
      if (!activeFileTabId || activeFileTabId.startsWith("file:")) {
        setActiveFileTabId(null);
        setRightPanelOpen(false);
      }
      // Restore the workspace we switched to: its last open session, or keep
      // the default welcome page when none is remembered.
      restoreWorkspaceContext(newProject, cwd);
    }
    router.replace(typeof window !== "undefined" ? window.location.pathname : "/", { scroll: false });
  }, [activeCwd, activeFileTabId, invalidateWorkspaceRestore, newSessionCwd, router, selectedSession, restoreWorkspaceContext]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false, entryId?: string, blockIndex?: number, options?: SelectSessionOptions) => {
    setSearchTarget(entryId ? { sessionId: session.id, entryId, blockIndex } : null);
    invalidateWorkspaceRestore();
    const activeDraftKey = activeNewSessionDraftKeyRef.current;
    const activeDraftCwd = newSessionCwd ?? (selectedSession === null ? activeCwd : null);
    if (activeDraftKey && activeDraftCwd) {
      rekeyDraft(activeDraftKey, parkedNewSessionDraftKey(activeDraftCwd));
    }
    activeNewSessionDraftKeyRef.current = null;
    // Adopt an explicitly selected session before the sidebar reports its cwd.
    const projectKey = workspaceKeyOf(session);
    if (activeProjectKeyRef.current !== projectKey) {
      setFileTabs([]);
      if (!activeFileTabId || activeFileTabId.startsWith("file:")) {
        setActiveFileTabId(null);
        setRightPanelOpen(false);
      }
      setActiveTopPanel(null);
    }
    activeProjectKeyRef.current = projectKey;
    // Re-clicking the already-open session must not remount the chat and
    // re-run the full load/positioning cycle. Only skip when the effective
    // cwd context already matches — otherwise a pending cwd move still needs
    // the full re-select flow.
    if (!isRestore && selectedSession) {
      const sameProject =
        workspaceKeyOf(selectedSession) === workspaceKeyOf(session);
      if (selectedSession.id === session.id && sameProject) {
        if (isMobile) setSidebarOpen(false);
        return;
      }
    }
    setNewSessionCwd(null);
    setSelectedSession(session);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setBranchSwitchLocked(false);
    branchLeafChangeFnRef.current = null;
    setSystemPrompt(null);
    setSystemTools(null);
    setSystemInfoLoading(false);
    setInitialSessionRestored(true);
    // On mobile, collapse the overlay drawer so the chat is revealed after pick
    // (unless the sidebar still has something to show: a fork's row and toast).
    if (isMobile && !isRestore && !options?.keepSidebarOpen) setSidebarOpen(false);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
    }
    // Kept on a match (repeated opens of one thread are idempotent); cleared only when another session is picked.
    const pending = pendingAgentRef.current;
    const agentSession = pending?.sessionId === session.id;
    if (!agentSession) {
      pendingAgentRef.current = null;
      setActiveAgent(null);
    }
    // Skip router.replace when the URL already has this session — calling
    // replace in production Next.js triggers a Suspense remount loop.
    // Tab-memory restore lands on `/` and must write `?session=` so reload
    // and copy-link keep this session.
    if (agentSession) {
      router.replace(`?agent=${encodeURIComponent(pending.agentName)}`, { scroll: false });
    } else if (!isRestore || new URLSearchParams(window.location.search).get("session") !== session.id) {
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    }
  }, [activeCwd, activeFileTabId, invalidateWorkspaceRestore, router, isMobile, newSessionCwd, selectedSession]);

  const handleNewSession = useCallback((sessionId: string, cwd: string, projectKey?: string | null, options?: NewSessionOptions) => {
    invalidateWorkspaceRestore();
    const draftKey = `new:${sessionId}:${cwd}`;
    // Leaving a fresh composer for another cwd parks its draft there, as a
    // workspace switch does; New in the same cwd still starts empty. The bar
    // above the composer moves the composer instead: its draft (the live
    // text, as promoteNewSession takes it) and its model picks go along.
    const activeDraftKey = activeNewSessionDraftKeyRef.current;
    const activeDraftCwd = newSessionCwd ?? (selectedSession === null ? activeCwd : null);
    if (options?.carryComposer && selectedSession === null && activeDraftKey) {
      const input = chatInputRef.current;
      if (input) input.rekeyDraft(activeDraftKey, draftKey);
      else rekeyDraft(activeDraftKey, draftKey);
      setCarriedNewSessionChoices(newSessionChoicesRef.current);
    } else if (activeDraftKey && activeDraftCwd && activeDraftCwd !== cwd) {
      rekeyDraft(activeDraftKey, parkedNewSessionDraftKey(activeDraftCwd));
    }
    // Adopt the target project before the sidebar reports its cwd, as an
    // explicit session pick does: a new session in another project (a group's
    // "+" in the sidebar) closes the previous project's file tabs. Without a
    // key (Ctrl+Alt+N) the current cwd keeps its project.
    const targetProject = projectKey ?? (cwd === activeCwd ? activeProjectKeyRef.current : null) ?? cwd;
    if (activeProjectKeyRef.current !== targetProject) {
      setFileTabs([]);
      if (!activeFileTabId || activeFileTabId.startsWith("file:")) {
        setActiveFileTabId(null);
        setRightPanelOpen(false);
      }
    }
    activeProjectKeyRef.current = targetProject;
    // A draft parked in this cwd comes back, unless one was carried here: it
    // stays parked for the next time, never merged into what was carried.
    if (!getDraft(draftKey)) rekeyDraft(parkedNewSessionDraftKey(cwd), draftKey);
    activeNewSessionDraftKeyRef.current = draftKey;
    setNewSessionDraftId(sessionId);
    setSelectedSession(null);
    setNewSessionCwd(cwd);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setBranchSwitchLocked(false);
    setSystemPrompt(null);
    setSystemTools(null);
    setSystemInfoLoading(false);
    setActiveTopPanel(null);
    if (isMobile) setSidebarOpen(false);
    router.replace(`?cwd=${encodeURIComponent(cwd)}`, { scroll: false });
  }, [activeCwd, activeFileTabId, invalidateWorkspaceRestore, isMobile, newSessionCwd, router, selectedSession]);

  // Client-built transient SessionInfo (new session / fork) lacks the
  // server-computed projectKey, which the same-project check in
  // handleCwdChange relies on. Hydrate it from the session list so switching
  // worktrees right after creating a session doesn't close the chat.
  const hydrateSelectedSession = useCallback((sessionId: string) => {
    void fetch("/api/sessions", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then((d) => {
        const full = d?.sessions.find((s) => s.id === sessionId);
        if (!full) return;
        setSelectedSession((prev) => (
          prev?.id === sessionId
            ? { ...prev, ...full, transient: full.transient ?? false }
            : prev
        ));
      })
      .catch(() => {});
  }, []);

  // Global keyboard shortcuts (handles Esc, Ctrl+Alt+N etc.)
  useGlobalKeyboardShortcuts({
    onNewSession: (cwd: string) => handleNewSession(`kb-${Date.now()}`, cwd),
    activeCwd,
    onShowShortcuts: openShortcuts,
  });

  const handleOpenSession = useCallback(async (sessionId: string) => {
    // Prefer the catalogue the sidebar already delivered: selecting from it
    // avoids a full detail round trip just to obtain the SessionInfo.
    const catalogued = sessionCatalog.find((s) => s.id === sessionId);
    if (catalogued && !catalogued.transient) {
      handleSelectSession(catalogued);
      return;
    }
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await response.json() as { info?: SessionInfo; error?: string };
      if (!response.ok || !data.info) throw new Error(data.error ?? `HTTP ${response.status}`);
      handleSelectSession(data.info);
    } catch (error) {
      console.error("[pi-web] failed to open session:", error instanceof Error ? error.message : error);
    }
  }, [handleSelectSession, sessionCatalog]);

  const openAgent = useCallback(async (name: string, entryId?: string | null) => {
    let response: Response;
    let data: { sessionId?: string; lastReadEntryId?: string | null; error?: string };
    try {
      response = await fetch(`/api/agents/${encodeURIComponent(name)}/thread`, { method: "POST" });
      data = await response.json() as typeof data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[pi-web] failed to open agent:", message);
      toast.error(translate("agents.error", { error: message }));
      return;
    }
    if (!response.ok || !data.sessionId) {
      console.error("[pi-web] failed to open agent:", data.error);
      toast.error(translate("agents.error", { error: data.error ?? `HTTP ${response.status}` }));
      return;
    }
    const detail = await fetch(`/api/agents/${encodeURIComponent(name)}`, { cache: "no-store" })
      .then((reply) => reply.json() as Promise<{ agent?: AgentDetail }>)
      .catch(() => ({} as { agent?: AgentDetail }));
    setAgentDetail(detail.agent ?? null);
    setActiveAgent(name);
    setAgentUnreadMarker(data.lastReadEntryId ?? null);
    pendingAgentRef.current = { sessionId: data.sessionId, agentName: name };
    await handleOpenSession(data.sessionId);
    if (entryId) setSearchTarget({ sessionId: data.sessionId, entryId });
  }, [handleOpenSession, translate]);

  const openAgentByShortcut = useCallback((name: string) => void openAgent(name), [openAgent]);
  useRailShortcuts(agents, activeAgent, openAgentByShortcut);

  // The one place that POSTs a reset: the profile dialog and /new, /clear both land here (the confirm is here too).
  const resetAgentThread = useCallback(async (name: string) => {
    if (!window.confirm(translate("agents.profile.resetConfirm", { name }))) return;
    let response: Response;
    try {
      response = await fetch(`/api/agents/${encodeURIComponent(name)}/thread/reset`, { method: "POST" });
    } catch (error) {
      toast.error(translate("agents.error", { error: error instanceof Error ? error.message : String(error) }));
      return;
    }
    if (response.status === 409) { toast.error(translate("agents.profile.running")); return; }
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      toast.error(translate("agents.error", { error: data.error ?? `HTTP ${response.status}` }));
      return;
    }
    pendingAgentRef.current = null; // the old thread id must not keep the agent view open on the archived session
    setAgentUnreadMarker(null);
    reloadAgents();
    await openAgent(name);
  }, [openAgent, reloadAgents, translate]);

  useEffect(() => {
    if (agentMountOpenedRef.current || !initialNavigation.agentName) return;
    agentMountOpenedRef.current = true;
    void openAgent(initialNavigation.agentName, initialNavigation.entryId); // runs once, so the entry is scrolled to once
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the ?agent= the page loaded with
  }, []);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo, sourceDraftKey: string) => {
    setRefreshKey((k) => k + 1);
    if (activeNewSessionDraftKeyRef.current !== sourceDraftKey) return;
    invalidateWorkspaceRestore();
    activeNewSessionDraftKeyRef.current = null;
    setNewSessionCwd(null);
    setSelectedSession(session);
    hydrateSelectedSession(session.id);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [invalidateWorkspaceRestore, router, hydrateSelectedSession]);

  const deliverSessionNotification = useCallback(({
    targetSession,
    title,
    body,
    tag,
  }: {
    targetSession: SessionInfo | null;
    title: string;
    body: string;
    tag?: string;
  }) => {
    if (!("Notification" in window)) return;

    const fire = () => {
      const sessionUrl = targetSession ? `/?session=${encodeURIComponent(targetSession.id)}` : "/";
      void showBrowserNotification({
        title,
        body,
        sessionUrl,
        tag,
        onClick: () => {
          window.focus();
          if (targetSession) handleSelectSession(targetSession);
        },
      });
    };

    if (Notification.permission === "granted") {
      fire();
      void setupPushSubscription(locale);
    } else if (Notification.permission === "default") {
      void Notification.requestPermission().then((p) => {
        if (p === "granted") {
          fire();
          void setupPushSubscription(locale);
        }
      });
    }
  }, [handleSelectSession, locale]);

  const handleAgentEnd = useCallback((end: AgentEndInfo) => {
    setRefreshKey((k) => k + 1);
    setExplorerRefreshKey((k) => k + 1);
    if (selectedSession) hydrateSelectedSession(selectedSession.id);

    if (end.aborted || selectedSession?.relation?.kind === "subagent") return;
    if (!shouldShowBrowserNotification()) return;
    const targetSession = selectedSession;
    deliverSessionNotification({
      targetSession,
      title: targetSession?.name ?? translate("i18n.sessionComplete"),
      body: translate("i18n.taskFinished"),
      tag: targetSession ? `pi-session-complete:${targetSession.id}` : "pi-session-complete",
    });
  }, [deliverSessionNotification, hydrateSelectedSession, selectedSession, translate]);

  const handleAttentionNeeded = useCallback((request: BlockingExtensionUiRequest) => {
    if (selectedSession?.relation?.kind === "subagent") return;
    if (!shouldShowBrowserNotification()) return;
    if (!claimExtensionAttentionNotification(request, notifiedAttentionRequestIdsRef.current)) return;

    deliverSessionNotification({
      targetSession: selectedSession,
      title: translate("i18n.attentionNeeded"),
      body: request.method === "custom"
        ? translate("i18n.extensionInputNeeded")
        : request.title,
      tag: `pi-extension-ui:${request.id}`,
    });
  }, [deliverSessionNotification, selectedSession, translate]);

  const handleAutoName = useCallback(async () => {
    const sessionId = selectedSession?.id;
    if (!sessionId || autoNameStatus.kind === "naming") return;
    if (autoNameTimerRef.current) clearTimeout(autoNameTimerRef.current);
    setActiveTopPanel(null);
    setAutoNameStatus({ kind: "naming" });

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/auto-name`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as { title?: string; error?: string };
      if (!response.ok || !body.title) {
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const title = body.title.trim();
      setRefreshKey((key) => key + 1);
      if (activeSessionIdRef.current !== sessionId) return;
      setSelectedSession((current) => current?.id === sessionId ? { ...current, name: title } : current);
      setSessionStats((current) => current?.sessionId === sessionId ? { ...current, sessionName: title } : current);
      setAutoNameStatus({ kind: "success" });
      autoNameTimerRef.current = setTimeout(() => setAutoNameStatus({ kind: "idle" }), 1800);
    } catch (error) {
      if (activeSessionIdRef.current !== sessionId) return;
      const message = error instanceof Error ? error.message : String(error);
      setAutoNameStatus({ kind: "error", message });
      autoNameTimerRef.current = setTimeout(() => setAutoNameStatus({ kind: "idle" }), 5000);
    }
  }, [autoNameStatus.kind, selectedSession?.id]);

  useEffect(() => {
    if (autoNameTimerRef.current) clearTimeout(autoNameTimerRef.current);
    setAutoNameStatus({ kind: "idle" });
  }, [selectedSession?.id]);

  const handleExplorerRefresh = useCallback(() => {
    setExplorerRefreshKey((k) => k + 1);
  }, []);

  const handleSessionForked = useCallback((newSessionId: string) => {
    invalidateWorkspaceRestore();
    activeNewSessionDraftKeyRef.current = null;
    setRefreshKey((k) => k + 1);
    setSessionKey((k) => k + 1);
    setNewSessionCwd(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
      transient: false,
    }));
    hydrateSelectedSession(newSessionId);
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [invalidateWorkspaceRestore, router, hydrateSelectedSession]);

  const handleAskInNewChat = useCallback(async (
    prompt: string,
    sourceSessionId: string,
    sourceEntryId: string,
  ) => {
    const result = await sendAgentCommand<{ newSessionId?: string }>(sourceSessionId, {
      type: "fork_branch",
      entryId: sourceEntryId,
    });
    if (!result?.newSessionId) throw new Error(translate("chat.quoteForkFailed"));
    setPendingQuotePrompt({ sessionId: result.newSessionId, text: prompt });
    handleSessionForked(result.newSessionId);
  }, [handleSessionForked, translate]);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    invalidateWorkspaceRestore();
    setRefreshKey((k) => k + 1);
    // The DELETE can outlive a session switch: this callback's captured
    // selectedSession is from the delete click. Read the latest selection
    // and only fall back to the empty composer when the user is still on
    // the deleted session at the moment removal completes.
    const active = selectedSessionRef.current;
    if (active?.id === sessionId) {
      clearTabOpenSession(sessionId);
      const cwd = active.cwd;
      const draftId = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      setNewSessionDraftId(draftId);
      activeNewSessionDraftKeyRef.current = cwd ? `new:${draftId}:${cwd}` : null;
      setSelectedSession(null);
      setNewSessionCwd(cwd ?? null);
      setSessionKey((k) => k + 1);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setBranchSwitchLocked(false);
      setSystemPrompt(null);
      setSystemTools(null);
      setSystemInfoLoading(false);
      setActiveTopPanel(null);
      router.replace(cwd ? `?cwd=${encodeURIComponent(cwd)}` : (typeof window !== "undefined" ? window.location.pathname : "/"), { scroll: false });
    }
  }, [invalidateWorkspaceRestore, router]);

  const handleOpenFile = useCallback((
    filePath: string,
    fileName: string,
    options?: { sourceSessionId?: string | null; modeHint?: "diff"; page?: number },
  ) => {
    const sourceSessionId = options?.sourceSessionId;
    const modeHint = options?.modeHint;
    const page = options?.page;
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => openFileTab(prev, {
      fileName,
      filePath,
      modeHint,
      page,
      sourceSessionId,
      tabId,
    }));
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
    // On mobile the file panel is full-screen; close the drawer so it shows.
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const handleAgentDeleted = useCallback(() => {
    invalidateWorkspaceRestore();
    setActiveAgent(null);
    setAgentDetail(null);
    setAgentUnreadMarker(null);
    pendingAgentRef.current = null;
    reloadAgents();
    setRefreshKey((k) => k + 1);
    if (selectedSession) clearTabOpenSession(selectedSession.id);
    activeNewSessionDraftKeyRef.current = null;
    setSelectedSession(null);
    setNewSessionCwd(null);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setBranchSwitchLocked(false);
    setSystemPrompt(null);
    setSystemTools(null);
    setSystemInfoLoading(false);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [invalidateWorkspaceRestore, reloadAgents, selectedSession, router]);

  const handleOpenLinkedFile = useCallback((filePath: string, page?: number) => {
    handleOpenFile(filePath, getFileName(filePath), { sourceSessionId: selectedSession?.id ?? null, page });
  }, [handleOpenFile, selectedSession?.id]);

  const handleOpenTerminal = useCallback((cwd: string) => {
    const existing = terminalTabs.find((tab) => tab.cwd === cwd);
    const tab = existing ?? newTerminalTab(cwd);
    if (!existing) setTerminalTabs((tabs) => [...tabs, tab]);
    setActiveFileTabId(tab.id);
    setRightPanelOpen(true);
    if (isMobile) setSidebarOpen(false);
  }, [terminalTabs, isMobile]);

  const handleTerminalClosed = (tab: TerminalTab) => {
    const replacement = tab.closing === "restart" ? newTerminalTab(tab.cwd) : null;
    const remaining = terminalTabs.filter((item) => item.id !== tab.id);
    setTerminalTabs((tabs) => tabs.flatMap((item) => item.id !== tab.id ? [item] : replacement ? [replacement] : []));
    setActiveFileTabId((current) => current !== tab.id ? current : replacement?.id ?? remaining.at(-1)?.id ?? fileTabs.at(-1)?.id ?? null);
    if (!replacement && !remaining.length && !fileTabs.length && !activeAgent) setRightPanelOpen(false);
  };

  const handleCloseFileTab = useCallback((tabId: string) => {
    if (terminalTabs.some((tab) => tab.id === tabId)) {
      setTerminalTabs((tabs) => tabs.map((tab) => tab.id === tabId && !tab.closing ? { ...tab, closing: "close" } : tab));
      return;
    }
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0 && terminalTabs.length === 0 && !activeAgent) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.at(-1)?.id ?? terminalTabs.at(-1)?.id ?? null;
    });
  }, [fileTabs, terminalTabs, activeAgent]);

  const handleViewFullHistory = useCallback(() => {
    if (!selectedSession) return;
    window.open(
      `/api/sessions/${encodeURIComponent(selectedSession.id)}/export?inline=1`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [selectedSession]);

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
  const newSessionDraftKey = selectedSession === null && effectiveNewSessionCwd
    ? `new:${newSessionDraftId}:${effectiveNewSessionCwd}`
    : null;
  useLayoutEffect(() => {
    activeNewSessionDraftKeyRef.current = newSessionDraftKey;
  }, [newSessionDraftKey]);

  // The bar above a fresh composer. Only a fresh composer moves, and only
  // somewhere else: the folder in use would remount it for nothing. The
  // control the move came from takes focus in the bar of the new composer.
  const handlePickNewSessionContext = useCallback((target: NewSessionTarget, from: NewSessionContextControl) => {
    if (selectedSession !== null || !effectiveNewSessionCwd || target.cwd === effectiveNewSessionCwd) return;
    newSessionBarFocusRef.current = from;
    // A worktree just created already left its move, with the branch.
    if (target.projectKey && target.projectRoot && newSessionMoveRef.current?.cwd !== target.cwd) {
      newSessionMoveRef.current = { cwd: target.cwd, project: { key: target.projectKey, root: target.projectRoot }, branch: null };
    }
    sidebarControlRef.current?.startNewSessionIn({ ...target, carryComposer: true });
  }, [effectiveNewSessionCwd, selectedSession]);
  // The folder picker answers later: its pick runs the newest closure, guard included.
  const pickNewSessionContextRef = useRef(handlePickNewSessionContext);
  pickNewSessionContextRef.current = handlePickNewSessionContext;
  const handleOpenFolderForNewSession = useCallback((opener: HTMLElement | null) => {
    sidebarControlRef.current?.openFolderForNewSession((target) => pickNewSessionContextRef.current(target, "project"), opener);
  }, []);
  const handleDefaultDirectoryForNewSession = useCallback(() => {
    sidebarControlRef.current?.openDefaultDirectoryForNewSession((target) => pickNewSessionContextRef.current(target, "project"));
  }, []);
  const handleRefreshNewSessionWorktrees = useCallback(() => {
    sidebarControlRef.current?.refreshWorktrees();
  }, []);
  const handleCreateNewSessionWorktree = useCallback(async (project: ProjectChoice, branch: string) => {
    const control = sidebarControlRef.current;
    if (!control) throw new Error("The session sidebar is not mounted");
    const result = await control.createWorktree(project, branch);
    // The bar moves there next, before any report lists it.
    if ("path" in result) newSessionMoveRef.current = { cwd: result.path, project, branch };
    return result;
  }, []);
  const handleNewSessionBarFocusDone = useCallback(() => {
    newSessionBarFocusRef.current = null;
  }, []);
  const newSessionContextBar = selectedSession === null && effectiveNewSessionCwd ? (
    <NewSessionContextBar
      context={contextForCwd(sidebarNewSessionContext, effectiveNewSessionCwd, newSessionMoveRef.current)}
      mobile={isMobile}
      initialFocus={newSessionBarFocusRef.current}
      onInitialFocusDone={handleNewSessionBarFocusDone}
      onPick={handlePickNewSessionContext}
      onUseDefaultDirectory={handleDefaultDirectoryForNewSession}
      onOpenFolder={handleOpenFolderForNewSession}
      onRefreshWorktrees={handleRefreshNewSessionWorktrees}
      onCreateWorktree={handleCreateNewSessionWorktree}
    />
  ) : null;
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;
  const projectTrustCwd = selectedSession?.cwd ?? effectiveNewSessionCwd;
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const shortcutPlatform = useShortcutPlatform();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandPaletteKey(event, shortcutPlatform)) return;
      // Settings and the agent dialogs sit above the palette's layer: opening under them would trap focus out of sight.
      if (document.querySelector('[role="dialog"]:not([data-command-palette])')) return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutPlatform]);
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const settingsLabels: Record<SettingsSection, string> = {
      general: translate("settings.general"),
      models: translate("common.models"),
      skills: translate("common.skills"),
      agents: translate("common.agents"),
      plugins: translate("common.plugins"),
      mcp: translate("settings.mcp"),
      memory: translate("settings.memory"),
    };
    const commands: PaletteCommand[] = [
      {
        id: "new-session",
        group: "actions",
        label: translate("palette.newSession"),
        hint: formatShortcut(["Ctrl", "Alt", "N"], shortcutPlatform),
        disabled: !activeCwd,
        run: () => { if (activeCwd) handleNewSession(`kb-${Date.now()}`, activeCwd); },
      },
      { id: "toggle-sidebar", group: "actions", label: translate("palette.toggleSidebar"), run: handleSidebarToggle },
      { id: "toggle-files", group: "actions", label: translate("palette.toggleFiles"), run: handleRightPanelToggle },
      { id: "shortcuts", group: "actions", label: translate("shortcuts.open"), hint: "?", run: openShortcuts },
      ...SETTINGS_SECTION_VALUES.map((section): PaletteCommand => ({
        id: `settings-${section}`,
        group: "settings",
        label: settingsLabels[section],
        disabled: settingsSectionRequiresProject(section) && !projectTrustCwd,
        run: () => openSettingsSection(section),
      })),
      ...sessionCatalog.filter((session) => !session.transient && session.relation?.kind !== "subagent").slice(0, 300).map((session): PaletteCommand => ({
        id: `session-${session.id}`,
        group: "sessions",
        label: session.name || session.firstMessage?.slice(0, 60) || session.id.slice(0, 12),
        hint: getFileName(session.cwd) || undefined,
        run: () => handleSelectSession(session),
      })),
    ];
    return commands;
  }, [activeCwd, handleNewSession, handleRightPanelToggle, handleSelectSession, handleSidebarToggle, openSettingsSection, openShortcuts, projectTrustCwd, sessionCatalog, shortcutPlatform, translate]);

  useEffect(() => {
    setProjectTrust(null);
    setProjectTrustDialogOpen(false);
    setProjectTrustError(null);
    if (!projectTrustCwd) return;

    const controller = new AbortController();
    // The answer also lists the project's MCP servers (`mcpFile`, `mcpServers`), unused here: the
    // trust dialog fetches the listing again when it opens, since the file can change in between.
    fetch(`/api/project-trust?cwd=${encodeURIComponent(projectTrustCwd)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as ProjectTrustStatus & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        setProjectTrust(data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load project trust:", error);
      });
    return () => controller.abort();
  }, [projectTrustCwd]);

  const handleTrustProject = useCallback(async () => {
    if (!projectTrustCwd || projectTrustBusy) return;
    setProjectTrustBusy(true);
    setProjectTrustError(null);
    try {
      const response = await fetch("/api/project-trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: projectTrustCwd }),
      });
      const data = await response.json() as ProjectTrustStatus & Partial<McpErrorResponse>;
      if (!response.ok || data.error) {
        // The dialog translates the reason; the English error is only its diagnostic.
        setProjectTrustError({ error: data.error ?? `HTTP ${response.status}`, ...(data.reason ? { reason: data.reason } : {}) });
        return;
      }
      setProjectTrust(data);
      setProjectTrustDialogOpen(false);
      setModelsRefreshKey((key) => key + 1);
      setSessionKey((key) => key + 1);
    } catch (error) {
      setProjectTrustError({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setProjectTrustBusy(false);
    }
  }, [projectTrustBusy, projectTrustCwd]);

  // The restricted-mode banner and Settings › MCP's trust notice open the same dialog.
  const openProjectTrustDialog = useCallback(() => {
    setProjectTrustError(null);
    setProjectTrustDialogOpen(true);
  }, []);

  // Settings › MCP added a project server: `.pi/mcp.json` alone makes a folder require trust, and a
  // fresh folder was trusted in the same step. Every mounted section reloads in place on the new
  // status (projectTrustReloadKey); nothing was rebuilt, so the chat needs no new session key.
  const handleProjectTrustChanged = useCallback((cwd: string, status: ProjectTrustStatus) => {
    if (cwd === projectTrustCwd) setProjectTrust(status);
  }, [projectTrustCwd]);

  useEffect(() => {
    if (!activeAgent) {
      setAgentDetail(null);
      setActiveFileTabId((cur) => cur === AGENT_TAB_ID ? fileTabs[0]?.id ?? terminalTabs[0]?.id ?? null : cur);
    }
  }, [activeAgent, fileTabs, terminalTabs]);

  const markAgentRead = useCallback((entryId: string) => {
    if (!activeAgent) return;
    void fetch(`/api/agents/${encodeURIComponent(activeAgent)}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId }) })
      .then(reloadAgents)
      .catch(() => {});
  }, [activeAgent, reloadAgents]);

  const activeFileTab = fileTabs.find((tab) => tab.id === activeFileTabId) ?? null;
  const activeCwdName = activeCwd ? getFileName(activeCwd) || activeCwd : null;
  const totalUnread = agents.reduce((sum, agent) => sum + agent.unread, 0);
  const baseTitle = activeAgent ? `${activeAgent} - Pi Web` : activeCwdName ? `${activeCwdName} - Pi Web` : "Pi Web";
  const windowTitle = totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;

  useEffect(() => {
    const syncWindowTitle = () => {
      if (document.title !== windowTitle) document.title = windowTitle;
    };

    syncWindowTitle();
    const observer = new MutationObserver(syncWindowTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [windowTitle]);

  const agentSpaceRight = activeAgent && agentDetail ? (
    <AgentSpaceRight
      agent={agentDetail}
      running={Boolean(selectedSession && runningSessionIds.has(selectedSession.id))}
      paused={agents.find((item) => item.name === agentDetail.name)?.paused ?? false}
      allPaused={allPaused}
      onPauseChanged={reloadAgents}
      contextPercent={contextUsage?.percent ?? null}
      onOpenSession={(sessionId) => void handleOpenSession(sessionId)}
      onOpenFile={handleOpenFile}
    />
  ) : null;

  const agentSpaceLeft = activeAgent && agentDetail ? (
    <AgentSidebar
      key={agentDetail.name}
      agent={agentDetail}
      isMobile={isMobile}
      status={agentSpaceRight}
      onOpenFile={handleOpenFile}
      onOpenTerminal={handleOpenTerminal}
      onOpenSession={(sessionId) => void handleOpenSession(sessionId)}
      onProfileSaved={(agent) => { setAgentDetail(agent); reloadAgents(); }}
      onDeleted={handleAgentDeleted}
      onThreadReset={() => void resetAgentThread(agentDetail.name)}
    />
  ) : null;

  const showAgentPanel = Boolean(agentSpaceRight) && (activeFileTabId === AGENT_TAB_ID || !activeFileTab && !terminalTabs.some((tab) => tab.id === activeFileTabId));

  const sidebarContent = agentSpaceLeft ?? (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        controlRef={sidebarControlRef}
        onNewSessionContextChange={handleSidebarNewSessionContext}
        initialSessionId={initialSessionId}
        skipInitialProjectSelection={initialNavigation.requestedCwd !== null || initialNavigation.agentName !== null}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        onSessionDeleted={handleSessionDeleted}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? null}
        onCwdChange={handleCwdChange}
        onOpenFile={handleOpenFile}
        onOpenTerminal={handleOpenTerminal}
        explorerRefreshKey={explorerRefreshKey}
        onExplorerRefresh={handleExplorerRefresh}
        onAtMention={handleAtMention}
        onAtMentions={handleAtMentions}
        onBackgroundTaskDone={handleBackgroundTaskDone}
        onRunningSessionIdsChange={handleRunningSessionIdsChange}
        onSessionsChange={handleSessionsChange}
      />
      <div style={{ padding: "8px", flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 4 }}>
        {([
          ["models", translate("common.models")],
          ["skills", translate("common.skills")],
        ] as const).map(([section, label]) => {
          const disabled = settingsSectionRequiresProject(section) && !projectTrustCwd;
          return (
            <button
              key={section}
              type="button"
              onClick={() => setSettingsSection(section)}
              disabled={disabled}
              title={disabled ? translate("settings.projectRequired") : label}
              aria-label={label}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 32, padding: 0, background: "none", border: "none",
                borderRadius: 9, color: "var(--text-muted)", cursor: disabled ? "default" : "pointer",
                fontSize: 12, opacity: disabled ? 0.35 : 1,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(event) => { if (!disabled) { event.currentTarget.style.background = "var(--bg-hover)"; event.currentTarget.style.color = "var(--text)"; } }}
              onMouseLeave={(event) => { event.currentTarget.style.background = "none"; event.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <SettingsSectionIcon section={section} size={14} strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSettingsSection(getLastSettingsSection(projectTrustCwd))}
          title={translate("common.settings")}
          aria-label={translate("common.settings")}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            height: 32, padding: 0, background: "none", border: "none",
            borderRadius: 9, color: "var(--text-muted)", cursor: "pointer",
            fontSize: 12, transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(event) => { event.currentTarget.style.background = "var(--bg-hover)"; event.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(event) => { event.currentTarget.style.background = "none"; event.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <SettingsSectionIcon section="general" size={14} strokeWidth={2} />
          <span>{translate("common.settings")}</span>
        </button>
      </div>
    </>
  );

  const renderProjectTrustWarning = (mobileBanner: boolean) => {
    if (!showChat || !projectTrust?.requiresTrust || projectTrust.trusted) return null;
    return (
      <TopBarButton
        onClick={openProjectTrustDialog}
        title={translate("trust.resourcesNotLoaded")}
        aria-label={translate("trust.resourcesNotLoaded")}
        tone="warning"
        edge={mobileBanner ? "none" : "right"}
        className={mobileBanner ? "h-auto w-full justify-start border-b border-tron-line bg-tron-orange/10 text-left leading-snug" : "leading-snug"}
        style={{
          minHeight: mobileBanner ? 32 : undefined,
          padding: mobileBanner ? "6px 12px" : undefined,
        }}
        data-mobile-trust-banner={mobileBanner ? "true" : undefined}
      >
        <ShieldAlert aria-hidden="true" />
        <span>{translate("trust.resourcesNotLoaded")}</span>
      </TopBarButton>
    );
  };

  const renderChatToolbarActions = (mobile: boolean) => {
    if (!mobile && !showChat) return null;
    return (
      <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
        <TopBarButton
          onClick={() => {
            handleViewFullHistory();
            if (mobile && isNarrowMobile) setMobileToolbarMoreOpen(true);
          }}
          disabled={!selectedSession}
          title={selectedSession ? translate("history.full") : translate("history.unsaved")}
          aria-label={translate("history.full")}
          iconOnly={mobile}
          style={{ width: mobile ? TOP_BAR_ICON_BUTTON_SIZE : undefined }}
          data-mobile-toolbar-action={mobile ? "history" : undefined}
        >
          <History aria-hidden="true" />
          {!mobile && <span>{translate("history.label")}</span>}
        </TopBarButton>
        {(() => {
          // 上下文压缩后当前消息可能不再包含 user 消息，需同时参考会话文件的消息总数。
          const hasMessages = Boolean(
            selectedSession
            && ((sessionStats?.userMessages ?? 0) > 0 || selectedSession.messageCount > 0),
          );
          const disabled = !selectedSession || selectedSession.transient || !hasMessages || autoNameStatus.kind === "naming";
          const isSuccess = autoNameStatus.kind === "success";
          const isError = autoNameStatus.kind === "error";
          const label = autoNameStatus.kind === "naming"
            ? translate("title.generating")
            : isSuccess
              ? translate("title.updated")
              : isError
                ? translate("title.failed")
                : translate("title.generate");
          const title = !selectedSession || selectedSession.transient
            ? translate("title.unsaved")
            : !hasMessages
              ? translate("title.noMessages")
              : isError
                ? autoNameStatus.message
                : translate("title.generateSession");

          return (
            <TopBarButton
              onClick={() => {
                void handleAutoName();
                if (mobile && isNarrowMobile) setMobileToolbarMoreOpen(true);
              }}
              disabled={disabled}
              title={title}
              aria-label={label}
              tone={isError ? "danger" : isSuccess ? "success" : "default"}
              iconOnly={mobile}
              className={autoNameStatus.kind === "naming" ? "disabled:opacity-100" : undefined}
              style={{ width: mobile ? TOP_BAR_ICON_BUTTON_SIZE : undefined }}
              data-mobile-toolbar-action={mobile ? "name" : undefined}
            >
              {autoNameStatus.kind === "naming" ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : isSuccess ? (
                <Check aria-hidden="true" />
              ) : (
                <WandSparkles aria-hidden="true" />
              )}
              {!mobile && <span>{label}</span>}
            </TopBarButton>
          );
        })()}
        {hasSubagentSessions && (
          <TopBarButton
            onClick={() => toggleTopPanel("agents", mobile)}
            title={translate("agentSwitcher.title")}
            aria-label={translate("agentSwitcher.title")}
            aria-pressed={activeTopPanel === "agents"}
            active={activeTopPanel === "agents"}
            iconOnly={mobile}
            className="relative"
            style={{ width: mobile ? TOP_BAR_ICON_BUTTON_SIZE : undefined }}
            data-mobile-toolbar-action={mobile ? "agents" : undefined}
          >
            <Bot aria-hidden="true" />
            {!mobile && <span>{translate("agentSwitcher.title")}</span>}
            <span
              aria-hidden="true"
              className={mobile
                ? "absolute right-0.5 top-0.5 grid h-[13px] min-w-[13px] place-items-center bg-tron-cyan px-[3px] font-mono text-[9px] leading-none text-black tabular-nums"
                : "grid h-[15px] min-w-[15px] place-items-center bg-tron-cyan px-1 font-mono text-[10px] leading-none text-black tabular-nums"}
            >
              {activeSessionFamily!.subagents.length}
            </span>
          </TopBarButton>
        )}
        {sessionHasBranches && (mobile ? (
          <TopBarButton
            onClick={() => toggleTopPanel("branches", true)}
            title={translate("i18n.branches")}
            aria-label={translate("i18n.branches")}
            aria-pressed={activeTopPanel === "branches"}
            active={activeTopPanel === "branches"}
            iconOnly
            style={{ width: TOP_BAR_ICON_BUTTON_SIZE }}
            data-mobile-toolbar-action="branches"
          >
            <GitBranch aria-hidden="true" className={branchTree.length > 0 ? "text-tron-cyan" : "text-text-dim"} />
          </TopBarButton>
        ) : (
          <BranchNavigator
            tree={branchTree}
            activeLeafId={branchActiveLeafId}
            onLeafChange={handleBranchLeafChange}
            locked={branchSwitchLocked}
            inline
            containerRef={topBarRef}
            open={activeTopPanel === "branches"}
            onToggle={() => toggleTopPanel("branches")}
            hasSession
          />
        ))}
        <TopBarButton
          ref={systemBtnRef}
          onClick={() => handleSystemInfoToggle("system", mobile)}
          disabled={mobile && !showChat}
          title={translate("system.prompt")}
          aria-label={translate("system.prompt")}
          aria-pressed={activeTopPanel === "system"}
          active={activeTopPanel === "system"}
          iconOnly={mobile}
          style={{ width: mobile ? TOP_BAR_ICON_BUTTON_SIZE : undefined }}
          data-mobile-toolbar-action={mobile ? "system" : undefined}
        >
          <FileText aria-hidden="true" className={systemPrompt ? "text-tron-cyan" : "text-text-dim"} />
          {!mobile && <span>{translate("system.label")}</span>}
        </TopBarButton>
        <TopBarButton
          onClick={() => handleSystemInfoToggle("tools", mobile)}
          disabled={mobile && !showChat}
          title={translate("tools.title")}
          aria-label={translate("tools.title")}
          aria-pressed={activeTopPanel === "tools"}
          active={activeTopPanel === "tools"}
          iconOnly={mobile}
          style={{ width: mobile ? TOP_BAR_ICON_BUTTON_SIZE : undefined }}
          data-mobile-toolbar-action={mobile ? "tools" : undefined}
        >
          <Wrench aria-hidden="true" className={systemTools?.some((tool) => tool.active) ? "text-tron-cyan" : "text-text-dim"} />
          {!mobile && <span>{translate("tools.label")}</span>}
        </TopBarButton>
        {mobile && (
          <TopBarButton
            onClick={() => { shortcutsFromMobileLayerRef.current = true; setMobileToolbarMoreOpen(false); setShortcutsOpen(true); }}
            title={translate("shortcuts.open")}
            aria-label={translate("shortcuts.open")}
            iconOnly
            style={{ width: TOP_BAR_ICON_BUTTON_SIZE }}
            data-mobile-toolbar-action="shortcuts"
          >
            <Keyboard aria-hidden="true" />
          </TopBarButton>
        )}
      </div>
    );
  };

  const renderSessionStatsButton = (mobile: boolean) => {
    if (!mobile && (!showChat || (!sessionStats && !contextUsage))) return null;

    const tokens = sessionStats?.tokens;
    const cost = sessionStats?.cost ?? 0;
    const formatCompact = (value: number) => value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1000
        ? `${(value / 1000).toFixed(0)}k`
        : String(value);
    const costText = cost > 0 ? (cost >= 0.01 ? `$${cost.toFixed(2)}` : `<$0.01`) : null;

    const contextClass = { cyan: "text-text-muted", orange: "text-tron-orange", red: "text-tron-red" }[contextTone(contextUsage?.percent ?? null)];
    let desktopContextText: string | null = null;
    let mobileContextText: string | null = null;
    if (contextUsage?.contextWindow) {
      const percent = contextUsage.percent;
      desktopContextText = percent !== null
        ? `${percent.toFixed(0)}% / ${formatCompact(contextUsage.contextWindow)}`
        : `? / ${formatCompact(contextUsage.contextWindow)}`;
      mobileContextText = percent !== null ? `${percent.toFixed(0)}%` : null;
    }

    const tooltipParts: string[] = [];
    if (tokens) {
      tooltipParts.push(`in: ${tokens.input.toLocaleString(locale)}`);
      tooltipParts.push(`out: ${tokens.output.toLocaleString(locale)}`);
      tooltipParts.push(`cache read: ${tokens.cacheRead.toLocaleString(locale)}`);
      tooltipParts.push(`cache write: ${tokens.cacheWrite.toLocaleString(locale)}`);
      if (cost > 0) tooltipParts.push(`cost: $${cost.toFixed(4)}`);
    }
    if (contextUsage?.contextWindow) {
      const percent = contextUsage.percent;
      tooltipParts.push(`context: ${percent !== null ? percent.toFixed(1) + "%" : "unknown"} of ${contextUsage.contextWindow.toLocaleString()} tokens`);
    }
    const tooltip = tooltipParts.join("  |  ");
    const covered = mobile && isNarrowMobile && mobileToolbarMoreOpen;
    const hasMobileValues = Boolean(
      (tokens && (tokens.input > 0 || tokens.output > 0))
      || costText
      || mobileContextText,
    );

    return (
      <TopBarButton
        onClick={() => toggleTopPanel("session")}
        disabled={!showChat || covered}
        tabIndex={covered ? -1 : undefined}
        title={tooltip || translate("session.title")}
        aria-label={translate("session.title")}
        aria-pressed={activeTopPanel === "session"}
        aria-hidden={covered ? true : undefined}
        active={activeTopPanel === "session"}
        edge="none"
        className={cn("min-w-0 shrink justify-end font-mono tabular-nums disabled:opacity-100", mobile ? "mobile-session-stats" : undefined)}
        data-mobile-toolbar-stats={mobile ? "true" : undefined}
        style={{
          marginLeft: mobile ? 0 : "auto",
          flex: mobile ? 1 : undefined,
          minWidth: 0,
          gap: mobile ? 7 : 10,
          paddingLeft: mobile ? 6 : 12,
          paddingRight: mobile ? 6 : 12,
          overflow: "hidden",
          visibility: covered ? "hidden" : "visible",
          pointerEvents: covered ? "none" : "auto",
        }}
      >
        {mobile ? (
          <>
            {tokens && tokens.input > 0 && (
              <span className="mobile-session-stat-io flex shrink-0 items-center gap-0.5 [&_svg]:size-2.5!">
                <ArrowUp aria-hidden="true" />
                {formatCompact(tokens.input)}
              </span>
            )}
            {tokens && tokens.output > 0 && (
              <span className="mobile-session-stat-io flex shrink-0 items-center gap-0.5 [&_svg]:size-2.5!">
                <ArrowDown aria-hidden="true" />
                {formatCompact(tokens.output)}
              </span>
            )}
            {costText && (
              <span className="mobile-session-stat-cost shrink-0 font-medium text-text">
                {costText}
              </span>
            )}
            {mobileContextText && (
              <span className={cn("shrink-0", contextClass)}>
                {mobileContextText}
              </span>
            )}
            {!hasMobileValues && showChat && (
              <span className="truncate font-sans text-text-dim">
                {translate("session.title")}
              </span>
            )}
          </>
        ) : (
          <>
            {tokens && tokens.input > 0 && (
              <span className="flex items-center gap-1 [&_svg]:size-3!">
                <ArrowUp aria-hidden="true" />
                {formatCompact(tokens.input)}
              </span>
            )}
            {tokens && tokens.output > 0 && (
              <span className="flex items-center gap-1 [&_svg]:size-3!">
                <ArrowDown aria-hidden="true" />
                {formatCompact(tokens.output)}
              </span>
            )}
            {tokens && tokens.cacheRead > 0 && (
              <span className="flex items-center gap-1 [&_svg]:size-3!">
                <RefreshCw aria-hidden="true" />
                {formatCompact(tokens.cacheRead)}
              </span>
            )}
            {costText && (
              <span className="flex items-center font-medium text-text">
                {costText}
              </span>
            )}
            {desktopContextText && (
              <span className={cn("flex items-center gap-1.5", contextClass)}>
                {contextUsage?.contextWindow && contextUsage.percent !== null && (
                  <Gauge value={contextUsage.percent} label={translate("session.title")} size={16} />
                )}
                {desktopContextText}
              </span>
            )}
          </>
        )}
      </TopBarButton>
    );
  };

  const renderMainFileToggle = (mobile: boolean) => {
    const covered = mobile && isNarrowMobile && mobileToolbarMoreOpen;
    return (
      <TopBarButton
        onClick={handleRightPanelToggle}
        disabled={covered}
        tabIndex={covered ? -1 : undefined}
        aria-controls="file-panel"
        aria-expanded={rightPanelOpen}
        aria-hidden={covered ? true : undefined}
        title={rightPanelOpen ? translate("files.hidePanel") : translate("files.showPanel")}
        aria-label={rightPanelOpen ? translate("files.hidePanel") : translate("files.showPanel")}
        data-mobile-toolbar-file={mobile ? "true" : undefined}
        active={rightPanelOpen}
        iconOnly
        edge="left"
        style={{
          marginLeft: !mobile && !sessionStats && !contextUsage ? "auto" : 0,
          width: TOP_BAR_ICON_BUTTON_SIZE, height: TOP_BAR_ICON_BUTTON_SIZE,
          visibility: covered ? "hidden" : "visible",
          pointerEvents: covered ? "none" : "auto",
        }}
      >
        <PanelRight aria-hidden="true" className="!size-4" />
      </TopBarButton>
    );
  };

  return (
    <>
    <style>{`
      @keyframes session-info-pop {
        0% {
          opacity: 0;
          transform: translateY(-24px);
          filter: blur(6px);
          box-shadow: 0 2px 8px rgba(0,0,0,0);
        }
        55% {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
          background: color-mix(in srgb, var(--accent) 8%, var(--bg-panel));
          box-shadow: 0 18px 44px rgb(0 216 255 / 0.18);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
          background: var(--bg-panel);
          box-shadow: 0 10px 28px rgba(0,0,0,0.10);
        }
      }
      @keyframes session-info-light-wash {
        0% {
          opacity: 0;
          transform: translateX(-110%) skewX(-16deg);
        }
        24% {
          opacity: 0.42;
        }
        100% {
          opacity: 0;
          transform: translateX(115%) skewX(-16deg);
        }
      }
      .session-info-popover {
        position: relative;
        overflow: hidden;
        transform-origin: top right;
        animation: session-info-pop 360ms ease-out both;
        will-change: transform, opacity, filter, background, box-shadow;
      }
      .session-info-popover::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 44%;
        pointer-events: none;
        background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 24%, transparent), transparent);
        animation: session-info-light-wash 620ms ease-out both;
      }
      @media (prefers-reduced-motion: reduce) {
        .session-info-popover,
        .session-info-popover::after {
          animation: none;
        }
      }
      .mobile-session-stats {
        container-type: inline-size;
      }
      @container (max-width: 158px) {
        .mobile-session-stat-io {
          display: none !important;
        }
      }
      @container (max-width: 88px) {
        .mobile-session-stat-cost {
          display: none !important;
        }
      }
      @media (max-width: 640px) {
        .sidebar-overlay-backdrop.sidebar-mobile-pending {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        .sidebar-container.sidebar-mobile-pending.sidebar-open {
          transform: translateX(calc(-100% - env(safe-area-inset-left)));
          box-shadow: none;
        }
      }
    `}</style>
    <div style={{
      display: "flex",
      width: "100%",
      height: "var(--app-viewport-height, 100dvh)",
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-overlay-backdrop${mobileSidebarReady ? "" : " sidebar-mobile-pending"}`}
        onClick={() => setSidebarOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.6)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {!isMobile && <AgentRail
        agents={agents}
        activeAgent={activeAgent}
        onSelectAgent={(name) => void openAgent(name)}
        onNewAgent={() => setNewAgentOpen(true)}
        onShowSessions={() => { setActiveAgent(null); setSidebarOpen(true); }}
        onShowTasks={() => setTasksBoardOpen(true)}
        onShowInbox={() => setInboxOpen(true)}
        orientation={isMobile ? "horizontal" : "vertical"}
        expanded={railExpanded}
        onExpandedChange={changeRailExpanded}
        paused={allPaused}
        error={agentsError}
        lastOkAt={agentsLastOkAt}
        onPauseChanged={reloadAgents}
        healthState={healthState}
      />}

      {/* Left sidebar */}
      <div
        ref={sidebarResizer.panelRef}
        id="session-sidebar"
        inert={rightPanelFullWidth}
        className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}${mobileSidebarReady ? "" : " sidebar-mobile-pending"}${sidebarResizer.isResizing ? " sidebar-resizing" : ""}`}
        style={{
          "--sidebar-width": `${sidebarResizer.width}px`,
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 200,
        } as React.CSSProperties}
      >
        {sidebarContent}
      </div>
      {sidebarOpen && (
        <div
          {...sidebarResizer.separatorProps}
          inert={rightPanelFullWidth}
          aria-controls="session-sidebar"
          className={`panel-resize-handle sidebar-resize-handle${sidebarResizer.isResizing ? " is-resizing" : ""}`}
          data-resize-handle="sidebar"
          title={`${translate("layout.resizeSidebar")}: ${translate("layout.resizeHint")}`}
        />
      )}

      {/* Center: chat */}
      <div inert={rightPanelFullWidth} data-chat-wide={!sidebarOpen || !rightPanelOpen ? "true" : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {isMobile && <AgentRail
          agents={agents}
          activeAgent={activeAgent}
          onSelectAgent={(name) => void openAgent(name)}
          onNewAgent={() => setNewAgentOpen(true)}
          onShowSessions={() => { setActiveAgent(null); setSidebarOpen(true); }}
        onShowTasks={() => setTasksBoardOpen(true)}
        onShowInbox={() => setInboxOpen(true)}
          orientation={isMobile ? "horizontal" : "vertical"}
          paused={allPaused}
          error={agentsError}
          lastOkAt={agentsLastOkAt}
          onPauseChanged={reloadAgents}
          healthState={healthState}
          />}
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} className="font-sans" style={{ flexShrink: 0, background: "var(--bg-panel)" }}>
        <div style={{ display: "flex", alignItems: "center", position: "relative", borderBottom: "1px solid var(--border)", height: "calc(36px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}>
          <TopBarButton
            onClick={handleSidebarToggle}
            title={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
            aria-label={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
            iconOnly
            style={{ width: TOP_BAR_ICON_BUTTON_SIZE, height: TOP_BAR_ICON_BUTTON_SIZE }}
          >
            {sidebarOpen ? <PanelLeftClose aria-hidden="true" className="!size-4" /> : <PanelLeftOpen aria-hidden="true" className="!size-4" />}
          </TopBarButton>
          {activeAgent && agentDetail && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px", minWidth: 0, flexShrink: 0 }}>
              <AgentAvatar avatar={agentDetail.avatar} size={20} />
              {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{agentDetail.name}</span>}
            </span>
          )}
          {isMobile && activeAgent && (
            <TopBarButton
              aria-label={translate("agents.space.panels")}
              title={translate("agents.space.panels")}
              onClick={() => setSidebarOpen((open) => !open)}
              iconOnly
              style={{ width: TOP_BAR_ICON_BUTTON_SIZE, height: TOP_BAR_ICON_BUTTON_SIZE }}
            ><Info aria-hidden="true" className="!size-4" /></TopBarButton>
          )}
          {isMobile && (
            <div
              ref={mobileToolbarRef}
              data-mobile-toolbar="true"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "stretch",
                flex: 1,
                minWidth: 0,
                height: "100%",
              }}
            >
              {isNarrowMobile && (
                <TopBarButton
                  onClick={handleMobileToolbarMoreToggle}
                  title={mobileToolbarMoreOpen ? translate("chat.close") : translate("chat.moreControls")}
                  aria-label={mobileToolbarMoreOpen ? translate("chat.close") : translate("chat.moreControls")}
                  aria-controls="mobile-toolbar-actions"
                  aria-expanded={mobileToolbarMoreOpen}
                  data-mobile-toolbar-more="true"
                  active={mobileToolbarMoreOpen}
                  iconOnly
                  style={{
                    position: "relative",
                    zIndex: mobileToolbarMoreOpen ? 21 : undefined,
                    width: TOP_BAR_ICON_BUTTON_SIZE, height: TOP_BAR_ICON_BUTTON_SIZE,
                  }}
                >
                  {mobileToolbarMoreOpen ? <X aria-hidden="true" /> : <Ellipsis aria-hidden="true" className="!size-4" />}
                </TopBarButton>
              )}
              {!isNarrowMobile && renderChatToolbarActions(true)}
              {renderSessionStatsButton(true)}
              {renderMainFileToggle(true)}
              {isNarrowMobile && mobileToolbarMoreOpen && (
                <div
                  id="mobile-toolbar-actions"
                  role="toolbar"
                  aria-label={translate("chat.moreControls")}
                  data-mobile-toolbar-actions="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: TOP_BAR_ICON_BUTTON_SIZE,
                    zIndex: 20,
                    display: "flex",
                    alignItems: "stretch",
                    background: "color-mix(in srgb, var(--bg-panel) 94%, var(--bg))",
                    boxShadow: "4px 0 18px rgba(0,0,0,0.12)",
                    backdropFilter: "blur(10px)",
                    overflowX: "auto",
                    scrollbarWidth: "none",
                  }}
                  className="mobile-toolbar-actions-scroll"
                >
                  {renderChatToolbarActions(true)}
                </div>
              )}
            </div>
          )}
          {!isMobile && (
            <>
              {selectedSession && (
                <span data-top-bar-title="true" className="flex min-w-0 items-center gap-2 px-3">
                  <span className="truncate text-[13px] font-semibold text-text">{selectedSession.name || selectedSession.firstMessage?.slice(0, 60) || selectedSession.id.slice(0, 12)}</span>
                  {runningSessionIds.has(selectedSession.id) && (
                    <Badge tone="orange" className="shrink-0">
                      <Led status="running" />{translate("sidebar.agentRunning")}
                    </Badge>
                  )}
                </span>
              )}
              {renderProjectTrustWarning(false)}
              {renderChatToolbarActions(false)}
              {renderSessionStatsButton(false)}
            </>
          )}
          {!isMobile && renderMainFileToggle(false)}
          {isMobile && sessionHasBranches && (
            <BranchNavigator
              tree={branchTree}
              activeLeafId={branchActiveLeafId}
              onLeafChange={handleBranchLeafChange}
              locked={branchSwitchLocked}
              inline
              compact
              containerRef={topBarRef}
              open={activeTopPanel === "branches"}
              onToggle={() => toggleTopPanel("branches")}
              hasSession={showChat}
              hideInlineButton
            />
          )}
          {/* Top panel dropdown — shared, only one active at a time */}
          {activeTopPanel && topPanelPos && (
            <div style={{
              position: "fixed",
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              maxHeight: `calc(100dvh - ${topPanelPos.top}px)`,
              overflowY: "auto",
              zIndex: 500,
              border: "1px solid var(--color-tron-line)",
              boxShadow: "var(--shadow-glow-cyan)",
            }}>
              {activeTopPanel === "agents" && activeSessionFamily && selectedSession && (
                <AgentSessionPanel
                  rootSession={activeSessionFamily.root}
                  subagents={activeSessionFamily.subagents}
                  selectedSessionId={selectedSession.id}
                  runningSessionIds={runningSessionIds}
                  onSelectSession={handleSelectSession}
                />
              )}
              {activeTopPanel === "system" && (
                <SystemPromptPanel
                  loading={systemInfoLoading}
                  prompt={systemPrompt}
                  translate={translate}
                />
              )}
              {activeTopPanel === "tools" && (
                <ToolDefinitionsPanel
                  loading={systemInfoLoading}
                  tools={systemTools}
                  translate={translate}
                />
              )}
              {activeTopPanel === "session" && (
                <div className="session-info-popover" style={{
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border)",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.10)",
                  padding: "12px 16px",
                }}>
                  {sessionStats ? (() => {
                    const formatDuration = (ms: number) => {
                      if (ms <= 0) return "0s";
                      const totalSec = Math.floor(ms / 1000);
                      const h = Math.floor(totalSec / 3600);
                      const m = Math.floor((totalSec % 3600) / 60);
                      const s = totalSec % 60;
                      if (h > 0) return `${h}h ${m}m`;
                      if (m > 0) return `${m}m ${s}s`;
                      return `${s}s`;
                    };
                    const totalActiveMs = sessionStats.totalActiveMs ?? 0;
                    const ws = selectedSession;
                    const sessionRows = [
                       ...(sessionStats.sessionName ? [{ label: translate("session.name"), value: sessionStats.sessionName, copyField: null }] : []),
                       { label: translate("session.file"), value: sessionStats.sessionFile ?? translate("session.inMemory"), copyField: "file" as const },
                       { label: translate("session.id"), value: sessionStats.sessionId, copyField: "id" as const },
                       ...(totalActiveMs > 0 ? [{ label: translate("session.totalActive"), value: formatDuration(totalActiveMs), copyField: null }] : []),
                    ];
                    const toolTimeRows = (sessionStats.toolDurations ?? []).map((tool) => [
                      tool.name,
                      `${(tool.totalMs / 1000).toFixed(1)} s (${tool.calls})`,
                    ]);
                    const projectRows = [
                      ...(ws ? [{ label: translate("session.projectDir"), value: ws.projectRoot ?? ws.cwd, copyField: "projectDir" as const }] : []),
                      ...(ws?.branch ? [{ label: translate("session.gitBranch"), value: ws.branch, copyField: "gitBranch" as const }] : []),
                      ...(ws?.isWorktree ? [{ label: translate("session.gitWorktree"), value: ws.cwd, copyField: "gitWorktree" as const }] : []),
                    ];
                    const messageRows = [
                       [translate("session.user"), sessionStats.userMessages.toLocaleString(locale)],
                       [translate("session.assistant"), sessionStats.assistantMessages.toLocaleString(locale)],
                       [translate("session.toolCalls"), sessionStats.toolCalls.toLocaleString(locale)],
                       [translate("session.toolResults"), sessionStats.toolResults.toLocaleString(locale)],
                       [translate("session.total"), sessionStats.totalMessages.toLocaleString(locale)],
                    ];
                    const tokenRows = [
                       [translate("session.input"), sessionStats.tokens.input.toLocaleString(locale)],
                       [translate("session.output"), sessionStats.tokens.output.toLocaleString(locale)],
                       ...(sessionStats.tokens.cacheRead > 0 ? [[translate("session.cacheRead"), sessionStats.tokens.cacheRead.toLocaleString(locale)]] : []),
                       ...(sessionStats.tokens.cacheWrite > 0 ? [[translate("session.cacheWrite"), sessionStats.tokens.cacheWrite.toLocaleString(locale)]] : []),
                       [translate("session.total"), sessionStats.tokens.total.toLocaleString(locale)],
                    ];
                    const ctx = contextUsage ?? sessionStats.contextUsage;
                    const formatCompact = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
                    const extraTokenRows = [
                       ...(sessionStats.cost > 0 ? [[translate("session.cost"), `$${sessionStats.cost.toFixed(4)}`]] : []),
                       ...(sessionStats.cost === 0 && (sessionStats.costEquivalent ?? 0) > 0 ? [[translate("session.cost"), `≈ $${(sessionStats.costEquivalent ?? 0).toFixed(4)} ${translate("chat.costEquivalent")}`]] : []),
                       ...(ctx?.contextWindow ? [[translate("session.context"), `${ctx.percent !== null ? `${ctx.percent.toFixed(1)}%` : "?"} / ${formatCompact(ctx.contextWindow)}`]] : []),
                       // Cache hit rate = cache reads / (input + cache writes + cache reads) — the denominator covers all input-class tokens.
                       ...(sessionStats.tokens.cacheRead + sessionStats.tokens.cacheWrite > 0 && sessionStats.tokens.cacheRead + sessionStats.tokens.cacheWrite + sessionStats.tokens.input > 0
                         ? [[translate("session.cacheHitRate"), `${(sessionStats.tokens.cacheRead / (sessionStats.tokens.cacheRead + sessionStats.tokens.cacheWrite + sessionStats.tokens.input) * 100).toFixed(1)}%`]]
                         : []),
                    ];
                    const section = (
                      title: string,
                      sectionRows: string[][],
                      valueAlign: "left" | "right" = "left",
                      compact = false,
                    ) => (
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{title}</div>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: compact ? "max-content max-content" : "auto minmax(0, 1fr)",
                            columnGap: compact ? 14 : 12,
                            rowGap: 4,
                            justifyContent: compact ? "start" : undefined,
                          }}>
                            {sectionRows.map(([label, value]) => (
                              <div key={`${title}:${label}`} style={{ display: "contents" }}>
                                <div style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{label}</div>
                                <div style={{
                                  color: "var(--text-muted)",
                                  minWidth: 0,
                                  overflowWrap: compact ? "normal" : "anywhere",
                                  textAlign: valueAlign,
                                  whiteSpace: valueAlign === "right" ? "nowrap" : "normal",
                                }}>{value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    const copyTitleKey: Record<SessionCopyField, string> = {
                      file: "session.copyFile",
                      id: "session.copyId",
                      projectDir: "session.copyProjectDir",
                      gitBranch: "session.copyGitBranch",
                      gitWorktree: "session.copyGitWorktree",
                    };
                    const copyButton = (field: SessionCopyField, value: string) => {
                      const copied = copiedSessionField === field;
                      return (
                        <button
                          type="button"
                          title={copied ? translate("session.copied") : translate(copyTitleKey[field])}
                          onClick={() => handleCopySessionField(field, value)}
                          style={{
                            alignSelf: "start",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            marginTop: -2,
                            color: copied ? "var(--accent)" : "var(--text-dim)",
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            cursor: "pointer",
                            flex: "0 0 auto",
                            transition: "color 0.12s, border-color 0.12s, background 0.12s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--accent)";
                            e.currentTarget.style.borderColor = "var(--accent)";
                            e.currentTarget.style.background = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = copied ? "var(--accent)" : "var(--text-dim)";
                            e.currentTarget.style.borderColor = "var(--border)";
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {copied ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      );
                    };
                    const sessionInfoSection = (
                      <div style={{ minWidth: 0 }}>
                         <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{translate("session.infoSection")}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", columnGap: 12, rowGap: 8, alignItems: "start" }}>
                          {sessionRows.map((row) => (
                            <div key={`session-info:${row.label}`} style={{ display: "contents" }}>
                              <div style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{row.label}</div>
                              <div style={{
                                color: "var(--text-muted)",
                                minWidth: 0,
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                                whiteSpace: "normal",
                              }}>{row.value}</div>
                              <div>{row.copyField ? copyButton(row.copyField, row.value) : null}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                    const projectInfoSection = projectRows.length > 0 ? (
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{translate("session.projectSection")}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", columnGap: 12, rowGap: 8, alignItems: "start" }}>
                          {projectRows.map((row) => (
                            <div key={`project-info:${row.label}`} style={{ display: "contents" }}>
                              <div style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{row.label}</div>
                              <div style={{
                                color: "var(--text-muted)",
                                minWidth: 0,
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                                whiteSpace: "normal",
                              }}>{row.value}</div>
                              <div>{row.copyField ? copyButton(row.copyField, row.value) : null}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;

                    return (
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: isMobile
                          ? "1fr"
                          : "minmax(360px, 1.7fr) minmax(140px, 0.55fr) minmax(190px, 0.75fr)",
                        gap: isMobile ? 16 : 24,
                        fontSize: 12,
                        lineHeight: 1.5,
                        fontFamily: "var(--font-mono)",
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
                          {sessionInfoSection}
                          {projectInfoSection}
                          {toolTimeRows.length > 0 ? section(translate("session.toolTime"), toolTimeRows) : null}
                        </div>
                         {section(translate("session.messages"), messageRows)}
                         {section(translate("session.tokens"), [...tokenRows, ...extraTokenRows], "right", true)}
                      </div>
                    );
                  })() : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                       {translate("session.load")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
        {isMobile && renderProjectTrustWarning(true)}
        </div>

        {/* Chat content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {showChat ? (
            <ChatWindow
              key={sessionKey}
              plannotator={healthState?.plannotator ?? null}
              handToAgents={handToAgents}
              session={selectedSession}
              searchTarget={searchTarget?.sessionId === selectedSession?.id ? searchTarget : null}
              onSearchTargetHandled={handleSearchTargetHandled}
              onRequestSearchTarget={setSearchTarget}
              initialScrollPosition={selectedSession ? sessionScrollPositionsRef.current.get(selectedSession.id) ?? null : null}
              onScrollPositionChange={handleSessionScrollPositionChange}
              sessionRunning={Boolean(selectedSession && runningSessionIds.has(selectedSession.id))}
              newSessionCwd={effectiveNewSessionCwd}
              newSessionDraftKey={newSessionDraftKey}
              newSessionContextBar={newSessionContextBar}
              initialNewSessionChoices={selectedSession === null ? carriedNewSessionChoices : null}
              onNewSessionChoicesChange={handleNewSessionChoicesChange}
              onAgentEnd={handleAgentEnd}
              onAttentionNeeded={handleAttentionNeeded}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={handleSystemPromptChange}
              onSystemToolsChange={handleSystemToolsChange}
              onSystemInfoLoaderChange={handleSystemInfoLoaderChange}
              onSessionStatsChange={handleSessionStatsChange}
              onSessionStatsPanelOpen={openSessionStatsPanel}
              onOpenSettings={openSettingsSection}
              onNewSessionRequested={() => { if (activeCwd) handleNewSession(`cmd-${Date.now()}`, activeCwd); }}
              onResetThread={resetAgentThread}
              onContextUsageChange={handleContextUsageChange}
              onOpenFile={handleOpenLinkedFile}
              onFilesUploaded={handleExplorerRefresh}
              onOpenSession={handleOpenSession}
              onAskInNewChat={handleAskInNewChat}
              quoteSelectionEnabled={quoteSelectionEnabled}
              initialPrompt={pendingQuotePrompt?.sessionId === selectedSession?.id ? pendingQuotePrompt?.text : undefined}
              onInitialPromptConsumed={() => setPendingQuotePrompt(null)}
              soundEnabled={soundEnabled}
              onSoundToggle={onSoundToggle}
              playDoneSound={playDoneSound}
              unlockAudio={unlockAudio}
              unreadMarkerEntryId={activeAgent ? agentUnreadMarker : null}
              unreadCount={activeAgent ? agents.find((agent) => agent.name === activeAgent)?.unread : undefined}
              agentConversation={(() => {
                const item = activeAgent ? agents.find((agent) => agent.name === activeAgent) : undefined;
                return item ? { agent: item, role: agentDetail?.name === item.name ? agentDetail.role : undefined, globalPaused: allPaused, quietHours: healthState?.health.quietHours ?? false } : undefined;
              })()}
              onLatestEntryViewed={activeAgent ? markAgentRead : undefined}
            />
          ) : initialCwdStatus === "validating" ? (
            <div
              role="status"
              style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, color: "var(--text-muted)", textAlign: "center" }}
            >
               <div style={{ fontSize: 14, color: "var(--text)" }}>{translate("workspace.opening")}</div>
              <div style={{ maxWidth: "min(720px, 100%)", overflowWrap: "anywhere", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {initialNavigation.requestedCwd}
              </div>
            </div>
          ) : initialCwdStatus === "error" ? (
            <div
              role="alert"
              style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, color: "var(--text-muted)", textAlign: "center" }}
            >
               <div style={{ fontSize: 14, color: "var(--color-tron-red)" }}>{translate("workspace.unable")}</div>
              <div style={{ maxWidth: "min(720px, 100%)", overflowWrap: "anywhere", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {initialNavigation.requestedCwd}
              </div>
              <div style={{ maxWidth: 720, fontSize: 12 }}>{initialCwdError}</div>
            </div>
          ) : showPlaceholder ? (
            activeCwd ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 15 }}>
                 {translate("workspace.selectSession")}
              </div>
            ) : (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "flex-start", gap: 8, userSelect: "none", pointerEvents: "none" }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <line x1="20" y1="12" x2="4" y2="12" /><polyline points="10 6 4 12 10 18" />
                </svg>
                <div>
                   <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{translate("workspace.getStarted")}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                     <span style={{ color: "var(--text-dim)", marginRight: 6 }}>1.</span>{translate("workspace.selectProject")}<br />
                     <span style={{ color: "var(--text-dim)", marginRight: 6 }}>2.</span>{translate("workspace.addModels")}
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>

      <div
        aria-hidden="true"
        className={`right-panel-overlay-backdrop${rightPanelOpen ? " is-open" : ""}`}
        onClick={() => setRightPanelOpen(false)}
      />
      {rightPanelOpen && (
        <div
          {...rightPanelResizer.separatorProps}
          inert={rightPanelFullWidth}
          aria-controls="file-panel"
          className={`panel-resize-handle right-panel-resize-handle${rightPanelResizer.isResizing ? " is-resizing" : ""}`}
          data-resize-handle="right-panel"
          title={`${translate("layout.resizeFilePanel")}: ${translate("layout.resizeHint")}`}
        />
      )}

      {/* Right panel: file viewer — always mounted, width animated via CSS */}
      <div
        ref={rightPanelResizer.panelRef}
        id="file-panel"
        className={`right-panel-container${rightPanelOpen ? " right-panel-open" : " right-panel-closed"}${rightPanelFullWidth ? " right-panel-full-width" : ""}${rightPanelResizer.isResizing ? " right-panel-resizing" : ""}`}
        style={{
          "--right-panel-width": `${rightPanelResizer.width}px`,
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          background: "var(--bg)",
        } as React.CSSProperties}
      >
        {/* Right panel tab bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          height: "calc(36px + env(safe-area-inset-top))",
          paddingTop: "env(safe-area-inset-top)",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TabBar
              tabs={panelTabs}
              activeTabId={showAgentPanel && !activeFileTab ? AGENT_TAB_ID : activeFileTabId ?? ""}
              onSelectTab={setActiveFileTabId}
              onCloseTab={handleCloseFileTab}
            />
          </div>
          <button
            type="button"
            className="file-panel-expand-button"
            onClick={handleRightPanelExpandToggle}
            aria-controls="file-panel"
            aria-pressed={rightPanelFullWidth}
            title={translate(rightPanelFullWidth ? "files.restorePanelWidth" : "files.expandPanel")}
            aria-label={translate(rightPanelFullWidth ? "files.restorePanelWidth" : "files.expandPanel")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={rightPanelFullWidth
                ? "M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"
                : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"} />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setRightPanelOpen(false)}
            aria-controls="file-panel"
            aria-expanded={rightPanelOpen}
            title={translate("files.hidePanel")}
            aria-label={translate("files.hidePanel")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: TOP_BAR_ICON_BUTTON_SIZE, height: TOP_BAR_ICON_BUTTON_SIZE, padding: 0,
              background: "var(--bg-selected)", border: "none", borderLeft: "1px solid var(--border)",
              color: "var(--text)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(event) => { event.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.color = "var(--text)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>

        {/* Only the active viewer is mounted. Lightweight per-tab state is restored on activation. */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {showAgentPanel ? (
            <div style={{ height: "100%", overflow: "auto" }}>{agentSpaceRight}</div>
          ) : activeFileTab?.filePath ? (
            <FileViewer
              key={`${activeFileTab.id}:${activeFileTab.viewerRevision ?? 0}`}
              filePath={activeFileTab.filePath}
              cwd={activeCwd ?? undefined}
              sourceSessionId={activeFileTab.sourceSessionId}
              gitRefreshKey={explorerRefreshKey}
              initialDisplayMode={activeFileTab.initialDisplayMode}
              initialPage={activeFileTab.page}
              initialState={activeFileTab.viewerState}
              watchEnabled={rightPanelOpen}
              onStateChange={(viewerState) => handleFileViewerStateChange(
                activeFileTab.id,
                activeFileTab.viewerRevision ?? 0,
                viewerState,
              )}
              onMentionLines={rightPanelOpen ? handleFileLineMention : undefined}
              onAtMention={handleAtMention}
              onOpenFile={(filePath, page) => handleOpenFile(
                filePath,
                getFileName(filePath),
                { sourceSessionId: activeFileTab.sourceSessionId, page },
              )}
            />
          ) : !terminalTabs.some((tab) => tab.id === activeFileTabId) ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 12 }}>
               {translate("files.noneOpen")}
            </div>
          ) : null}
          {terminalTabs.map((tab) => (
            <div key={tab.id} hidden={tab.id !== activeFileTabId} style={{ width: "100%", height: "100%" }}>
              <TerminalPanel
                tab={tab}
                active={rightPanelOpen && tab.id === activeFileTabId}
                onRestart={() => setTerminalTabs((tabs) => tabs.map((item) => item.id === tab.id ? { ...item, closing: "restart" } : item))}
                onClosed={() => handleTerminalClosed(tab)}
                onCloseError={() => setTerminalTabs((tabs) => tabs.map((item) => item.id === tab.id ? { ...item, closing: undefined } : item))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
    {settingsSection && (
      <SettingsPanel
        cwd={projectTrustCwd}
        sessionId={selectedSession?.id ?? null}
        initialSection={settingsSection}
        quoteSelectionEnabled={quoteSelectionEnabled}
        onQuoteSelectionChange={handleQuoteSelectionChange}
        onClose={() => {
          setSettingsSection(null);
          setModelsRefreshKey((key) => key + 1);
        }}
        onSessionReloaded={() => setSessionKey((key) => key + 1)}
        projectTrust={projectTrust}
        onOpenTrustDialog={openProjectTrustDialog}
        onProjectTrustChanged={handleProjectTrustChanged}
        onShowShortcuts={openShortcuts}
      />
    )}
    {newAgentOpen && (
      <NewAgentDialog
        onClose={() => setNewAgentOpen(false)}
        agentsHomeDir={agentsHomeDir}
        onCreated={(agent) => { reloadAgents(); void openAgent(agent.name); }}
      />
    )}
    {tasksBoardOpen && (
      <TasksBoard
        agents={agents}
        onClose={() => setTasksBoardOpen(false)}
        onSelectAgent={(name) => { setTasksBoardOpen(false); void openAgent(name); }}
        onOpenSession={(sessionId) => { setTasksBoardOpen(false); void handleOpenSession(sessionId); }}
      />
    )}
    {inboxOpen && (
      <InboxPanel
        onClose={() => setInboxOpen(false)}
        onOpen={(name, entryId) => { setInboxOpen(false); void openAgent(name, entryId); }}
      />
    )}
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={paletteCommands} />
    <Toaster
      theme="dark"
      position={isMobile ? "top-center" : "bottom-right"}
      containerAriaLabel={translate("toasts.region")}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: translate("i18n.close"),
        classNames: {
          toast: "font-sans flex w-[min(92vw,360px)] items-start gap-2 border border-tron-line bg-black px-3 py-2.5 text-sm text-text",
          default: "shadow-glow-cyan",
          info: "shadow-glow-cyan",
          title: "font-medium",
          description: "text-xs text-text-muted",
          error: "border-tron-red/60 text-tron-red shadow-[0_0_14px_rgb(255_77_94/0.35)]",
          warning: "border-tron-orange/60 text-tron-orange shadow-glow-orange",
          success: "text-tron-cyan shadow-glow-cyan",
          closeButton: "order-last ml-auto grid size-7 shrink-0 place-items-center border border-tron-line bg-black text-text-muted hover:text-text pointer-coarse:size-11",
        },
      }}
    />
    {shortcutsOpen && <ShortcutsDialog onClose={() => {
      setShortcutsOpen(false);
      if (shortcutsFromMobileLayerRef.current) {
        shortcutsFromMobileLayerRef.current = false;
        requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-mobile-toolbar-more]")?.focus());
      }
    }} />}
    {/* After Settings, so it opens above it (z-index 1100 over 1000) when Settings › MCP asks for it. */}
    {projectTrustDialogOpen && projectTrustCwd && (
      <ProjectTrustDialog
        cwd={projectTrustCwd}
        busy={projectTrustBusy}
        error={projectTrustError}
        onCancel={() => {
          if (!projectTrustBusy) setProjectTrustDialogOpen(false);
        }}
        onConfirm={() => void handleTrustProject()}
        onStatus={setProjectTrust}
      />
    )}
    </>
  );
}
