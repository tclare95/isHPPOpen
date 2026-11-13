import "server-only";
import { unstable_cache } from "next/cache";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import { getLatestWaterQualitySummary, getSummaryMembership } from "../services/waterQualityService";
import { coalesce, errorCode, getClient, mapLimit, readCatalogue, resolveCsoIdentities, withDeadline } from "./csoSource.js";
import { assertCsoEventId } from "./csoContract.js";
import { RdpError } from "./errors.js";

// Recorded CSO event history for `/waterquality` (#121). Read-only, server-only and bounded. It reports what
// RDP holds and how much of the window was actually collected; it never feeds the indicator or alerts.

const HOUR_MS = 3600000;
const MINUTE_MS = 60000;
export const CSO_HISTORY_WINDOWS = Object.freeze({
  "24h": { hours: 24, bucketMinutes: 15 },
  "7d": { hours: 168, bucketMinutes: 15 },
  "30d": { hours: 720, bucketMinutes: 60 },
});
export const CSO_HISTORY_MAX_OUTFALLS = 20;
export const CSO_HISTORY_PAGE_LIMIT = 200;
export const CSO_HISTORY_MAX_PAGES = 3;
export const CSO_HISTORY_DEADLINE_MS = 15000;
export const CSO_REVISION_PAGE_LIMIT = 50;
export const CSO_REVISION_MAX_PAGES = 2;
// The 30-day view is only described as a 30-day history when this share of it was collected.
export const CSO_HISTORY_SUFFICIENT_COVERAGE = 0.8;
const READ_CONCURRENCY = 4;

const PROVIDER_LABELS = { "severn-trent": "Severn Trent Water", "wessex-water": "Wessex Water" };
export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] ?? provider.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

const isoZ = (date) => date.toISOString().replace(".000Z", "Z");

// Aligned to the window's bucket so every request inside a bucket shares one cache key per outfall.
export function historyWindow(windowKey, now) {
  const spec = CSO_HISTORY_WINDOWS[windowKey];
  if (!spec) throw new HttpError(400, `window must be one of ${Object.keys(CSO_HISTORY_WINDOWS).join(", ")}`);
  const bucket = spec.bucketMinutes * MINUTE_MS;
  const to = new Date(Math.ceil(now.getTime() / bucket) * bucket);
  return { key: windowKey, hours: spec.hours, from: isoZ(new Date(to.getTime() - spec.hours * HOUR_MS)), to: isoZ(to) };
}

async function readEventPagesUncached(assetId, from, to) {
  const events = [];
  let cursor;
  let first = null;
  for (let page = 0; page < CSO_HISTORY_MAX_PAGES; page++) {
    const result = await getClient().getCsoEvents(assetId, { from, to, limit: CSO_HISTORY_PAGE_LIMIT, cursor });
    first ??= result;
    events.push(...result.events);
    if (!result.nextCursor) return { events, coverage: first.coverage, requestAsOf: first.requestAsOf, truncated: false };
    cursor = result.nextCursor;
  }
  return { events, coverage: first.coverage, requestAsOf: first.requestAsOf, truncated: true };
}

async function readRevisionsUncached(eventId) {
  const revisions = [];
  let cursor;
  let meta = null;
  for (let page = 0; page < CSO_REVISION_MAX_PAGES; page++) {
    const result = await getClient().getCsoEventRevisions(eventId, { limit: CSO_REVISION_PAGE_LIMIT, cursor });
    meta ??= result;
    revisions.push(...result.revisions);
    if (!result.nextCursor) return { revisions, assetId: meta.assetId, openHolds: meta.openHolds, truncated: false };
    cursor = result.nextCursor;
  }
  return { revisions, assetId: meta.assetId, openHolds: meta.openHolds, truncated: true };
}

// Public event data only, never credentials. Failures throw and are therefore never cached.
const readCachedEventPages = unstable_cache(readEventPagesUncached, ["rdp-cso-history-events-v1"], { revalidate: 900, tags: ["rdp-cso"] });
const readCachedEvent = unstable_cache((eventId) => getClient().getCsoEvent(eventId), ["rdp-cso-event-v1"], { revalidate: 300, tags: ["rdp-cso"] });
const readCachedRevisions = unstable_cache(readRevisionsUncached, ["rdp-cso-revisions-v1"], { revalidate: 300, tags: ["rdp-cso"] });

