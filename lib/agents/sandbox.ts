import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const isUnder = (path: string, root: string): boolean => path === root || path.startsWith(`${root}${sep}`);

/** Absolute path of the first executable `bwrap` on PATH, or null. Scans only: never spawns it.
 *  PATH entries under `skipUnder` are ignored: the project command PATH starts with `<agentDir>/bin`, where an unsandboxed bash could drop a shim. */
export function bwrapAvailable(
  env: NodeJS.ProcessEnv = process.env,
  { skipUnder = [getAgentDir(), join(homedir(), ".pi")] }: { skipUnder?: string[] } = {},
): string | null {
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    if (skipUnder.some((root) => isUnder(resolve(dir), root))) continue;
    const candidate = join(dir, "bwrap");
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* next entry */ }
  }
  return null;
}

/** Whole filesystem read-only; own PID namespace and a fresh /proc (no /proc/<pi-web pid>/root or environ), own IPC, empty /run (no
 *  user bus, docker.sock, ssh-agent) and empty /tmp (private to the sandbox); the whole home and the agent dir are hidden, only
 *  the agent bin dir (read-only) and the agent home (read-write) come back; no network unless allowed. */
export function sandboxArgs(
  home: string,
  { network, agentDir = getAgentDir(), homeDir = homedir() }: { network: boolean; agentDir?: string; homeDir?: string },
): string[] {
  return [
    "--ro-bind", "/", "/",
    "--unshare-pid",
    "--proc", "/proc",
    "--dev", "/dev",
    "--unshare-ipc",
    "--tmpfs", "/run",
    ...(network ? ["--ro-bind-try", "/run/systemd/resolve", "/run/systemd/resolve"] : []), // Ubuntu's /etc/resolv.conf points into it
    "--tmpfs", "/tmp",
    "--tmpfs", homeDir,
    "--tmpfs", agentDir, // redundant when the agent dir sits under the home, needed when PI_CODING_AGENT_DIR points elsewhere
    "--ro-bind-try", join(agentDir, "bin"), join(agentDir, "bin"),
    // Last: the agent home lives under the tmpfs mounts and would be hidden otherwise.
    "--bind", home, home,
    ...(network ? [] : ["--unshare-net"]),
    "--die-with-parent",
  ];
}

export const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** `bwrapPath` is absolute: a bare `bwrap` would be resolved on a PATH an unsandboxed bash can write into. */
export const wrapWithSandbox = (command: string, args: string[], bwrapPath: string): string =>
  `${shellQuote(bwrapPath)} ${args.map(shellQuote).join(" ")} -- sh -c ${shellQuote(command)}`;

/** The bash wrapper of a trusted thread (the command runs under `sh -c` inside the cage: a bash-only `shellCommandPrefix` fails there) whose profile asks for bubblewrap; undefined (bash runs as before) otherwise or, with a warning, when bwrap is missing. Isolated runs are never wrapped. */
export function threadSandboxWrapper(
  trustedThread: boolean,
  profile: { name: string; sandbox?: "none" | "bubblewrap"; sandboxNetwork?: boolean } | undefined,
  home: string,
  env: NodeJS.ProcessEnv = process.env,
): ((command: string) => string) | undefined {
  if (!trustedThread || profile?.sandbox !== "bubblewrap") return undefined;
  const bwrapPath = bwrapAvailable(env);
  if (bwrapPath === null) {
    console.warn(`[pi-web] agent ${profile.name} asks for the bubblewrap sandbox but bwrap is not installed: bash runs unsandboxed`);
    return undefined;
  }
  const args = sandboxArgs(home, { network: profile.sandboxNetwork === true });
  return (command) => wrapWithSandbox(command, args, bwrapPath);
}
