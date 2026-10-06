import { NextResponse } from "next/server";
import { kickRunner, recoverOnce } from "@/lib/agent-ops/kick";
import { shapeTaskList } from "@/lib/agent-ops/task-list";
import { createTask, listTasks } from "@/lib/agent-ops/task-store";
import { getLongTermAgent } from "@/lib/agents/registry";
import { invalidateSessionListCache } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

const TITLE_MAX = 80;
const PROMPT_MAX = 20_000;

// GET /api/agents/[name]/tasks - this agent's tasks, shaped like /api/agent-ops/tasks.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  recoverOnce();
  const name = (await params).name;
  if (!getLongTermAgent(name)) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json(shapeTaskList(listTasks().filter((task) => task.agent === name)), { headers: { "Cache-Control": "no-store" } });
}

// POST /api/agents/[name]/tasks  body: { prompt } - Queue a task that runs in the agent's thread when it is idle.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  recoverOnce();
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { prompt } = body;
  if (typeof prompt !== "string" || !prompt.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > PROMPT_MAX) return NextResponse.json({ error: `prompt is limited to ${PROMPT_MAX} characters` }, { status: 400 });

  const task = createTask({
    agent: agent.name, target: "thread", kind: "task", profile: agent.name, cwd: agent.home, prompt,
    title: prompt.trim().split("\n")[0].slice(0, TITLE_MAX), origin: "ui",
  });
  invalidateSessionListCache();
  void kickRunner();
  return NextResponse.json({ task }, { status: 201 });
}