const readEventPages = (assetId, from, to) => coalesce(`history:${assetId}:${from}:${to}`, () => readCachedEventPages(assetId, from, to));
const readEvent = (eventId) => coalesce(`event:${eventId}`, () => readCachedEvent(eventId));
const readRevisions = (eventId) => coalesce(`revisions:${eventId}`, () => readCachedRevisions(eventId));

function minutesBetween(from, to) {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / MINUTE_MS));
}

// RDP's own continuity tolerance: polls at most this far apart count as one collected span.
export const CSO_COLLECTION_TOLERANCE_MS = 45 * MINUTE_MS;

// Coverage up to the moment RDP answered. A gap that opens within one collection tolerance of that moment is
// the next poll not having happened yet, so it is reported as `awaitingNextCheck`, not as missing data.
export function summariseCoverage(coverage, from, to, asOf) {
  const start = Date.parse(from);
  const answered = Date.parse(asOf);
  const end = Number.isFinite(answered) ? Math.min(Date.parse(to), answered) : Date.parse(to);
  const pendingSince = end - CSO_COLLECTION_TOLERANCE_MS;
  const gaps = (coverage?.gaps ?? []).filter((gap) => Date.parse(gap.from) < pendingSince);
  const total = end - start;
  let fraction = 0;
  if (coverage && coverage.status !== "unknown" && total > 0) {
    const missing = gaps.reduce((sum, gap) => sum + Math.max(0, Math.min(end, Date.parse(gap.to)) - Math.max(start, Date.parse(gap.from))), 0);
    fraction = Math.max(0, Math.min(1, 1 - missing / total));
  }
  return {
    status: coverage?.status ?? "unknown",
    collectedFrom: coverage?.collectedFrom ?? null,
    collectedTo: coverage?.collectedTo ?? null,
    reportingCompleteness: coverage?.reportingCompleteness ?? "unverified",
    gaps,
    awaitingNextCheck: (coverage?.gaps.length ?? 0) > gaps.length,
    collectedFraction: Math.round(fraction * 1000) / 1000,
  };
}

// How the visitor should read one event. An end is shown only when the provider reported it.
export function describeEvent(event, { from, asOf }) {
  let display = event.lifecycle;
  if (event.lifecycle === "completed" && event.boundaryProvenance !== "provider_reported") display = "end_not_reported";
  const durationMinutes = display === "completed" ? minutesBetween(event.startedAt, event.endedAt) : null;
  const elapsedMinutes = display === "ongoing" && asOf ? minutesBetween(event.startedAt, asOf) : null;
  const maxDurationMinutes = display !== "completed" && display !== "ongoing" && event.endNoLaterThan
    ? minutesBetween(event.startedAt, event.endNoLaterThan) : null;
  return {
    eventId: event.eventId,
    startedAt: event.startedAt,
    endedAt: display === "completed" ? event.endedAt : null,
    endNoLaterThan: display === "completed" || display === "ongoing" ? null : event.endNoLaterThan,
    lifecycle: event.lifecycle,
    display,
    boundaryProvenance: event.boundaryProvenance,
    durationMinutes,
    elapsedMinutes,
    maxDurationMinutes,
    startedBeforeWindow: from ? event.startedAt < from : false,
    revision: event.revision,
    underReview: event.reconciliation === "held",
    heldClaims: event.heldClaims,
    tier: event.tier,
  };
}

function outfallSummary(legacyId, identity) {
  const asset = identity?.asset ?? null;
  return {
    id: legacyId,
    assetId: identity?.assetId ?? null,
    provider: asset?.provider ?? null,
    providerLabel: asset ? providerLabel(asset.provider) : null,
    sourceId: asset?.sourceId ?? null,
    name: asset?.name ?? null,
    receivingWatercourse: asset?.receivingWatercourse ?? null,
    coordinates: Number.isFinite(asset?.longitude) && Number.isFinite(asset?.latitude) ? { x: asset.longitude, y: asset.latitude } : null,
  };
}

