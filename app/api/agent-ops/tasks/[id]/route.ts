import { NextResponse } from "next/server";
import { getRpcSession } from "@/lib/rpc-manager";
import { recoverOnce } from "@/lib/agent-ops/kick";
import { cancelTask, getTask, updateTask } from "@/lib/agent-ops/task-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// POST /api/agent-ops/tasks/[id]  body: { message } - Steer a running task's session.
export async function POST(req: Request, { params }: Context) {
  recoverOnce();
  const task = getTask((await params).id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const session = task.status === "running" && task.sessionId ? getRpcSession(task.sessionId) : undefined;
  if (!session) return NextResponse.json({ error: "Task is not running a session" }, { status: 409 });
  try {
    await session.send({ type: "steer", message: body.message });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

// DELETE /api/agent-ops/tasks/[id] - Cancel a queued or running task.
export async function DELETE(_req: Request, { params }: Context) {
  recoverOnce();
  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  let current = task;
  if (task.status === "queued") {
    try { cancelTask(id); } catch { /* raced with another writer: the re-read below decides */ }
    current = getTask(id) ?? task; // the runner may have claimed it meanwhile
  }
  if (current.status === "running") {
    // Status first: a task still starting has no session to abort yet; the runner re-reads
    // the status right after start() and aborts the session itself.
    try {
      updateTask(id, { status: "cancelled", completedAt: new Date().toISOString() });
    } catch { /* already terminal: answer with the current status */ }
    if (current.sessionId) await getRpcSession(current.sessionId)?.send({ type: "abort" }).catch(() => {});
  }
  return NextResponse.json({ task: getTask(id) });
}
