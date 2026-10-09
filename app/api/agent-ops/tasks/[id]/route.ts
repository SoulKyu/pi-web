import { NextResponse } from "next/server";
import { getRpcSession } from "@/lib/rpc-manager";
import { kickRunner, recoverOnce } from "@/lib/agent-ops/kick";
import { cancelQueuedChildren, cancelTask, createTask, getTask, TERMINAL, updateTask, type AgentTask } from "@/lib/agent-ops/task-store";
import { getTrigger, triggerPinStatus } from "@/lib/agent-ops/trigger-store";
import { appendTriggerLog } from "@/lib/agent-ops/trigger-log";
import { reminderAuditLine } from "@/lib/agents/agent-remind";
import { appendAuditSafe } from "@/lib/agents/audit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** A finished task repeated as a NEW task (terminal states are immutable); a trigger task re-checks its trigger's pin first. */
function retryTask(task: AgentTask): Response {
  if (!TERMINAL.has(task.status)) return NextResponse.json({ error: "Task is not finished" }, { status: 409 });
  if (task.triggerId) {
    const trigger = getTrigger(task.triggerId);
    if (!trigger) return NextResponse.json({ error: "trigger removed" }, { status: 409 });
    if (triggerPinStatus(trigger) === "drift") return NextResponse.json({ error: "profile drifted since this trigger was validated" }, { status: 409 });
  }
  const { profile, cwd, prompt, title, origin, triggerId, pinnedProfileSha256, agent, target, kind, model, tools, maxRunMs } = task;
  const created = createTask({
    profile, cwd, prompt, title, origin, triggerId, pinnedProfileSha256, agent, target, kind, model, tools, maxRunMs,
    retryOf: task.id, attempt: (task.attempt ?? 1) + 1, fireReason: { source: "manual" }, // no notBefore: a retry runs now
  });
  if (triggerId) appendTriggerLog(triggerId, { at: new Date().toISOString(), source: "manual", verdict: "accepted", taskId: created.id, reason: `retry of ${task.id.slice(0, 8)}` });
  void kickRunner();
  return NextResponse.json({ task: created }, { status: 201 });
}

// POST /api/agent-ops/tasks/[id]  body: { message } steers a running task's session | { action: "retry" } repeats a finished task as a new one.
export async function POST(req: Request, { params }: Context) {
  recoverOnce();
  const task = getTask((await params).id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  let body: { message?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.action !== undefined) {
    if (body.message !== undefined || body.action !== "retry") return NextResponse.json({ error: "send either message or action: \"retry\"" }, { status: 400 });
    return retryTask(task);
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

// DELETE /api/agent-ops/tasks/[id] - Cancel a queued or running task, then its queued children (running children keep going).
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
  const after = getTask(id);
  if (task.kind === "reminder" && task.agent && !TERMINAL.has(task.status) && after?.status === "cancelled") appendAuditSafe(task.agent, reminderAuditLine(task, "cancel"));
  return NextResponse.json({ task: after, cancelledChildren: cancelQueuedChildren(id) });
}
