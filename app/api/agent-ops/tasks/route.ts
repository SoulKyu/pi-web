import { NextResponse } from "next/server";
import { recoverOnce } from "@/lib/agent-ops/kick";
import { shapeTaskList } from "@/lib/agent-ops/task-list";
import { listTasks } from "@/lib/agent-ops/task-store";

export const dynamic = "force-dynamic";

// GET /api/agent-ops/tasks - every agent's tasks for the global board (no prompts), newest first.
export async function GET() {
  recoverOnce();
  return NextResponse.json(shapeTaskList(listTasks()), { headers: { "Cache-Control": "no-store" } });
}
