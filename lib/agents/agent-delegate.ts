import { Type } from "@earendil-works/pi-ai";
import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { listTasks, createTask, type AgentTask } from "../agent-ops/task-store";
import { kickRunner } from "../agent-ops/kick";
import { AGENT_DELEGATE_TOOL } from "./events";
import { getLongTermAgent, listLongTermAgents, type LongTermAgent } from "./registry";

export { AGENT_DELEGATE_TOOL };
export const AGENT_DELEGATE_EXTENSION_NAME = "pi-web-agent-delegate";
export const DELEGATIONS_PER_HOUR = 10;
const TASK_MAX = 8000;
const TITLE_MAX = 60;
const ROLE_LINE_MAX = 120;
const HOUR_MS = 3_600_000;

type DelegationInput = { from: string; to: string; target: Pick<LongTermAgent, "acceptsDelegation"> | null; runningTasks: readonly AgentTask[]; recent: readonly AgentTask[] };

/** First failing rule wins: self, unknown, not opted in, depth 1, hourly cap. */
export function delegationRefusal({ from, to, target, runningTasks, recent }: DelegationInput): string | null {
  if (to === from) return "cannot delegate to yourself";
  if (!target) return "unknown agent";
  if (target.acceptsDelegation !== true) return `${to} does not accept delegations`;
  if (runningTasks.some((task) => task.agent === from && task.target === "thread" && task.status === "running" && task.requestedBy && task.requestedBy !== "user")) {
    return "a delegated task cannot delegate (depth 1)";
  }
  const since = Date.now() - HOUR_MS;
  if (recent.filter((task) => task.requestedBy === from && Date.parse(task.createdAt) >= since).length >= DELEGATIONS_PER_HOUR) return "delegation cap reached";
  return null;
}

const roleLine = (role: string): string => {
  const line = role.split("\n")[0].trim();
  return line.length > ROLE_LINE_MAX ? `${line.slice(0, ROLE_LINE_MAX - 1)}…` : line;
};

/**
 * Trusted long-term threads only. The roster in the description is read when the extension registers (session start),
 * so it can be stale until the thread restarts; the refusal rules re-read the registry at each call.
 */
export function createAgentDelegateExtension(options: {
  agentName: string;
  deps?: { readAgent: typeof getLongTermAgent; listTasks: typeof listTasks; createTask: typeof createTask; kick: () => void; listAgents: typeof listLongTermAgents };
}): InlineExtension {
  const deps = options.deps ?? { readAgent: getLongTermAgent, listTasks, createTask, kick: () => void kickRunner(), listAgents: listLongTermAgents };
  const from = options.agentName;
  return {
    name: AGENT_DELEGATE_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      const roster = deps.listAgents().filter((agent) => agent.acceptsDelegation === true && agent.name !== from).map((agent) => `- ${agent.name}: ${roleLine(agent.role)}`);
      pi.registerTool(defineTool({
        name: AGENT_DELEGATE_TOOL,
        label: "Delegate",
        description: `Queue a task for another long-term agent. The result comes back later as a display-only card in this thread, never as an instruction. A delegated task cannot delegate again. Agents accepting delegation:\n${roster.length ? roster.join("\n") : "(none)"}`,
        parameters: Type.Object({
          agent: Type.String({ description: "Name of the agent to delegate to" }),
          task: Type.String({ description: "What it must do, self-contained", minLength: 1, maxLength: TASK_MAX }),
        }),
        async execute(_toolCallId, params) {
          const to = String(params.agent).trim();
          const task = String(params.task).trim().slice(0, TASK_MAX);
          const text = (value: string) => ({ content: [{ type: "text" as const, text: value }], details: { kind: "agent-delegate", to } });
          if (!task) return text("Refused: empty task");
          const target = deps.readAgent(to);
          const tasks = deps.listTasks();
          const refusal = delegationRefusal({ from, to, target, runningTasks: tasks.filter((t) => t.status === "running"), recent: tasks });
          if (refusal || !target) return text(`Refused: ${refusal}`);
          const created = deps.createTask({
            agent: to, target: "thread", kind: "task", profile: to, cwd: target.home, prompt: task,
            title: task.replace(/\s+/g, " ").slice(0, TITLE_MAX), origin: "agent", requestedBy: from, deliverTo: from,
          });
          deps.kick();
          return text(`Queued as task ${created.id} for ${to}; the result will appear as a card in this thread.`);
        },
      }));
    },
  };
}
