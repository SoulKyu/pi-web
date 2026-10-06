import { Type } from "@earendil-works/pi-ai";
import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { notifyAgent, type PushPayload } from "../web-push";
import { AGENT_NOTIFY_TOOL } from "./events";

export { AGENT_NOTIFY_TOOL };
export const AGENT_NOTIFY_EXTENSION_NAME = "pi-web-agent-notify";
const BODY_MAX = 500;

/** Registered only in trusted long-term threads (lib/rpc-manager.ts): the one way an agent reaches the user's phone (D9). */
export function createAgentNotifyExtension(options: {
  agentName: string;
  notify?: (payloadFor: (locale: string) => PushPayload) => Promise<void>;
}): InlineExtension {
  const notify = options.notify ?? notifyAgent;
  return {
    name: AGENT_NOTIFY_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.registerTool(defineTool({
        name: AGENT_NOTIFY_TOOL,
        label: "Notify",
        description: "Send the user a push notification for something important that cannot wait for them to open the thread (an incident, a decision they must take). Everything else belongs in your normal reply.",
        parameters: Type.Object({ text: Type.String({ description: "One or two sentences" }) }),
        annotations: { readOnlyHint: true },
        async execute(_id, params) {
          const text = String(params.text).trim().slice(0, BODY_MAX);
          await notify(() => ({
            title: options.agentName,
            body: text,
            url: `/?agent=${encodeURIComponent(options.agentName)}`,
            tag: `pi-agent-notify:${options.agentName}:${Date.now()}`,
          }));
          return { content: [{ type: "text", text: "Notification sent." }], details: { kind: "agent-notify", text } };
        },
      }));
    },
  };
}
