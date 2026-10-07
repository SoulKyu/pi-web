/** Client-safe list of the trigger allowlist tools; trigger-store.ts builds TRIGGER_TOOL_ALLOWLIST from it. */
export const TRIGGER_TOOL_NAMES = ["read", "grep", "find", "ls", "memory_search", "memory_save"] as const;
