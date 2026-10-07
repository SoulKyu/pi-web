import { readFileSync } from "node:fs";
export function memAvailableMb(read: () => string = () => readFileSync("/proc/meminfo", "utf8")): number | undefined {
  try { const kb = /^MemAvailable:\s+(\d+)\s*kB/m.exec(read())?.[1]; return kb ? Math.floor(Number(kb) / 1024) : undefined; } catch { return undefined; }
}
/** The review of 2026-10-07: runs are in-process sessions; what weighs is MCP stdio servers, subagents and bge-m3. A floor on free memory protects the machine; the cap serializes automatic runs without freezing the user. */
export function automaticCapacity(input: { maxAutomaticRuns: number; minFreeMb: number; running: number; freeMb: number | undefined }): number {
  if (input.freeMb !== undefined && input.freeMb < input.minFreeMb) return 0;
  return Math.max(0, input.maxAutomaticRuns - input.running);
}
