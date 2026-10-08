import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { isMcpTool } from "../mcp-read-only-policy";
import { isExternalContentTool } from "./untrusted-content";

export const EGRESS_POLICY_EXTENSION_NAME = "pi-web-egress-policy";
export const HOST_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const NETWORK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

const hostnameOf = (url: string): string | null => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
};

/** Host of a URL the policy can reason about: no backslash (parsers disagree on it), no userinfo, a network protocol only. */
const checkedHostOf = (url: string): string | null => {
  if (url.includes("\\")) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || !NETWORK_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase();
  } catch { return null; }
};

/** `example.com` matches itself; `*.example.com` matches any subdomain but not the apex. Port ignored; invalid URL, backslash, userinfo and non-network protocols refused. */
export function hostAllowed(url: string, allow: readonly string[]): boolean {
  const host = checkedHostOf(url);
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

const URL_START_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DEEP_SCAN_MAX_DEPTH = 10;
const SCRIPT_TOOL_RE = /Script$/;

/** Every string value that starts with a scheme, at any depth: the adapter's tool arguments have no fixed URL field. */
function deepUrls(value: unknown, depth = 0): string[] {
  if (typeof value === "string") {
    const normalized = value.replace(/[\t\n\r]/g, "").replace(/^[\x00-\x20]+/, "");
    return URL_START_RE.test(normalized) ? [normalized] : [];
  }
  if (depth >= DEEP_SCAN_MAX_DEPTH) throw new Error("input too deep");
  if (Array.isArray(value)) return value.flatMap((item) => deepUrls(item, depth + 1));
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => deepUrls(item, depth + 1));
  return [];
}

/** The adapter accepts `args` as a JSON string; throws on invalid JSON. */
function withParsedArgs(input: unknown): unknown {
  if (!input || typeof input !== "object" || typeof (input as { args?: unknown }).args !== "string") return input;
  return { ...input, args: JSON.parse((input as { args: string }).args) };
}

/** Tools without a URL field (web_search, bash…) yield nothing to filter: a documented limit. `adapter`: a pi-mcp-adapter tool, whose input is deep-scanned. */
export function urlsOfToolInput(toolName: string, input: unknown, adapter = false): string[] {
  if (toolName === "fetch_content") return urlFields(input);
  if (adapter || toolName === "mcp" || toolName.startsWith("mcp__")) return deepUrls(input);
  return [];
}

const isSet = (value: unknown): boolean => value !== undefined && value !== null && value !== "" && value !== false;

export function egressDenyReason(toolName: string, input: unknown, allow: readonly string[], adapter = false): string | null {
  if (!adapter && toolName !== "mcpScript" && !isExternalContentTool(toolName)) return null;
  const fields = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (toolName === "mcpScript" || (adapter && SCRIPT_TOOL_RE.test(toolName))) return "scripts cannot be filtered by the agent's web-host policy";
  if (isSet(fields.proxy)) return "proxy not allowed by the agent's policy";
  if ((toolName === "web_search" && fields.includeContent === true) || (toolName === "source_check" && fields.fetchContent === true)) return "fetching search results is not allowed by the agent's policy";
  if (toolName === "mcp" && fields.action === "install") return "mcp install not allowed by the agent's policy";
  let scanned = input;
  try { scanned = withParsedArgs(input); } catch { if (toolName === "mcp") return "invalid mcp args"; }
  for (const url of urlsOfToolInput(toolName, scanned, adapter)) {
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
          const tool = pi.getAllTools().find((candidate) => candidate.name === event.toolName);
          const reason = egressDenyReason(event.toolName, event.input, hosts, tool !== undefined && isMcpTool(tool));
          return reason ? { block: true, reason } : undefined;
        } catch {
          return { block: true, reason: "egress policy error" };
        }
      });
    },
  };
}
