import { NextResponse } from "next/server";
import { kickRunner, recoverOnce } from "@/lib/agent-ops/kick";
import { shapeTaskList } from "@/lib/agent-ops/task-list";
import { createTask, listTasks } from "@/lib/agent-ops/task-store";
import { fenceExternal } from "@/lib/agents/fence";
import { getLongTermAgent } from "@/lib/agents/registry";
import { invalidateSessionListCache } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

const TITLE_MAX = 80;
const PROMPT_MAX = 20_000;
const QUOTE_MAX = 8000;

// GET /api/agents/[name]/tasks - this agent's tasks, shaped like /api/agent-ops/tasks.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  recoverOnce();
  const name = (await params).name;
  if (!getLongTermAgent(name)) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json(shapeTaskList(listTasks().filter((task) => task.agent === name)), { headers: { "Cache-Control": "no-store" } });
}

// POST /api/agents/[name]/tasks  body: { prompt, requestedBy, deliverTo, quote } - Queue a task that runs in the agent's thread when it is idle.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  recoverOnce();
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  let body: { prompt?: unknown; requestedBy?: unknown; deliverTo?: unknown; quote?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { prompt, requestedBy, deliverTo, quote } = body;
  if (typeof prompt !== "string" || !prompt.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > PROMPT_MAX) return NextResponse.json({ error: `prompt is limited to ${PROMPT_MAX} characters` }, { status: 400 });
  // Agents delegate through their own tool, never through this route: only the user hands work over here.
  if (requestedBy !== undefined && requestedBy !== "user") return NextResponse.json({ error: 'requestedBy must be "user"' }, { status: 400 });
  if (deliverTo !== undefined) {
    if (typeof deliverTo !== "string" || !getLongTermAgent(deliverTo)) return NextResponse.json({ error: "deliverTo must name an existing agent" }, { status: 400 });
    if (deliverTo === agent.name) return NextResponse.json({ error: "cannot deliver to the task's own agent" }, { status: 400 });
  }
  if (quote !== undefined && (typeof quote !== "string" || quote.length > QUOTE_MAX)) return NextResponse.json({ error: `quote must be a string of at most ${QUOTE_MAX} characters` }, { status: 400 });
  if (typeof quote === "string" && quote && typeof deliverTo !== "string") return NextResponse.json({ error: "quote needs deliverTo" }, { status: 400 });

  const fullPrompt = typeof quote === "string" && quote.trim()
    ? `${prompt}\n\nContext handed over by the user from agent ${deliverTo}'s thread:\n${fenceExternal(quote, "handoff")}`
    : prompt;
  const task = createTask({
    agent: agent.name, target: "thread", kind: "task", profile: agent.name, cwd: agent.home, prompt: fullPrompt,
    title: prompt.trim().split("\n")[0].slice(0, TITLE_MAX), origin: "ui",
    ...(requestedBy === "user" ? { requestedBy } : {}), ...(typeof deliverTo === "string" ? { deliverTo } : {}),
  });
  invalidateSessionListCache();
  void kickRunner();
  return NextResponse.json({ task }, { status: 201 });
}
