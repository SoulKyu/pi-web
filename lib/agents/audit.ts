import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { redactSecrets, truncate } from "../agent-ops/redact";
import { AGENT_NAME_RE } from "./registry";

export type AuditPolicy = "deny" | "egress" | "path";
/** One tool call (arguments only, never the result) or one policy block. */
export interface AuditLine { at: string; tool: string; args: string; paths?: string[]; isError: boolean; durationMs?: number; nested: boolean; policy?: AuditPolicy }

const ARGS_MAX = 500;
const READ_MAX = 500;
const SHELL_TOOLS = new Set(["bash", "powershell"]);

export const auditDir = (): string => join(getAgentDir(), "agent-ops", "audit");

export function auditArgs(args: unknown): string {
  let json: string | undefined;
  try { json = JSON.stringify(args); } catch { /* circular */ }
  return truncate(redactSecrets(json ?? ""), ARGS_MAX);
}

/** Absolute-path string values of the arguments; a shell command is never scanned. */
export function auditPaths(tool: string, args: unknown): string[] | undefined {
  if (SHELL_TOOLS.has(tool) || !args || typeof args !== "object") return undefined;
  const paths = Object.values(args).filter((value): value is string => typeof value === "string" && value.startsWith("/")).map((value) => truncate(redactSecrets(value), ARGS_MAX));
  return paths.length > 0 ? paths : undefined;
}

export function appendAudit(agent: string, line: AuditLine, dir = auditDir()): void {
  if (!AGENT_NAME_RE.test(agent)) throw new Error("invalid agent name");
  const agentDir = join(dir, agent);
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  appendFileSync(join(agentDir, `${line.at.slice(0, 7)}.jsonl`), `${JSON.stringify(line)}\n`, { mode: 0o600 });
}

/** Never throws: the journal must not break a tool call. */
export function appendAuditSafe(agent: string, line: AuditLine, dir?: string): void {
  try { appendAudit(agent, line, dir); } catch (error) { console.warn("[agent-audit]", error instanceof Error ? error.message : error); }
}

/** Journal line of a call a policy blocked; `onBlock` of the policy extensions. */
export function blockLine(policy: AuditPolicy, event: { toolName: string; input: unknown; parentToolCallId?: unknown; toolCallId?: unknown }): AuditLine {
  const id = typeof event.toolCallId === "string" ? event.toolCallId : "";
  const paths = auditPaths(event.toolName, event.input);
  return { at: new Date().toISOString(), tool: event.toolName, args: auditArgs(event.input), ...(paths ? { paths } : {}), isError: true, nested: id.includes("/") || typeof event.parentToolCallId === "string", policy };
}

const previousMonth = (month: string): string => {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
};

/** Newest `limit` lines (default 50, max 500) of this and the previous month, oldest first. */
export function readAudit(agent: string, { limit = 50, dir = auditDir(), now = new Date() }: { limit?: number; dir?: string; now?: Date } = {}): AuditLine[] {
  if (!AGENT_NAME_RE.test(agent)) return [];
  const cap = Math.min(Math.max(Math.trunc(limit) || 50, 1), READ_MAX);
  const month = now.toISOString().slice(0, 7);
  const lines: AuditLine[] = [];
  for (const file of [previousMonth(month), month]) {
    let text: string;
    try { text = readFileSync(join(dir, agent, `${file}.jsonl`), "utf8"); } catch { continue; }
    for (const raw of text.split("\n")) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as AuditLine;
        if (parsed && typeof parsed.at === "string" && typeof parsed.tool === "string") lines.push(parsed);
      } catch { /* broken line: skip */ }
    }
  }
  return lines.slice(-cap);
}

type SessionEvent = { type: string; toolCallId?: unknown; toolName?: unknown; args?: unknown; parentToolCallId?: unknown; isError?: unknown };

/** Journal every tool call of an agent-profile session. Subscribed once per session; never throws. */
export function createAuditObserver(agent: string, dir?: string): (event: SessionEvent) => void {
  const started = new Map<string, { tool: string; args: unknown; at: number }>();
  let warned = false;
  return (event) => {
    try {
      if (typeof event.toolCallId !== "string") return;
      if (event.type === "tool_execution_start") {
        started.set(event.toolCallId, { tool: String(event.toolName), args: event.args, at: Date.now() });
      } else if (event.type === "tool_execution_end") {
        const call = started.get(event.toolCallId);
        started.delete(event.toolCallId);
        const tool = call?.tool ?? String(event.toolName);
        const paths = auditPaths(tool, call?.args);
        appendAudit(agent, {
          at: new Date().toISOString(), tool, args: auditArgs(call?.args), ...(paths ? { paths } : {}), isError: event.isError === true,
          ...(call ? { durationMs: Date.now() - call.at } : {}), nested: event.toolCallId.includes("/") || typeof event.parentToolCallId === "string",
        }, dir);
      }
    } catch (error) {
      if (!warned) { warned = true; console.warn("[agent-audit]", error instanceof Error ? error.message : error); }
    }
  };
}
