import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { isExternalContentTool } from "./untrusted-content";

export const EGRESS_POLICY_EXTENSION_NAME = "pi-web-egress-policy";
export const HOST_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const hostnameOf = (url: string): string | null => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
};

/** `example.com` matches itself; `*.example.com` matches any subdomain but not the apex. Port ignored, invalid URL refused. */
export function hostAllowed(url: string, allow: readonly string[]): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  const isIp = host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host);
  return allow.some((entry) => {
    const pattern = entry.toLowerCase();
    if (pattern.startsWith("*.")) return !isIp && host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
    return host === pattern;
  });
}

const urlFields = (fields: unknown): string[] => {
  if (!fields || typeof fields !== "object") return [];
  const { url, uri, urls } = fields as Record<string, unknown>;
  return [url, uri, ...(Array.isArray(urls) ? urls : [])].filter((value): value is string => typeof value === "string");
};

/** Tools without a URL field (web_search, bash…) yield nothing to filter: a documented limit. */
export function urlsOfToolInput(toolName: string, input: unknown): string[] {
  if (toolName === "fetch_content") return urlFields(input);
  if (toolName === "mcp") return urlFields((input as { args?: unknown } | undefined)?.args);
  if (toolName.startsWith("mcp__")) return urlFields(input);
  return [];
}

export function egressDenyReason(toolName: string, input: unknown, allow: readonly string[]): string | null {
  if (!isExternalContentTool(toolName)) return null;
  for (const url of urlsOfToolInput(toolName, input)) {
    if (!hostAllowed(url, allow)) return `web host not allowed by the agent's policy: ${hostnameOf(url) ?? "invalid URL"}`;
  }
  return null;
}

/** Top-level and nested (codemode) calls all pass through tool_call. */
export function createEgressPolicyExtension(allow: readonly string[]): InlineExtension {
  const hosts = [...allow];
  return {
    name: EGRESS_POLICY_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        try {
          const reason = egressDenyReason(event.toolName, event.input, hosts);
          return reason ? { block: true, reason } : undefined;
        } catch {
          return { block: true, reason: "egress policy error" };
        }
      });
    },
  };
}