// The conclusion a visitor may draw. "no_reported_events" still carries RDP's `reportingCompleteness:
// unverified`; it is never presented as proof that no spill happened.
export function assessHistory({ outfalls, events, window }) {
  const read = outfalls.filter((outfall) => outfall.state === "read");
  const monitored = outfalls.filter((outfall) => outfall.state !== "not_monitored" && !outfall.state.startsWith("identity_"));
  const fractions = read.map((outfall) => outfall.coverage.collectedFraction);
  const meanCollected = fractions.length ? fractions.reduce((a, b) => a + b, 0) / fractions.length : 0;
  const gapCount = read.reduce((sum, outfall) => sum + outfall.coverage.gaps.length, 0);
  const counts = {
    members: outfalls.length,
    monitored: monitored.length,
    read: read.length,
    failed: outfalls.filter((outfall) => outfall.state === "failed").length,
    notRead: outfalls.filter((outfall) => outfall.state === "not_read").length,
    notMonitored: outfalls.filter((outfall) => outfall.state === "not_monitored").length,
    unmapped: outfalls.filter((outfall) => outfall.state.startsWith("identity_")).length,
  };
  const truncated = read.some((outfall) => outfall.truncated);
  const complete = read.length > 0 && read.length === monitored.length && gapCount === 0 && !truncated;
  let conclusion;
  if (!read.length) conclusion = monitored.length ? "unavailable" : "not_monitored";
  else if (events.length) conclusion = "events";
  else conclusion = complete ? "no_reported_events" : "coverage_incomplete";
  return {
    conclusion,
    outfalls: counts,
    coverage: {
      collectedFraction: Math.round(meanCollected * 1000) / 1000,
      collectedHours: Math.round(meanCollected * window.hours * 10) / 10,
      gapCount,
      reportingCompleteness: "unverified",
      sufficient: read.length > 0 && Math.min(...fractions) >= CSO_HISTORY_SUFFICIENT_COVERAGE,
    },
    truncated,
    complete,
  };
}

async function readMembership() {
  const latest = await getLatestWaterQualitySummary();
  return latest ? getSummaryMembership(latest) : [];
}

// Never rejects for an RDP failure: the section reports `unavailable` and the rest of the page is untouched.
export async function getCsoEventHistory(windowKey = "24h", now = new Date()) {
  const window = historyWindow(windowKey, now);
  const logger = createRequestLogger({ method: "GET" }, "rdp/cso-history");
  const legacyIds = await readMembership();
  const base = { window, retrievedAt: now.toISOString() };
  let catalogue;
  try {
    catalogue = await withDeadline(readCatalogue(), CSO_HISTORY_DEADLINE_MS);
  } catch (error) {
    logger.warn(`RDP CSO history catalogue unavailable ${JSON.stringify({ code: errorCode(error) })}`);
    return { ...base, state: "unavailable", errorCode: errorCode(error), outfalls: [], events: [],
      evidence: assessHistory({ outfalls: [], events: [], window }) };
  }

  const identities = resolveCsoIdentities(legacyIds, catalogue.assets);
  const outfalls = legacyIds.map((id) => {
    const identity = identities.get(id);
    const summary = outfallSummary(id, identity);
    if (identity.state !== "mapped") return { ...summary, state: `identity_${identity.state}` };
    // Only outfalls RDP collects on this stage can have reconstructed events.
    if (!identity.asset.selected) return { ...summary, state: "not_monitored" };
    return { ...summary, state: "pending" };
  });
  const targets = outfalls.filter((outfall) => outfall.state === "pending");
  targets.slice(CSO_HISTORY_MAX_OUTFALLS).forEach((outfall) => { outfall.state = "not_read"; });

  const events = [];
  let timedOut = false; // A read finishing after the deadline must not change a response already assembled.
  const read = mapLimit(targets.slice(0, CSO_HISTORY_MAX_OUTFALLS), READ_CONCURRENCY, async (outfall) => {
    try {
      const result = await readEventPages(outfall.assetId, window.from, window.to);
      if (timedOut) return;
      Object.assign(outfall, {
        state: "read",
        truncated: result.truncated,
        pageIntegrity: "verified",
        coverage: summariseCoverage(result.coverage, window.from, window.to, result.requestAsOf),
        eventCount: result.events.length,
      });
      events.push(...result.events.map((event) => ({ ...describeEvent(event, { from: window.from, asOf: result.requestAsOf }),
        outfallId: outfall.id, assetId: outfall.assetId, asOf: result.requestAsOf })));
    } catch (error) {
      if (!timedOut) Object.assign(outfall, { state: "failed", errorCode: errorCode(error) });
    }
  });
  try {
    await withDeadline(read, CSO_HISTORY_DEADLINE_MS);
  } catch {
    timedOut = true;
    targets.forEach((outfall) => { if (outfall.state === "pending") Object.assign(outfall, { state: "failed", errorCode: "TIMEOUT" }); });
  }

  const failed = outfalls.filter((outfall) => outfall.state === "failed");
  if (failed.length) logger.warn(`RDP CSO history degraded ${JSON.stringify({ window: windowKey, failures: failed.map(({ assetId, errorCode: code }) => ({ assetId, code })) })}`);
  // Newest first; ties broken by event ID so the order is stable between requests.
  events.sort((a, b) => (a.startedAt === b.startedAt ? (a.eventId < b.eventId ? -1 : 1) : a.startedAt < b.startedAt ? 1 : -1));
  const evidence = assessHistory({ outfalls, events, window });
  const providers = new Set(outfalls.filter((outfall) => outfall.state === "read").map((outfall) => `${outfall.provider}:${outfall.sourceId}`));
  const sources = catalogue.catalogues.filter((entry) => providers.has(`${entry.provider}:${entry.sourceId}`))
    .map((entry) => ({ provider: entry.provider, providerLabel: providerLabel(entry.provider), sourceId: entry.sourceId, attribution: entry.attribution ?? null }));
  return { ...base, state: evidence.conclusion === "unavailable" ? "unavailable" : "available", outfalls, events, evidence, sources };
}

