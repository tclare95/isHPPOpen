/** @jest-environment node */
import {
  compareObservedWithEa, evaluateDisplayGate, evaluateGaugeShadow, parseShadowMessage, summariseShadowRows, TRENT_SERIES_KEYS,
} from "../libs/rdp/shadowReview";

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-11-10T00:00:00Z");
const line = (prefix, report) => `[2026-11-10T00:00:00.000Z] [GET] [${prefix}] ${report}`;

function trentRow(index, overrides = {}) {
  const series = TRENT_SERIES_KEYS.map((key) => ({
    key, status: "match", matched: 672, valueMismatches: 0, missingInRdp: 0, missingInLegacy: 0, latestLagSeconds: 0, rdpError: null, rdpState: "fresh", legacyState: "fresh",
    ...(overrides[key] ?? {}),
  }));
  return { id: `t${index}`, timestamp: START + index * HOUR, deploymentId: "dpl_a", message: line("rdp/trent-shadow", `RDP Trent shadow comparison ${JSON.stringify({ series })}`) };
}

function gaugeRow(index, rdp = { status: "fresh", ageSeconds: 1200 }) {
  const report = {
    rdpRead: "completed",
    gauges: { "4009-level": { legacy: { status: "fresh" }, rdp, comparison: { valueMismatches: 0, legacyOnly: 0, rdpOnly: 0, newestLagSeconds: 0 } } },
    decisions: { compared: 1, agreed: 1, disagreed: 0, pendingDisagreed: 0 },
  };
  return { id: `g${index}`, timestamp: START + index * HOUR, message: line("alerts/gauge-shadow", `RDP gauge alert shadow comparison ${JSON.stringify(report)}`) };
}

test("parses only the fixed shadow report markers", () => {
  expect(parseShadowMessage(line("rdp/levels-shadow", 'RDP levels shadow comparison {"series":{"key":"4009-level"}}'))).toEqual({ kind: "levels", report: { series: { key: "4009-level" } } });
  expect(parseShadowMessage(line("rdp/levels-shadow", "RDP levels shadow comparison {broken"))).toEqual({ kind: "levels", report: null });
  expect(parseShadowMessage("[GET] [api/levels] Error in levels")).toBeNull();
});

test("a clean 49-hour six-series Trent shadow passes; overlapping exports count once", () => {
  const rows = Array.from({ length: 50 }, (_, index) => trentRow(index));
  const summary = summariseShadowRows([...rows, ...rows.slice(0, 5)]);
  expect(summary.trent).toMatchObject({ comparisons: 50, window: { hours: 49 } });
  expect(evaluateDisplayGate(summary.trent, TRENT_SERIES_KEYS)).toEqual({ pass: true, blockers: [], notes: [] });
});

test("mismatches, blocking errors, missing series and short windows fail the display gate", () => {
  const rows = Array.from({ length: 10 }, (_, index) => trentRow(index, {
    "4126-level": { status: "value_mismatch", valueMismatches: 1 },
    "4067-level": { status: "rdp_error", rdpError: "AUTHORIZATION_FAILED" },
  })).map((row) => ({ ...row, message: row.message.replace(/\{"key":"4074-level"[^}]*\},?/, "") }));
  const gate = evaluateDisplayGate(summariseShadowRows(rows).trent, TRENT_SERIES_KEYS);
  expect(gate.pass).toBe(false);
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.stringContaining("only 9h"), "4126-level: 10 value mismatches", "4067-level: 10 × AUTHORIZATION_FAILED", "4074-level: no comparisons",
  ]));
});

test("legacy repeated instants and gaps are notes for classification, not RDP blockers", () => {
  const rows = Array.from({ length: 50 }, (_, index) => trentRow(index, { "4009-level": { status: "duplicate_instants", legacyDuplicates: 119, missingInRdp: index === 3 ? 1 : 0 } }));
  const gate = evaluateDisplayGate(summariseShadowRows(rows).trent, TRENT_SERIES_KEYS);
  expect(gate.pass).toBe(true);
  expect(gate.notes).toEqual([expect.stringContaining("classify gaps"), expect.stringContaining("legacy repeated instants 5950")]);
});

test("gauge alert agreement is not readiness when RDP is never fresh enough to evaluate", () => {
  const agreeingButStale = Array.from({ length: 60 }, (_, index) => gaugeRow(index, { status: "stale", ageSeconds: 1810 }));
  const stale = evaluateGaugeShadow(summariseShadowRows(agreeingButStale).gauge);
  expect(stale.pass).toBe(false);
  expect(stale.blockers).toEqual([expect.stringContaining("RDP fresh in only 0/60 runs (median age 30 min)")]);

  expect(evaluateGaugeShadow(summariseShadowRows(Array.from({ length: 60 }, (_, index) => gaugeRow(index))).gauge).pass).toBe(true);
});

test("public RDP history rows are compared with EA items at exact instants", () => {
  const t = (minutes) => Date.parse("2026-11-01T00:00:00Z") / 1000 + minutes * 60;
  const rdp = [[t(0), 1.1, 1], [t(15), 1.2, 1], [t(30), 1.3, 1], [t(60), 1.5, 1]];
  const ea = [{ dateTime: "2026-11-01T00:15:00Z", value: 1.2 }, { dateTime: "2026-11-01T00:30:00Z", value: 1.31 }, { dateTime: "2026-11-01T00:45:00Z", value: 1.4 }, { dateTime: "2026-11-01T01:00:00Z", value: 1.5 }];
  expect(compareObservedWithEa(rdp, ea)).toMatchObject({
    status: "value_mismatch", matched: 3, valueMismatches: 1, mismatchSamples: [{ dateTime: "2026-11-01T00:30:00.000Z", rdp: 1.3, ea: 1.31 }],
    missingInRdp: ["2026-11-01T00:45:00.000Z"], missingInRdpCount: 1, missingInEaCount: 0,
  });
  expect(compareObservedWithEa([], ea).status).toBe("rdp_missing");
});
