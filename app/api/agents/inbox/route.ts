import { NextResponse } from "next/server";
import { listTasks } from "@/lib/agent-ops/task-store";
import { inboxItems, type InboxItem } from "@/lib/agents/inbox";
import { listLongTermAgents } from "@/lib/agents/registry";
import { countUnread, threadEntries } from "@/lib/agents/thread";
import { getRpcSession } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

// GET /api/agents/inbox - per agent, what happened since its last visit: cards, replies, finished tasks, a pending approval. One thread read per agent; agents with nothing are omitted.
export async function GET() {
  const now = Date.now();
  const tasks = listTasks();
  const agents = (await Promise.all(listLongTermAgents().map(async (agent) => {
    const entries = await threadEntries(agent);
    const items: InboxItem[] = inboxItems(agent, entries, tasks, now);
    const live = agent.threadSessionId ? getRpcSession(agent.threadSessionId) : undefined;
    if (live?.isAlive() && live.hasPendingUiRequests()) items.unshift({ kind: "approval", title: "needs your answer", at: new Date(now).toISOString() });
    return { name: agent.name, avatar: agent.avatar, unread: countUnread(entries, agent.lastReadEntryId), items };
  }))).filter((agent) => agent.items.length > 0);
  return NextResponse.json({ agents, generatedAt: new Date(now).toISOString() }, { headers });
}
