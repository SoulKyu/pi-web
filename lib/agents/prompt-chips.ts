const MAX_PROMPT_CHIPS = 12;

export function promptChipsOf(entries: Array<{ name: string; isDir: boolean }>): string[] {
  return entries
    .filter((entry) => !entry.isDir && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_PROMPT_CHIPS);
}
