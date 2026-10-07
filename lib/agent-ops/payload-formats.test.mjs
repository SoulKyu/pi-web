import assert from "node:assert/strict";
import { test } from "node:test";

const { mapPayload } = await (await import("jiti")).createJiti(import.meta.url).import("./payload-formats.ts");

const alertmanager = (startsAt) => ({
  version: "4", groupKey: '{}:{alertname="HighCPU"}', status: "firing", receiver: "pi-web",
  groupLabels: { alertname: "HighCPU" }, commonLabels: { alertname: "HighCPU" }, externalURL: "http://am:9093",
  alerts: [
    { status: "firing", labels: { alertname: "HighCPU", severity: "warning", instance: "web-1:9100" }, annotations: { summary: "CPU above 90%" }, startsAt, endsAt: "0001-01-01T00:00:00Z", generatorURL: "http://prom/graph", fingerprint: "b1f2c3d4e5a60718" },
    { status: "firing", labels: { alertname: "DiskFull", severity: "critical", instance: "web-2:9100" }, annotations: { description: "Disk / is 98% full" }, startsAt, endsAt: "0001-01-01T00:00:00Z", generatorURL: "http://prom/graph", fingerprint: "0a9b8c7d6e5f4321" },
  ],
});

const grafana = (startsAt) => ({
  receiver: "pi-web", status: "firing", orgId: 1, title: "[FIRING:2] grafana", state: "alerting", message: "**Firing**",
  alerts: [
    { status: "firing", labels: { alertname: "LatencyHigh", severity: "critical", instance: "api-1" }, annotations: { summary: "p99 over 2s" }, startsAt, endsAt: "0001-01-01T00:00:00Z", fingerprint: "11aa22bb33cc44dd", valueString: "[ var='A' value=2.4 ]" },
    { status: "firing", labels: { alertname: "ErrorRate", severity: "info" }, annotations: { summary: "5xx rising" }, startsAt, endsAt: "0001-01-01T00:00:00Z", fingerprint: "55ee66ff77aa88bb" },
  ],
});

test("alertmanager: one line per alert, dedupKey ignores startsAt, severity is the highest", () => {
  const a = mapPayload("alertmanager", alertmanager("2026-10-07T10:00:00Z"));
  const b = mapPayload("alertmanager", alertmanager("2026-10-07T10:30:00Z"));
  assert.deepEqual(a.text.split("\n"), [
    "firing warning HighCPU web-1:9100: CPU above 90%",
    "firing critical DiskFull web-2:9100: Disk / is 98% full",
  ]);
  assert.doesNotMatch(a.text, /startsAt|2026-10-07/);
  assert.equal(a.dedupKey, "firing:0a9b8c7d6e5f4321,b1f2c3d4e5a60718");
  assert.equal(a.dedupKey, b.dedupKey);
  assert.equal(a.severity, "critical");
});

test("grafana: same mapping, missing instance omitted, dedupKey falls back to labels without fingerprint", () => {
  const a = mapPayload("grafana", grafana("2026-10-07T10:00:00Z"));
  const b = mapPayload("grafana", grafana("2026-10-07T11:00:00Z"));
  assert.deepEqual(a.text.split("\n"), ["firing critical LatencyHigh api-1: p99 over 2s", "firing info ErrorRate: 5xx rising"]);
  assert.equal(a.dedupKey, b.dedupKey);
  assert.equal(a.severity, "critical");
  const noPrint = grafana("x");
  noPrint.alerts.forEach((alert) => delete alert.fingerprint);
  const c = mapPayload("grafana", noPrint);
  assert.equal(c.dedupKey, mapPayload("grafana", { ...noPrint, alerts: noPrint.alerts.map((alert) => ({ ...alert, startsAt: "other" })) }).dedupKey);
  assert.match(c.dedupKey, /LatencyHigh/);
});

test("unknown severities are ignored", () => {
  const body = { status: "firing", alerts: [{ status: "firing", labels: { alertname: "X", severity: "page" }, fingerprint: "f" }] };
  assert.equal(mapPayload("alertmanager", body).severity, undefined);
});

test("raw keeps today's behaviour: text field or JSON", () => {
  assert.deepEqual(mapPayload("raw", { text: "hi" }), { text: "hi" });
  assert.equal(mapPayload("raw", { a: 1 }).text, '{"a":1}');
  assert.equal(mapPayload("raw", undefined).text, "null");
});

test("a non-object body or a body without an alerts array maps to raw text", () => {
  for (const format of ["alertmanager", "grafana"]) {
    assert.deepEqual(mapPayload(format, "plain"), { text: '"plain"' });
    assert.deepEqual(mapPayload(format, null), { text: "null" });
    assert.deepEqual(mapPayload(format, { alerts: "nope" }), { text: '{"alerts":"nope"}' });
    assert.deepEqual(mapPayload(format, { text: "hi" }), { text: "hi" });
  }
});

test("severity ignores resolved alerts: a resolved critical and a firing warning map to warning", () => {
  const alert = (status, severity, name) => ({ status, labels: { alertname: name, severity }, fingerprint: name });
  const body = { status: "firing", alerts: [alert("resolved", "critical", "A"), alert("firing", "warning", "B")] };
  assert.equal(mapPayload("alertmanager", body).severity, "warning");
  assert.equal(mapPayload("alertmanager", { alerts: [alert("resolved", "critical", "A")] }).severity, undefined);
  assert.equal(mapPayload("alertmanager", { alerts: [{ labels: { severity: "critical" } }] }).severity, "critical");
});

test("an empty alerts array falls back to raw, like a body without alerts", () => {
  for (const format of ["alertmanager", "grafana"]) {
    const mapped = mapPayload(format, { status: "firing", alerts: [] });
    assert.equal(mapped.text, JSON.stringify({ status: "firing", alerts: [] }));
    assert.equal(mapped.dedupKey, undefined);
    assert.equal(mapped.severity, undefined);
  }
});
