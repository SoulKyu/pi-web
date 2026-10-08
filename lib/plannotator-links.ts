const MAX_LINKS = 5;
const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

/** Plannotator page URLs in a tool result: exact configured host (loopback aliases for a loopback host) on a configured port. */
export function plannotatorLinks(text: string, cfg: { host: string; ports: number[] } | null): string[] {
  if (!cfg) return [];
  const links: string[] = [];
  for (const match of text.matchAll(/https?:\/\/\S+/g)) {
    const candidate = match[0].replace(/[)\]}>.,;:!?'"]+$/, "");
    let url: URL;
    try { url = new URL(candidate); } catch { continue; }
    const hostOk = url.hostname === cfg.host || (LOOPBACK.has(cfg.host) && LOOPBACK.has(url.hostname));
    if (!hostOk || !cfg.ports.includes(Number(url.port)) || links.includes(candidate)) continue;
    links.push(candidate);
    if (links.length === MAX_LINKS) break;
  }
  return links;
}
