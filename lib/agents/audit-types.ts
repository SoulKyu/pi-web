export type AuditPolicy = "deny" | "egress" | "path";
/** What a policy extension hands to its `onBlock`: kept free of node imports, the profile dialog bundles the policies. */
export interface BlockEvent { toolName: string; input: unknown; toolCallId?: string; parentToolCallId?: string }
