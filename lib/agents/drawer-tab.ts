export type DrawerTab = "home" | "status";

export const DRAWER_TAB_KEY = "pi-agent-drawer-tab";

export function readDrawerTab(raw: string | null): DrawerTab {
  return raw === "status" ? "status" : "home";
}