export const CHANGE_REASON_LABELS = Object.freeze({
  created: "First recorded",
  completed: "End reported by provider",
  start_corrected: "Start time corrected",
  end_corrected: "End time corrected",
  end_not_reported: "Provider did not report the end",
  operator_resolved: "Resolved after review",
  historical_imported: "Imported from official historical returns",
});

// Lifecycle progress (created → completed / end not reported) is normal; these change recorded evidence.
export const CORRECTION_REASONS = new Set(["start_corrected", "end_corrected", "operator_resolved"]);

function describeRevision(row) {
  const changed = row.previous ? ["startedAt", "endedAt", "endNoLaterThan", "status"].filter((field) => row.previous[field] !== row.current[field]) : [];
  return {
    revision: row.revision,
    recordedAt: row.recordedAt,
    sourceFetchedAt: row.sourceFetchedAt,
    changeReason: row.changeReason,
    changeLabel: CHANGE_REASON_LABELS[row.changeReason] ?? "Updated",
    correction: CORRECTION_REASONS.has(row.changeReason),
    reconciliation: row.reconciliation,
    current: row.current,
    previous: row.previous,
    changed,
  };
}

// One event, with every material revision kept visible. Restricted to the HPP membership so the route is not
// a general RDP proxy.
export async function getCsoEventDetail(eventId) {
  try {
    assertCsoEventId(eventId);
  } catch {
    throw new HttpError(400, "Invalid event id");
  }
  let detail;
  let revisions;
  let catalogue;
  try {
    [detail, revisions, catalogue] = await withDeadline(Promise.all([readEvent(eventId), readRevisions(eventId), readCatalogue()]), CSO_HISTORY_DEADLINE_MS);
  } catch (error) {
    if (error instanceof RdpError && (error.code === "EVENT_NOT_FOUND" || error.code === "NOT_FOUND")) throw new HttpError(404, "Event not found");
    throw new HttpError(503, "Event history temporarily unavailable");
  }
  const legacyIds = await readMembership();
  const identities = resolveCsoIdentities(legacyIds, catalogue.assets);
  const member = legacyIds.find((id) => identities.get(id).assetId === detail.event.assetId);
  if (!member || revisions.assetId !== detail.event.assetId) throw new HttpError(404, "Event not found");

  const outfall = outfallSummary(member, identities.get(member));
  const history = revisions.revisions.map(describeRevision);
  const imported = history.some((row) => row.changeReason === "historical_imported");
  return {
    event: { ...describeEvent(detail.event, { from: null, asOf: detail.retrievedAt }), outfallId: member, assetId: detail.event.assetId,
      corrected: history.some((row) => row.correction) || CORRECTION_REASONS.has(detail.currentRevision.changeReason) },
    outfall,
    currentRevision: { ...detail.currentRevision, changeLabel: CHANGE_REASON_LABELS[detail.currentRevision.changeReason] ?? "Updated" },
    updatedAt: detail.updatedAt,
    openHolds: detail.openHolds.map(({ fetchedAt, reason }) => ({ fetchedAt, reason })),
    archive: detail.archive,
    revisions: history,
    revisionsTruncated: revisions.truncated,
    attribution: {
      provider: outfall.provider,
      providerLabel: outfall.providerLabel,
      sourceId: outfall.sourceId,
      method: imported ? "historical_import" : "live_reconstruction",
      platform: "River Data Platform",
    },
    retrievedAt: detail.retrievedAt,
  };
}
