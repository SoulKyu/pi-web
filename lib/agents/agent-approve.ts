import { Type } from "@earendil-works/pi-ai";
import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { notifyAgent, localeText, type PushPayload } from "../web-push";
import { AGENT_APPROVE_TOOL } from "./events";

export { AGENT_APPROVE_TOOL };
export const AGENT_APPROVE_EXTENSION_NAME = "pi-web-agent-approve";
/** Under the 30 min run deadline. */
export const APPROVE_TIMEOUT_MS = 25 * 60_000;
const TITLE_MAX = 120;
const SUMMARY_MAX = 1000;

/** Trusted long-term threads only. A declared policy, not a barrier: the model can skip the call. */
export function createAgentApproveExtension(options: {
  agentName: string;
  notify?: (payloadFor: (locale: string) => PushPayload) => Promise<void>;
  timeoutMs?: number;
}): InlineExtension {
  const notify = options.notify ?? notifyAgent;
  const timeout = options.timeoutMs ?? APPROVE_TIMEOUT_MS;
  return {
    name: AGENT_APPROVE_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.registerTool(defineTool({
        name: AGENT_APPROVE_TOOL,
        label: "Approve",
        description: "Ask the user to approve an action before you take it (deploy, delete, payment, sending to a third party). This is a request to the user, not a guarantee: the answer is `approved` or `denied` (no answer in time counts as denied). Never act on `denied`.",
        parameters: Type.Object({
          title: Type.String({ description: "What you want to do, one short line" }),
          summary: Type.String({ description: "What it changes and why" }),
        }),
        annotations: { readOnlyHint: true },
        async execute(toolCallId, params, _signal, _onUpdate, ctx) {
          const title = String(params.title).trim().slice(0, TITLE_MAX);
          const summary = String(params.summary).trim().slice(0, SUMMARY_MAX);
          try {
            await notify((locale) => ({
              title: options.agentName,
              body: localeText(locale, "agentApprove").replace("{name}", options.agentName).replace("{title}", title),
              url: `/?agent=${encodeURIComponent(options.agentName)}`,
              tag: `pi-agent-approve:${options.agentName}:${toolCallId}`,
            }));
          } catch (error) {
            console.error("[agent_approve] push failed:", error instanceof Error ? error.message : error);
          }
          const approved = ctx?.ui ? await ctx.ui.confirm(title, summary, { timeout }) : false;
          const decision = approved ? "approved" : "denied";
          return { content: [{ type: "text", text: decision }], details: { kind: "agent-approve", title, decision } };
        },
      }));
    },
  };
}
