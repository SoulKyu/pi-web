import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-sandbox-")); // before the imports
const { bwrapAvailable, sandboxArgs, shellQuote, threadSandboxWrapper, wrapWithSandbox } = await (await import("jiti")).createJiti(import.meta.url).import("./sandbox.ts");

const opts = { agentDir: "/h/.pi/agent", homeDir: "/h" };
const home = "/h/.pi/agent/agents-home/a"; // the real layout: the home sits inside the agent dir

test("sandboxArgs lists the exact mounts in order, network off; the home is bound last", () => {
  assert.deepEqual(sandboxArgs(home, { network: false, ...opts }), [
    "--ro-bind", "/", "/", "--unshare-pid", "--proc", "/proc", "--dev", "/dev", "--unshare-ipc",
    "--tmpfs", "/run", "--tmpfs", "/tmp", "--tmpfs", "/h", "--tmpfs", "/h/.pi/agent",
    "--ro-bind-try", "/h/.pi/agent/bin", "/h/.pi/agent/bin",
    "--bind", home, home, "--unshare-net", "--die-with-parent",
  ]);
});

test("pid and ipc namespaces, fresh /proc, empty /run and /tmp; no host /tmp bind", () => {
  const args = sandboxArgs(home, { network: false, ...opts });
  for (const flag of ["--unshare-pid", "--unshare-ipc"]) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf("/proc") - 1], "--proc");
  assert.equal(args[args.indexOf("/run") - 1], "--tmpfs");
  assert.equal(args[args.indexOf("/tmp") - 1], "--tmpfs");
  assert.ok(!args.includes("--bind") || args[args.indexOf("--bind") + 1] === home);
});

test("--unshare-net iff network is false; the home is bound read-write exactly once", () => {
  const on = sandboxArgs(home, { network: true, ...opts });
  assert.ok(!on.includes("--unshare-net"));
  assert.ok(sandboxArgs(home, { network: false, ...opts }).includes("--unshare-net"));
  assert.equal(on.filter((arg) => arg === home).length, 2); // one --bind source + destination
  assert.equal(on[on.indexOf(home) - 1], "--bind");
});

test("the whole home is tmpfs before the home bind; the agent bin dir is an optional read-only bind", () => {
  const args = sandboxArgs(home, { network: false, ...opts });
  assert.equal(args[args.indexOf("/h") - 1], "--tmpfs");
  assert.ok(args.indexOf("/h") < args.indexOf(home));
  const bin = args.indexOf("/h/.pi/agent/bin");
  assert.equal(args[bin - 1], "--ro-bind-try");
  assert.ok(bin > args.indexOf("/h/.pi/agent"));
});

test("shellQuote round-trips a command with single quotes through sh", () => {
  const command = `echo 'a b' "c" $HOME; echo it's`;
  assert.equal(execFileSync("sh", ["-c", `printf %s ${shellQuote(command)}`]).toString(), command);
});

test("wrapWithSandbox output shape", () => {
  assert.equal(wrapWithSandbox("echo 'x'", ["--ro-bind", "/", "/", "--die-with-parent"], "/usr/bin/bwrap"), `'/usr/bin/bwrap' '--ro-bind' '/' '/' '--die-with-parent' -- sh -c 'echo '\\''x'\\'''`);
});

test("bwrapAvailable is null on an empty PATH and finds an executable bwrap", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-bwrap-"));
  assert.equal(bwrapAvailable({ PATH: dir }), null);
  assert.equal(bwrapAvailable({}), null);
  const fake = join(dir, "bwrap");
  writeFileSync(fake, "#!/bin/sh\n");
  assert.equal(bwrapAvailable({ PATH: dir }), null); // not executable yet
  chmodSync(fake, 0o755);
  assert.equal(bwrapAvailable({ PATH: `/nonexistent:${dir}` }), fake);
});

test("a bwrap under the agent dir is ignored: an unsandboxed bash could plant a shim there", () => {
  const bin = join(process.env.PI_CODING_AGENT_DIR, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "bwrap"), "#!/bin/sh\n", { mode: 0o755 });
  assert.equal(bwrapAvailable({ PATH: bin }), null);
  const real = mkdtempSync(join(tmpdir(), "pi-web-bwrap-"));
  writeFileSync(join(real, "bwrap"), "#!/bin/sh\n", { mode: 0o755 });
  assert.equal(bwrapAvailable({ PATH: `${bin}:${real}` }), join(real, "bwrap"));
});

test("threadSandboxWrapper wraps only a trusted thread that asks for it and has bwrap", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-bwrap-"));
  writeFileSync(join(dir, "bwrap"), "#!/bin/sh\n", { mode: 0o755 });
  const env = { PATH: dir };
  const profile = { name: "a", sandbox: "bubblewrap" };
  assert.match(threadSandboxWrapper(true, profile, "/h/a", env)("ls"), /^'\/.*\/bwrap' .*'--unshare-net'.* -- sh -c 'ls'$/);
  assert.doesNotMatch(threadSandboxWrapper(true, { ...profile, sandboxNetwork: true }, "/h/a", env)("ls"), /unshare-net/);
  assert.equal(threadSandboxWrapper(false, profile, "/h/a", env), undefined); // isolated run
  assert.equal(threadSandboxWrapper(true, { name: "a" }, "/h/a", env), undefined);
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(threadSandboxWrapper(true, profile, "/h/a", { PATH: "" }), undefined); } finally { console.warn = warn; }
});

test("DNS stub dir is bound read-only right after the /run tmpfs iff network is on", () => {
  const on = sandboxArgs(home, { network: true, ...opts });
  const run = on.indexOf("/run");
  assert.deepEqual(on.slice(run - 1, run + 4), ["--tmpfs", "/run", "--ro-bind-try", "/run/systemd/resolve", "/run/systemd/resolve"]);
  assert.ok(!sandboxArgs(home, { network: false, ...opts }).includes("/run/systemd/resolve"));
});
