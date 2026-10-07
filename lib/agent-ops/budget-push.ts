import { getLongTermAgent } from "../agents/registry";
import { localeText, notifyAgent } from "../web-push";
import { budgetRefusal, spentToday, startOfLocalDay } from "./budget";
import { readRunRecords } from "./run-registry";
import { claimFireToken } from "./scheduler";

/** After a run is recorded: when the agent's daily budget is reached, push once per agent per local day (the `budget.<agent>.<date>` token). Never throws. */
export async function pushBudgetReachedOnce(agentName: string, deps: { notify?: typeof notifyAgent; now?: Date } = {}): Promise<void> {
  try {
    const agent = getLongTermAgent(agentName);
    if (!agent || (agent.budgetTokensPerDay === undefined && agent.budgetUsdPerDay === undefined)) return;
    const now = deps.now ?? new Date();
    const reason = budgetRefusal(agent, spentToday(readRunRecords({ agent: agentName, since: startOfLocalDay(now).toISOString() }), now));
    if (!reason) return;
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (!claimFireToken(`budget.${agentName}.${date}`)) return;
    const kind = reason.includes("token") ? "tokens" : "cost";
    await (deps.notify ?? notifyAgent)((locale) => ({
      title: agentName,
      body: localeText(locale, "agentBudget").replace("{name}", agentName).replace("{kind}", kind),
      url: `/?agent=${encodeURIComponent(agentName)}`,
      tag: `pi-agent-budget:${agentName}:${date}`,
    }));
  } catch (error) {
    console.error("[agent-ops] budget push:", error instanceof Error ? error.message : error);
  }
}
