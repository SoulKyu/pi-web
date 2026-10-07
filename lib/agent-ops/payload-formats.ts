export type PayloadFormat = "raw" | "alertmanager" | "grafana";
export const PAYLOAD_FORMATS: readonly PayloadFormat[] = ["raw", "alertmanager", "grafana"];

export interface MappedPayload { text: string; dedupKey?: string; severity?: string }

/** Today's webhook behaviour: the `text` field when it is a string, else the body as JSON. */
export const payloadText = (body: unknown): string => typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : JSON.stringify(body ?? null);

const SEVERITY_RANK: Record<string, number> = { info: 1, warning: 2, critical: 3 };
type Fields = Record<string, unknown>;
const asFields = (value: unknown): Fields => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Fields : {};
const str = (value: unknown): string => typeof value === "string" ? value : "";

/** Alertmanager v4 and Grafana unified alerting share the `alerts[]` shape. `startsAt` is left out of text and dedupKey on purpose:
 *  a re-notification differing only in time is the same alert. */
function mapAlerts(body: unknown): MappedPayload | null {
  const alerts = asFields(body).alerts;
  if (!Array.isArray(alerts)) return null;
  const lines: string[] = [];
  const keys: string[] = [];
  let severity: string | undefined;
  for (const entry of alerts) {
    const alert = asFields(entry);
    const labels = asFields(alert.labels);
    const annotations = asFields(alert.annotations);
    const level = str(labels.severity);
    const resolved = str(alert.status) === "resolved"; // a resolved alert never raises the severity (it would bypass quiet hours)
    if (!resolved && SEVERITY_RANK[level] > (SEVERITY_RANK[severity ?? ""] ?? 0)) severity = level;
    const head = [str(alert.status), level, str(labels.alertname), str(labels.instance)].filter(Boolean).join(" ");
    const detail = str(annotations.summary) || str(annotations.description);
    lines.push(detail ? `${head}: ${detail}` : head);
    keys.push(str(alert.fingerprint) || JSON.stringify(labels));
  }
  const status = str(asFields(body).status) || str(asFields(alerts[0]).status);
  return { text: lines.join("\n"), dedupKey: `${status}:${keys.sort().join(",")}`, ...(severity ? { severity } : {}) };
}

/** Pure; may throw on a hostile body (the caller falls back to raw). A body that is not an object or has no `alerts` array maps to raw. */
export function mapPayload(format: PayloadFormat, body: unknown): MappedPayload {
  return (format === "raw" ? null : mapAlerts(body)) ?? { text: payloadText(body) };
}
