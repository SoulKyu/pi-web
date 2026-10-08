import { NextResponse } from "next/server";
import { quarantineAgent } from "@/lib/agents/quarantine";
import { getLongTermAgent } from "@/lib/agents/registry";
import { registryErrorResponse } from "@/lib/agents/registry-response";
import { withThreadLock } from "@/lib/agents/thread";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" }; // the response carries fresh webhook secrets
type Context = { params: Promise<{ name: string }> };
const notFound = () => NextResponse.json({ error: "Agent not found" }, { status: 404, headers });

// POST: incident response in one action: pause, stop and cancel tasks, archive the thread (no new one), set staged
// memories aside, rotate webhook secrets (returned once). No 409: quarantine forces.
export async function POST(_req: Request, { params }: Context) {
  const { name } = await params;
  if (!getLongTermAgent(name)) return notFound();
  try {
    return await withThreadLock(name, async () => {
      const agent = getLongTermAgent(name);
      if (!agent) return notFound();
      return NextResponse.json(await quarantineAgent(agent), { headers });
    });
  } catch (error) { return registryErrorResponse(error); }
}
