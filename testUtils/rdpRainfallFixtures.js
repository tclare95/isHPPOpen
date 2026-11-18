// Builders for RDP period-total (#54 observed rainfall) envelopes, shaped like RDP's golden
// docs/evidence/rainfall-54/rainfall-history-contract.json and the PeriodTotal*/Rainfall* OpenAPI schemas.

export const PERIOD_MS = 15 * 60000;
export const RAINFALL_IDS = [
  "ea-stone-rainfall", "ea-lea-marston-rainfall", "ea-ashbourne-rainfall",
  "ea-ashford-rainfall", "ea-wanlip-rainfall", "ea-sutton-bonington-rainfall",
];
const REFERENCES = {
  "ea-stone-rainfall": "3014", "ea-lea-marston-rainfall": "3288", "ea-ashbourne-rainfall": "3323",
  "ea-ashford-rainfall": "3616", "ea-wanlip-rainfall": "3683", "ea-sutton-bonington-rainfall": "3652",
};
// RDP output form (seven fractional digits).
export const rdpTime = (ms) => new Date(ms).toISOString().replace(".000Z", ".0000000Z");
export const providerMeasure = (id) => `${REFERENCES[id]}-rainfall-tipping_bucket_raingauge-t-15_min-mm`;

export function rainfallRow(id, labelMs, totalMm, { convention = "unverified", eligible = true, quality = null, revision = 1, ineligibleReason } = {}) {
  const start = convention === "period_end" ? labelMs - PERIOD_MS : labelMs;
  const verified = convention !== "unverified";
  return {
    label: rdpTime(labelMs), periodSeconds: 900, labelConvention: convention,
    periodStart: verified ? rdpTime(start) : null, periodEnd: verified ? rdpTime(start + PERIOD_MS) : null,
    totalMm, sourceValue: String(totalMm), quality, eligible,
    ineligibleReason: eligible ? null : ineligibleReason ?? "QualityMissing", knownAt: null,
    sourceId: "ea-flood-monitoring", providerMeasureId: providerMeasure(id), ingestedAt: rdpTime(labelMs + 45 * 60000),
    sourceReference: `http://environment.data.gov.uk/flood-monitoring/data/readings/${providerMeasure(id)}/x`, revision,
  };
}

// RDP's window over [fromMs, toMs), computed with RDP's rules for the given rows.
export function rdpWindow(rows, fromMs, toMs) {
  const expectedIntervals = Math.ceil((toMs - fromMs) / PERIOD_MS);
  const eligible = rows.filter((row) => row.eligible).length;
  const status = rows.length === 0 ? "empty" : eligible === expectedIntervals ? "complete" : "incomplete";
  const conventions = new Set(rows.map((row) => row.labelConvention));
  return {
    firstLabel: rdpTime(fromMs), lastLabel: rdpTime(toMs - PERIOD_MS), expectedIntervals, reported: rows.length, eligible,
    absent: expectedIntervals - rows.length, ineligible: rows.length - eligible, notKnownAt: 0, status,
    totalMm: status === "complete" ? rows.reduce((sum, row) => sum + row.totalMm, 0) : null,
    labelConvention: conventions.size === 1 ? [...conventions][0] : "mixed", periodStart: null, periodEnd: null,
    gaps: [], gapsTruncated: false, knownAt: null, knownAtBasis: null,
  };
}

export function historyBody(id, rows, { fromMs, toMs, nextCursor = null, window } = {}) {
  const paginated = window === null;
  return {
    data: rows,
    meta: {
      measurementId: id, from: rdpTime(fromMs ?? 0), to: rdpTime(toMs ?? 0), valueType: "total", periodSeconds: 900, knownAt: null,
      requestAsOf: rdpTime(toMs ?? 0), cutoff: rdpTime(0), coverage: { status: "unknown", gaps: [] },
      window: paginated ? null : window ?? rdpWindow(rows, fromMs, toMs), windowUnavailable: paginated ? "paginated" : null,
      pageIntegrity: "verified", nextCursor,
    },
  };
}

export function latestRow(id, labelMs, { status = "available", convention = "unverified", totalMm = 0, freshness = "stale", ageSeconds = 3000 } = {}) {
  if (status !== "available") {
    return { measurementId: id, status, valueType: "total", periodSeconds: 900, label: null, labelConvention: null, periodStart: null,
      periodEnd: null, totalMm: null, unit: "mm", quality: null, eligible: null, labelAgeSeconds: null, freshness: "unknown", errorCode: null };
  }
  const start = convention === "period_end" ? labelMs - PERIOD_MS : labelMs;
  const verified = convention !== "unverified";
  return {
    measurementId: id, status, valueType: "total", periodSeconds: 900, label: rdpTime(labelMs), labelConvention: convention,
    periodStart: verified ? rdpTime(start) : null, periodEnd: verified ? rdpTime(start + PERIOD_MS) : null, totalMm, unit: "mm",
    quality: null, eligible: true, labelAgeSeconds: ageSeconds, freshness, errorCode: null,
  };
}

export const latestBody = (rows) => ({ data: rows, meta: { requestAsOf: rdpTime(Date.UTC(2026, 10, 18, 12)) } });
