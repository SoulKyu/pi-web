import { normalizeFilePathSlashes } from "@/lib/file-paths";
import type { Tab } from "./TabBar";

const MAX_HINT_FOLDERS = 2;

const lastFolders = (folders: readonly string[], count: number): string => folders.slice(-count).join("/");

/**
 * Folder hint for file tabs that share a label: per tab, the shortest run of
 * trailing parent folders (at most 2) no namesake shares, `…/`-prefixed when 2
 * still clash and more folders sit above. Keyed by tab id; unique labels,
 * terminals, pseudo-tabs and files at the root get none.
 */
export function tabLabelSuffixes(tabs: readonly Pick<Tab, "id" | "label" | "filePath" | "kind" | "closable">[]): Map<string, string> {
  const byLabel = new Map<string, { id: string; folders: string[] }[]>();
  for (const tab of tabs) {
    if (tab.kind === "terminal" || tab.closable === false) continue;
    const folders = normalizeFilePathSlashes(tab.filePath).split("/").filter(Boolean).slice(0, -1);
    byLabel.set(tab.label, [...(byLabel.get(tab.label) ?? []), { id: tab.id, folders }]);
  }

  const suffixes = new Map<string, string>();
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    for (const { id, folders } of group) {
      const clashes = (count: number) => group.some((other) => other.id !== id && lastFolders(other.folders, count) === lastFolders(folders, count));
      let count = 1;
      while (count < MAX_HINT_FOLDERS && clashes(count)) count++;
      const hint = lastFolders(folders, count);
      if (!hint) continue;
      suffixes.set(id, clashes(count) && folders.length > count ? `…/${hint}` : hint);
    }
  }
  return suffixes;
}
