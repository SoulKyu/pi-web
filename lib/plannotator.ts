export interface PlannotatorConfig {
  host: string;
  ports: number[];
}

const MAX_PORTS = 64;
const isPort = (n: number) => Number.isInteger(n) && n >= 1 && n <= 65535;

/** Where the Plannotator extension serves plan pages: PLANNOTATOR_PORT (one port, a comma list or an `a-b` range) on PLANNOTATOR_URL_HOST. */
export function plannotatorConfig(env: NodeJS.ProcessEnv = process.env): PlannotatorConfig | null {
  const raw = env.PLANNOTATOR_PORT?.trim();
  if (!raw) return null;
  const ports: number[] = [];
  for (const part of raw.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(part.trim());
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (!isPort(from) || !isPort(to) || to < from || to - from + 1 > MAX_PORTS) return null;
      for (let port = from; port <= to; port++) ports.push(port);
    } else if (/^\d+$/.test(part.trim()) && isPort(Number(part))) {
      ports.push(Number(part));
    } else {
      return null;
    }
  }
  if (ports.length > MAX_PORTS) return null;
  return { host: env.PLANNOTATOR_URL_HOST?.trim() || "127.0.0.1", ports };
}
