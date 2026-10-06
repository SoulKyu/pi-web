import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { resolveSubagentProfile } from "@/lib/subagents";
import { kickRunner, recoverOnce } from "@/lib/agent-ops/kick";
import { shapeTaskList } from "@/lib/agent-ops/task-list";
import { createTask, listTasks } from "@/lib/agent-ops/task-store";

export const dynamic = "force-dynamic";

const TITLE_MAX = 80;

// GET /api/agent-ops/tasks - Every queued/running task plus the newest 200 others, newest first, without prompts and with bounded results (`truncated` when older tasks were cut).
export async function GET() {
  recoverOnce();
  return NextResponse.json(shapeTaskList(listTasks()), { headers: { "Cache-Control": "no-store" } });
}

// POST /api/agent-ops/tasks  body: { profile, cwd, prompt } - Queue a task; the runner starts it.
export async function POST(req: Request) {
  recoverOnce();
  let body: { profile?: unknown; cwd?: unknown; prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { profile, cwd, prompt } = body;
  if (typeof cwd !== "string" || !cwd.trim()) return NextResponse.json({ error: "cwd is required" }, { status: 400 });
  if (!existsSync(cwd)) return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
  if (typeof profile !== "string" || !profile.trim()) return NextResponse.json({ error: "profile is required" }, { status: 400 });
  const resolved = resolveSubagentProfile(cwd, profile);
  if (!resolved) return NextResponse.json({ error: `Unknown or disabled agent profile: ${profile}` }, { status: 400 });
  if (typeof prompt !== "string" || !prompt.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const task = createTask({
    profile: resolved.name,
    cwd,
    prompt,
    title: prompt.trim().split("\n")[0].slice(0, TITLE_MAX),
    origin: "ui",
  });
  // Same as /api/agent/new: the new cwd must be readable through /api/files at once.
  allowFileRoot(cwd);
  invalidateSessionListCache();
  void kickRunner();
  return NextResponse.json({ task }, { status: 201 });
}
