/** Header carrying the trigger's shared secret. */
export const HOOK_SECRET_HEADER = "x-agent-ops-secret";

const HOOK_PATH = /^\/api\/agent-ops\/triggers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/hook$/;

/** The only request proxy.ts lets through without a browser session: it authenticates itself with the trigger's shared secret. */
export function isAgentOpsHookRequest(pathname: string, method: string): boolean {
  return method === "POST" && HOOK_PATH.test(pathname);
}
