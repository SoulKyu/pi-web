/** The agent sidebar's tabs; Status (the right panel's content) exists on phones only. */
export type AgentSidebarTab = "files" | "triggers" | "settings" | "status";

export const AGENT_SIDEBAR_TAB_KEY = "pi-agent-sidebar-tab";

const TABS: readonly AgentSidebarTab[] = ["files", "triggers", "settings", "status"];

export function readAgentSidebarTab(raw: string | null, mobile: boolean): AgentSidebarTab {
  const tab = TABS.find((candidate) => candidate === raw) ?? "files";
  return tab === "status" && !mobile ? "files" : tab;
}

export function loadAgentSidebarTab(mobile: boolean): AgentSidebarTab {
  try {
    return readAgentSidebarTab(window.localStorage.getItem(AGENT_SIDEBAR_TAB_KEY), mobile);
  } catch {
    return "files";
  }
}

export function saveAgentSidebarTab(tab: AgentSidebarTab): void {
  try {
    window.localStorage.setItem(AGENT_SIDEBAR_TAB_KEY, tab);
  } catch {
    // The tab still switches when storage is unavailable.
  }
}

