import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { AGENT_NAME_RE } from "./agent-name";

export const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
export const SECRET_VALUE_MAX = 4096;
export const SECRETS_PER_AGENT_MAX = 50;
const RESERVED_NAMES = new Set(["PATH", "HOME", "SHELL", "ENV", "BASH_ENV", "TMPDIR", "USER", "LOGNAME", "IFS", "PS4", "PWD", "OLDPWD", "PROMPT_COMMAND", "SSH_AUTH_SOCK", "PYTHONPATH", "PYTHONSTARTUP", "LANG", "PERL5OPT", "PERL5LIB", "RUBYOPT", "RUBYLIB", "PYTHONHOME", "PYTHONWARNINGS", "PYTHONINSPECT", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "GLIBC_TUNABLES", "GCONV_PATH", "SHELLOPTS", "BASHOPTS", "XDG_CONFIG_HOME", "LESSOPEN", "SSL_CERT_FILE", "CURL_CA_BUNDLE"]);
const RESERVED_PREFIXES = ["PI_", "NODE_", "LD_", "DYLD_", "GIT_", "BASH_FUNC_", "LC_", "NPM_CONFIG_"];

/** Thrown for a refused write; the message never contains the value. */
export class SecretError extends Error {
  constructor(message: string, readonly status: 400 | 404 = 400) { super(message); }
}

const isReserved = (name: string): boolean => RESERVED_NAMES.has(name) || RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix)) || name.toUpperCase().endsWith("_PROXY"); // HTTP_PROXY, https_proxy…

const secretsDir = (): string => join(getAgentDir(), "agents-secrets");

function fileOf(agent: string): string {
  if (!AGENT_NAME_RE.test(agent)) throw new SecretError("invalid agent name");
  return join(secretsDir(), `${agent}.env`);
}

/** Server-only: values must never be logged or returned by a route. */
export function readSecrets(agent: string): Record<string, string> {
  let text: string;
  try { text = readFileSync(fileOf(agent), "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const entries: Array<[string, string]> = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const eq = line.indexOf("=");
    const name = eq > 0 ? line.slice(0, eq) : "";
    if (!SECRET_NAME_RE.test(name) || isReserved(name)) { console.warn(`[agent-secrets] ignored an invalid line in ${agent}.env`); continue; }
    entries.push([name, line.slice(eq + 1)]);
  }
  return Object.fromEntries(entries); // fromEntries defines own properties, so no key can reach a prototype
}

export const listSecretNames = (agent: string): string[] => Object.keys(readSecrets(agent)).sort();

function write(agent: string, secrets: Record<string, string>): void {
  const file = fileOf(agent);
  mkdirSync(secretsDir(), { recursive: true, mode: 0o700 });
  chmodSync(secretsDir(), 0o700);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, Object.entries(secrets).map(([name, value]) => `${name}=${value}\n`).join(""), { mode: 0o600 });
  renameSync(temp, file);
}

export function setSecret(agent: string, name: string, value: string): void {
  if (!SECRET_NAME_RE.test(name)) throw new SecretError("name must be 1-64 characters: A-Z, 0-9 and _, starting with a letter");
  if (isReserved(name)) throw new SecretError("this name is reserved");
  if (typeof value !== "string" || value.length < 1 || value.length > SECRET_VALUE_MAX) throw new SecretError(`value must be 1-${SECRET_VALUE_MAX} characters`);
  if (/[\r\n\0]/.test(value)) throw new SecretError("value must be a single line without NUL");
  const secrets = readSecrets(agent);
  if (!(name in secrets) && Object.keys(secrets).length >= SECRETS_PER_AGENT_MAX) throw new SecretError(`at most ${SECRETS_PER_AGENT_MAX} secrets per agent`);
  write(agent, { ...secrets, [name]: value });
}

export function deleteSecret(agent: string, name: string): void {
  const secrets = readSecrets(agent);
  if (!(name in secrets)) throw new SecretError("unknown secret", 404);
  delete secrets[name];
  write(agent, secrets);
}

export function deleteAllSecrets(agent: string): void {
  rmSync(fileOf(agent), { force: true });
}
