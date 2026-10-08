import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Path of the first executable `bwrap` on PATH, or null. Scans only: never spawns it. */
export function bwrapAvailable(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, "bwrap");
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* next entry */ }
  }
  return null;
}

/** Whole filesystem read-only, /tmp and the agent home writable, ~/.ssh and the pi agent dir hidden (its bin dir stays readable), no network unless allowed. */
export function sandboxArgs(
  home: string,
  { network, agentDir = getAgentDir(), homeDir = homedir(), tmpDir = "/tmp" }: { network: boolean; agentDir?: string; homeDir?: string; tmpDir?: string },
): string[] {
  return [
    "--ro-bind", "/", "/",
    "--bind", tmpDir, tmpDir,
    "--tmpfs", join(homeDir, ".ssh"),
    "--tmpfs", agentDir,
    "--ro-bind", join(agentDir, "bin"), join(agentDir, "bin"),
    // After the agentDir tmpfs: the home lives under it and would be hidden otherwise.
    "--bind", home, home,
    ...(network ? [] : ["--unshare-net"]),
    "--die-with-parent",
  ];
}

export const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

export const wrapWithSandbox = (command: string, args: string[]): string =>
  `bwrap ${args.map(shellQuote).join(" ")} -- sh -c ${shellQuote(command)}`;

/** The bash wrapper of a trusted thread whose profile asks for bubblewrap; undefined (bash runs as before) otherwise or, with a warning, when bwrap is missing. Isolated runs are never wrapped. */
export function threadSandboxWrapper(
  trustedThread: boolean,
  profile: { name: string; sandbox?: "none" | "bubblewrap"; sandboxNetwork?: boolean } | undefined,
  home: string,
  env: NodeJS.ProcessEnv = process.env,
): ((command: string) => string) | undefined {
  if (!trustedThread || profile?.sandbox !== "bubblewrap") return undefined;
  if (bwrapAvailable(env) === null) {
    console.warn(`[pi-web] agent ${profile.name} asks for the bubblewrap sandbox but bwrap is not installed: bash runs unsandboxed`);
    return undefined;
  }
  const args = sandboxArgs(home, { network: profile.sandboxNetwork === true });
  return (command) => wrapWithSandbox(command, args);
}
