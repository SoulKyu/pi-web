export function curationPrompt(_agentName: string, snapshotPath: string): string {
  return [
    `Weekly memory curation. Read your memory snapshot at ${snapshotPath} (JSON, field "memories": id, text, createdAt, source).`,
    "1. Group facts by topic. For exact duplicates keep the newest and call memory_forget on the others (ids from the file).",
    "2. List facts that look outdated, project-specific or that describe a one-off result rather than how you work: give their ids and one line each. Do NOT forget them yourself: the user decides.",
    "3. If MEMORY.md exists in your home, update it from what remains (short, one line per fact).",
    "Answer with the two lists.",
  ].join("\n");
}
