export const DETAILS_KEY = "pi-agent-details";
export const RAIL_EXPANDED_KEY = "pi-agent-rail-expanded";
/** Below this viewport width the list would squeeze the thread, so a first visit starts collapsed. */
const RAIL_EXPANDED_MIN_WIDTH = 1280;

export const readDetails = (raw: string | null): boolean => raw === "on";
export const readRailExpanded = (raw: string | null, viewportWidth: number): boolean =>
  raw === "on" ? true : raw === "off" ? false : viewportWidth >= RAIL_EXPANDED_MIN_WIDTH;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadDetails(): boolean {
  if (typeof window === "undefined") return false;
  return readDetails(readStored(DETAILS_KEY));
}

export function loadRailExpanded(): boolean {
  if (typeof window === "undefined") return false;
  return readRailExpanded(readStored(RAIL_EXPANDED_KEY), window.innerWidth);
}

export function savePref(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "on" : "off");
  } catch {
    // Private mode or a full quota: the choice lasts for this page only.
  }
}
