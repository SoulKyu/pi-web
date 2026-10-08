/** `@Agent prompt` at the very start of a composer message queues a task for that agent (client-safe, no lookbehind). */
export function parseAgentMention(text: string, agents: readonly string[]): { agent: string; prompt: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("@")) return null;
  const match = /^@(\S+)\s+([\s\S]+)$/.exec(trimmed);
  if (!match || !agents.includes(match[1])) return null;
  const prompt = match[2].trim();
  return prompt ? { agent: match[1], prompt } : null;
}

export function agentMentionMatches(prefix: string, agents: readonly string[]): string[] {
  const lower = prefix.toLowerCase();
  return agents.filter((name) => name.toLowerCase().startsWith(lower));
}
