import "server-only";
import { unstable_cache } from "next/cache";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import calibration from "../waterQualityCalibration.json";
import { getLegacyCsoStatusHistory, getLegacyWaterQualityObservations, STATUS_FRESHNESS_MINUTES } from "../services/waterQualityService";
import { classifyRdpLocation, coalesce, errorCode, getClient, readCatalogue, withDeadline } from "./csoSource.js";
import { CSO_COLLECTION_TOLERANCE_MS, providerLabel, summariseCoverage } from "./csoHistory.js";
import { RdpError } from "./errors.js";

// Whole-catchment CSO monitoring for `/waterquality` (#114). Read-only, server-only and bounded. It presents RDP's
// collection-set status, events and coverage as they are. It does not recreate River Tracer's `rdp.cso-activity/v1`
// metric. It never produces a density that could stand in for Sewage Map's `number_CSOs_per_km2`, and it never feeds
// the indicator, the density chart, the calibrated thresholds or alerts.

const MINUTE_MS = 60000;
const HOUR_MS = 60 * MINUTE_MS;

// Only reviewed sets are readable, so the route is not a general RDP proxy.
export const CATCHMENT_SETS = Object.freeze({
  "hpp-catchment": Object.freeze({
    label: "River Trent catchment upstream of Holme Pierrepont",
    provider: "severn-trent",
    sourceId: "storm-overflow-activity",
    expectedOutfalls: 1514,
    relationshipSet: "hpp-upstream-outfalls",
    relationshipVersion: "bb422e98d78ee1bc",
    scope: "catchment",
  }),
});
export const DEFAULT_CATCHMENT_SET = "hpp-catchment";
export const CATCHMENT_WINDOW_HOURS = 48;
export const CATCHMENT_PAGE_LIMIT = 100;
export const CATCHMENT_MAX_OUTFALLS = 2500;
export const CATCHMENT_MAX_PAGES = Math.ceil(CATCHMENT_MAX_OUTFALLS / CATCHMENT_PAGE_LIMIT);
// Production pages take about 4 s each (1,514 outfalls = 16 pages, about 70 s). No new page is started after this;
// with the client's 30 s request timeout a walk ends within the route's 180 s.
export const CATCHMENT_WALK_BUDGET_MS = 120000;
export const CATCHMENT_READ_DEADLINE_MS = 170000;
export const CATCHMENT_CATALOGUE_DEADLINE_MS = 10000;
export const CATCHMENT_CACHE_SECONDS = 600;
export const CATCHMENT_HIGHLIGHT_LIMIT = 50;
export const CATCHMENT_LEGACY_MEMBER_LIMIT = 100;
// Published coordinates equal to 5 decimal places (about 1 m) are one location. Outfalls without coordinates are
// counted separately and are never merged into, or assumed distinct from, any location.
export const LOCATION_DECIMALS = 5;
// A legacy `csoData` record describes an outfall at a legacy observation only if scraped this close before it.
export const LEGACY_STATUS_MATCH_MS = STATUS_FRESHNESS_MINUTES * MINUTE_MS;

export const CATCHMENT_STATES = ["active", "recent", "not_spilling", "offline", "stale", "unresolved", "no_observations", "unavailable", "not_read"];
// States with no usable current evidence. `offline` is a fresh report that the monitor itself is offline.
export const UNKNOWN_STATES = ["offline", "stale", "unresolved", "no_observations", "unavailable", "not_read"];

// `classifyRdpLocation`'s reason -> the section's state. Anything else (unresolved/held/ongoing-but-not-spilling
// events, contradictory reports, truncated events) cannot be read as a clear answer, so it is `unresolved`.
const REASON_STATES = {
  spilling: "active",
  recently_stopped: "recent",
  not_spilling_no_recent_event: "not_spilling",
  offline: "offline",
  stale: "stale",
  no_observations: "no_observations",
  unavailable: "unavailable",
  status_unavailable: "unavailable",
  events_unavailable: "unavailable",
};
export const catchmentState = (reason) => REASON_STATES[reason] ?? "unresolved";

// ---- Reading every page of the set ----

class IncompleteWalk extends Error {
  constructor(result) {
    super("RDP incomplete set walk");
    this.result = result;
  }
}

// What the summary needs and nothing else, so a whole set stays small enough for the data cache.
function compactItem({ status, events }, page) {
  return {
    page,
    status: {
      assetId: status.assetId, status: status.status, reportedState: status.reportedState, effectiveState: status.effectiveState,
      freshness: status.freshness, statusStart: status.statusStart, sourceUpdatedAt: status.sourceUpdatedAt,
      sourceAgeSeconds: status.sourceAgeSeconds, fetchedAt: status.fetchedAt,
    },
    events: events && {
      events: events.events.map(({ eventId, startedAt, endedAt, endNoLaterThan, lifecycle, boundaryProvenance, reconciliation }) =>
        ({ eventId, startedAt, endedAt, endNoLaterThan, lifecycle, boundaryProvenance, reconciliation })),
      coverage: events.coverage,
      truncated: events.truncated,
    },
  };
}

// Follows `nextCursor` sequentially (the cursor chains pages, so they cannot be read in parallel). A set-membership
// change restarts the walk once. Any later failure, the page budget or the time budget ends the walk with what it has:
// the missing outfalls are counted as `not_read`, never assumed clear. A first-page failure is the set being unavailable.
export async function walkSetActivity(set, hours = CATCHMENT_WINDOW_HOURS) {
  let restarted = false;
  for (;;) {
    const started = Date.now();
    const items = [];
    const seen = new Set();
    const pages = [];
    let first = null;
    let duplicates = 0;
    let partialPages = 0;
    const finish = (stopReason, code = null) => ({
      set, hours, provider: first.provider, sourceId: first.sourceId,
      from: first.from, to: pages[pages.length - 1].to, retrievedAt: first.retrievedAt,
      total: first.total, received: items.length, missing: Math.max(0, first.total - items.length),
      pageCount: pages.length, partialPages, duplicates, restarted, stopReason, errorCode: code,
      complete: stopReason === null && duplicates === 0 && items.length === first.total,
      pages, items,
    });
    let cursor;
    try {
      for (;;) {
        if (first && pages.length >= CATCHMENT_MAX_PAGES) return finish("page_budget");
        if (first && Date.now() - started > CATCHMENT_WALK_BUDGET_MS) return finish("deadline");
        const page = await getClient().getCsoSetActivity(set, { hours, limit: CATCHMENT_PAGE_LIMIT, cursor });
        if (!first) first = page;
        // A changed total or source mid-walk is a membership change RDP did not flag; treat it the same way.
        else if (page.total !== first.total || page.provider !== first.provider || page.sourceId !== first.sourceId) throw new RdpError("CURSOR_STALE");
        const index = pages.push({ from: page.from, to: page.to, retrievedAt: page.retrievedAt }) - 1;
        if (page.partial) partialPages += 1;
        for (const item of page.items) {
          // The same outfall on two pages is reported, never counted twice.
          if (seen.has(item.status.assetId)) { duplicates += 1; continue; }
          seen.add(item.status.assetId);
          items.push(compactItem(item, index));
        }
        if (!page.nextCursor) return finish(null);
        cursor = page.nextCursor;
      }
    } catch (error) {
      if (!restarted && error instanceof RdpError && error.code === "CURSOR_STALE") { restarted = true; continue; }
      if (!first) throw error;
      return finish("page_failed", errorCode(error));
    }
  }
}

// Only a complete walk is written to the data cache. An incomplete one is served to this request (and briefly by the
// CDN) but the next request tries again. Failures are never cached.
async function readCompleteWalk(set, hours) {
  const result = await walkSetActivity(set, hours);
  if (!result.complete) throw new IncompleteWalk(result);
  return result;
}
const readCachedWalk = unstable_cache(readCompleteWalk, ["rdp-cso-set-activity-v1"], { revalidate: CATCHMENT_CACHE_SECONDS, tags: ["rdp-cso"] });

// Concurrent misses in one instance share one walk.
export const readSetActivity = (set, hours = CATCHMENT_WINDOW_HOURS) => coalesce(`set-activity:${set}:${hours}`,
  () => readCachedWalk(set, hours).catch((error) => {
    if (error instanceof IncompleteWalk) return error.result;
    throw error;
  }));

// ---- Per-outfall evidence ----

export function locationKey(asset) {
  if (!Number.isFinite(asset?.latitude) || !Number.isFinite(asset?.longitude)) return null;
  return `${asset.latitude.toFixed(LOCATION_DECIMALS)},${asset.longitude.toFixed(LOCATION_DECIMALS)}`;
}

// The existing page's current/recent rules (`classifyRdpLocation`), applied to each set member at request time so a
// cached walk is never described as fresher than it is.
export function buildCatchmentRows(walk, assetsById, now) {
  return walk.items.map((item) => {
    const { assetId } = item.status;
    const asset = assetsById?.get(assetId) ?? null;
    const externalId = assetId.slice(assetId.lastIndexOf(":") + 1);
    const location = classifyRdpLocation(externalId, { identity: { state: "mapped", assetId, asset }, status: item.status, events: item.events }, { now });
    const page = walk.pages[item.page];
    return {
      assetId,
      externalId,
      name: asset?.name ?? null,
      receivingWatercourse: asset?.receivingWatercourse ?? null,
      inCatalogue: Boolean(asset),
      locationKey: locationKey(asset),
      state: catchmentState(location.statusReason),
      reason: location.statusReason,
      latestEventStart: location.latestEventStart,
      latestEventEnd: location.latestEventEnd,
      sourceAgeSeconds: Number.isFinite(item.status.sourceAgeSeconds) ? item.status.sourceAgeSeconds : null,
      sourceUpdatedAt: item.status.sourceUpdatedAt,
      events: item.events?.events ?? [],
      eventsTruncated: item.events?.truncated ?? false,
      rawCoverage: item.events?.coverage ?? null,
      coverage: item.events ? summariseCoverage(item.events.coverage, page.from, page.to, page.retrievedAt) : null,
      asOf: page.retrievedAt,
    };
  });
}

// Outfalls and distinct locations are always reported together; an outfall without coordinates is its own count.
export function countLocations(rows) {
  const keys = new Map();
  for (const row of rows) if (row.locationKey) keys.set(row.locationKey, (keys.get(row.locationKey) ?? 0) + 1);
  const shared = [...keys.values()].filter((count) => count > 1);
  return {
    outfalls: rows.length,
    locations: keys.size,
    withoutLocation: rows.filter((row) => !row.locationKey).length,
    sharedLocations: shared.length,
    outfallsAtSharedLocations: shared.reduce((sum, count) => sum + count, 0),
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const isUnresolvedEnd = (event) => event.lifecycle === "unresolved" || (event.lifecycle === "completed" && event.boundaryProvenance !== "provider_reported");

export function summariseCatchment(walk, rows, now) {
  const states = Object.fromEntries(CATCHMENT_STATES.map((state) => [state, 0]));
  for (const row of rows) states[row.state] += 1;
  states.not_read = walk.missing;
  const byState = (state) => rows.filter((row) => row.state === state);
  const withEvents = rows.filter((row) => row.events.length > 0);
  const events = rows.flatMap((row) => row.events);
  const covered = rows.filter((row) => row.coverage);
  const fractions = covered.map((row) => row.coverage.collectedFraction);
  const ages = rows.map((row) => row.sourceAgeSeconds).filter(Number.isFinite);
  const retrievedMs = Date.parse(walk.retrievedAt);
  return {
    total: walk.total,
    read: rows.length,
    states,
    freshReports: states.active + states.recent + states.not_spilling,
    unknown: UNKNOWN_STATES.reduce((sum, state) => sum + states[state], 0),
    locations: {
      all: countLocations(rows),
      active: countLocations(byState("active")),
      recent: countLocations(byState("recent")),
      withEvents: countLocations(withEvents),
    },
    events: {
      outfallsWithEvents: withEvents.length,
      events: events.length,
      ongoing: events.filter((event) => event.lifecycle === "ongoing").length,
      unresolvedEnd: events.filter(isUnresolvedEnd).length,
      underReview: events.filter((event) => event.reconciliation === "held").length,
      truncatedOutfalls: rows.filter((row) => row.eventsTruncated).length,
    },
    coverage: {
      collectedThroughout: covered.filter((row) => row.coverage.status !== "unknown" && row.coverage.gaps.length === 0 && row.coverage.collectedFraction >= 1).length,
      partlyCollected: covered.filter((row) => row.coverage.collectedFraction > 0 && row.coverage.collectedFraction < 1).length,
      notCollected: covered.filter((row) => row.coverage.collectedFraction === 0).length,
      noCoverageReported: rows.length - covered.length,
      gapCount: covered.reduce((sum, row) => sum + row.coverage.gaps.length, 0),
      awaitingNextCheck: covered.filter((row) => row.coverage.awaitingNextCheck).length,
      meanCollectedFraction: fractions.length ? Math.round((fractions.reduce((a, b) => a + b, 0) / fractions.length) * 1000) / 1000 : 0,
      earliestCollectedFrom: covered.map((row) => row.coverage.collectedFrom).filter(Boolean).sort()[0] ?? null,
      reportingCompleteness: "unverified",
    },
    lag: {
      sourceAgeSeconds: { median: percentile(ages, 50), p90: percentile(ages, 90), max: ages.length ? Math.max(...ages) : null, samples: ages.length },
      // How old RDP's answer is at this request (the data cache may serve a walk up to CATCHMENT_CACHE_SECONDS old).
      readAgeSeconds: Number.isFinite(retrievedMs) ? Math.max(0, Math.round((now.getTime() - retrievedMs) / 1000)) : null,
    },
  };
}

const HIGHLIGHT_ORDER = { active: 0, recent: 1 };
function highlights(rows) {
  const counts = new Map();
  for (const row of rows) if (row.locationKey) counts.set(row.locationKey, (counts.get(row.locationKey) ?? 0) + 1);
  const list = rows.filter((row) => row.state in HIGHLIGHT_ORDER)
    .sort((a, b) => HIGHLIGHT_ORDER[a.state] - HIGHLIGHT_ORDER[b.state] || (b.latestEventStart ?? "").localeCompare(a.latestEventStart ?? "") || a.assetId.localeCompare(b.assetId));
  return {
    outfalls: list.slice(0, CATCHMENT_HIGHLIGHT_LIMIT).map((row) => ({
      assetId: row.assetId, externalId: row.externalId, name: row.name, receivingWatercourse: row.receivingWatercourse, state: row.state,
      latestEventStart: row.latestEventStart, latestEventEnd: row.latestEventEnd,
      sharesLocationWith: row.locationKey ? counts.get(row.locationKey) - 1 : null,
    })),
    truncated: list.length > CATCHMENT_HIGHLIGHT_LIMIT,
  };
}

// ---- Read-only comparison against legacy density and status history ----

// A gap that opens within one collection tolerance of RDP's answer is the next poll not having run yet
// (`awaitingNextCheck` in summariseCoverage), not missing collection.
function covers(rawCoverage, time, asOf) {
  if (!rawCoverage || rawCoverage.status === "unknown" || !rawCoverage.collectedFrom) return false;
  const from = Date.parse(rawCoverage.collectedFrom);
  const to = rawCoverage.collectedTo ? Date.parse(rawCoverage.collectedTo) + CSO_COLLECTION_TOLERANCE_MS : from;
  if (time < from || time > to) return false;
  const pendingSince = asOf ? Date.parse(asOf) - CSO_COLLECTION_TOLERANCE_MS : Infinity;
  return !rawCoverage.gaps.some((gap) => Date.parse(gap.from) < pendingSince && time >= Date.parse(gap.from) && time < Date.parse(gap.to));
}

// Spilling at `time` on provider-reported evidence only (`lower`), or also allowing events whose end was never
// reported up to their `endNoLaterThan` bound (`upper`). The interval is RDP's; nothing is estimated here.
function spillingAt(events, time) {
  let lower = false;
  let upper = false;
  for (const event of events) {
    if (Date.parse(event.startedAt) > time) continue;
    if (event.lifecycle === "ongoing") { lower = true; upper = true; continue; }
    if (event.lifecycle === "completed" && event.boundaryProvenance === "provider_reported") {
      if (time < Date.parse(event.endedAt)) { lower = true; upper = true; }
      continue;
    }
    if (!event.endNoLaterThan || time < Date.parse(event.endNoLaterThan)) upper = true;
  }
  return { lower, upper };
}

// The last legacy observation in each clock hour: one row per hour, each at its own actual observation time.
function hourlyObservations(observations, from, to) {
  const byHour = new Map();
  for (const observation of observations) {
    const time = Date.parse(observation.observedAt);
    if (time < Date.parse(from) || time > Date.parse(to)) continue;
    byHour.set(Math.floor(time / HOUR_MS), observation);
  }
  return [...byHour.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function legacyStatusAt(records, time) {
  let found = null;
  for (const record of records) {
    const scraped = Date.parse(record.scrapedAt);
    if (scraped > time + 5 * MINUTE_MS) break;
    if (scraped >= time - LEGACY_STATUS_MATCH_MS) found = record;
  }
  return found;
}

// Each row is one legacy observation, at its own `scrape_timestamp`, with RDP's evidence at that same instant. The
// two sides have different catchments, populations and denominators: they are shown side by side, never combined.
// `statusHistory` (legacy `csoData`) is optional (#68): `null` means it could not be read. Once the legacy CSO
// collection is retired it is empty for new periods; the density comparison still runs, and the per-outfall
// agreement is reported as `null` rather than as "not spilling" or as a run of not-comparable members.
export function compareWithLegacy({ rows, observations, statusHistory, provider, sourceId, from, to }) {
  const legacyStatus = statusHistory === null ? "unavailable" : statusHistory.length ? "available" : "none";
  statusHistory ??= [];
  const byExternal = new Map(rows.map((row) => [row.externalId, row]));
  const legacyById = new Map();
  for (const record of statusHistory) {
    const list = legacyById.get(record.id) ?? [];
    list.push(record);
    legacyById.set(record.id, list);
  }
  const agreement = { bothSpilling: 0, legacyOnly: 0, rdpOnly: 0, neither: 0, rdpUncertain: 0, notComparable: 0 };
  const aligned = hourlyObservations(observations, from, to).map((observation) => {
    const time = Date.parse(observation.observedAt);
    const collected = rows.filter((row) => covers(row.rawCoverage, time, row.asOf));
    const spilling = collected.map((row) => ({ row, ...spillingAt(row.events, time) }));
    const lower = spilling.filter((entry) => entry.lower).map((entry) => entry.row);
    const legacyCount = legacyStatus === "available" ? 0 : null;
    const members = { listed: observation.csoIds.length, reporting: legacyCount, spilling: legacyCount, inRdpSet: 0, rdpCollected: 0, rdpSpilling: 0 };
    for (const id of observation.csoIds) {
      const legacy = legacyStatusAt(legacyById.get(id) ?? [], time);
      const rdp = byExternal.get(id);
      const rdpCovered = rdp ? covers(rdp.rawCoverage, time, rdp.asOf) : false;
      const rdpState = rdpCovered ? spillingAt(rdp.events, time) : null;
      if (members.reporting !== null && legacy && legacy.status !== null) members.reporting += 1;
      if (members.spilling !== null && legacy?.status === 1) members.spilling += 1;
      if (rdp) members.inRdpSet += 1;
      if (rdpCovered) members.rdpCollected += 1;
      if (rdpState?.lower) members.rdpSpilling += 1;
      if (!legacy || ![0, 1].includes(legacy.status) || !rdpState) agreement.notComparable += 1;
      else if (rdpState.lower !== rdpState.upper) agreement.rdpUncertain += 1;
      else if (legacy.status === 1 && rdpState.lower) agreement.bothSpilling += 1;
      else if (legacy.status === 1) agreement.legacyOnly += 1;
      else if (rdpState.lower) agreement.rdpOnly += 1;
      else agreement.neither += 1;
    }
    return {
      observedAt: observation.observedAt,
      legacy: { numberCSOsPerKm2: observation.numberCSOsPerKm2, numberUpstreamCSOs: observation.numberUpstreamCSOs },
      members,
      rdp: {
        collectedOutfalls: collected.length,
        spillingOutfalls: { lower: lower.length, upper: spilling.filter((entry) => entry.upper).length },
        spillingLocations: countLocations(lower).locations,
        spillingWithoutLocation: countLocations(lower).withoutLocation,
      },
    };
  });
  return {
    state: "available",
    from,
    to,
    alignment: "legacy_observation_time",
    rows: aligned,
    observations: aligned.length,
    rdpCollectedObservations: aligned.filter((row) => row.rdp.collectedOutfalls > 0).length,
    legacyStatusHistory: { state: legacyStatus, records: statusHistory.length },
    memberAgreement: legacyStatus === "available" ? agreement : null,
    provider,
    sourceId,
    legacyThresholds: {
      version: calibration.version,
      elevated: calibration.waterQuality.elevatedDensity,
      high: calibration.waterQuality.highDensity,
      appliesTo: "legacy number_CSOs_per_km2 only",
    },
    interchangeable: false,
  };
}

async function readLegacyComparison(rows, walk) {
  const observations = await getLegacyWaterQualityObservations(walk.from, walk.to);
  const members = [...new Set(observations.flatMap((observation) => observation.csoIds))].slice(0, CATCHMENT_LEGACY_MEMBER_LIMIT);
  const since = new Date(Date.parse(walk.from) - LEGACY_STATUS_MATCH_MS).toISOString();
  // Optional input: a failed or empty legacy status read never hides the density comparison.
  const statusHistory = await getLegacyCsoStatusHistory(members, since, walk.to).catch(() => null);
  return compareWithLegacy({ rows, observations, statusHistory, provider: walk.provider, sourceId: walk.sourceId, from: walk.from, to: walk.to });
}

// ---- Section ----

const UNAVAILABLE_REASONS = { SET_NOT_FOUND: "set_not_enabled", AUTHORIZATION_FAILED: "not_authorised", AUTHENTICATION_FAILED: "not_authorised" };

export const CATCHMENT_METHOD = Object.freeze({
  source: "River Data Platform collection set activity (ADR-002 D3)",
  classification: "the page's existing current/recent rules applied per outfall",
  metric: "none: RDP's rdp.cso-activity/v1 metric is produced offline by River Tracer and is not available online",
  comparableWith: "not interchangeable with Sewage Map number_CSOs_per_km2; different catchment boundary, population, denominator and location semantics",
  locationRule: `identical published coordinates to ${LOCATION_DECIMALS} decimal places`,
  calibration: "none; legacy thresholds apply only to the legacy density",
});

// Never rejects for an RDP or Mongo failure: the section reports what is missing and the rest of the page is untouched.
export async function getCatchmentMonitoring(setKey = DEFAULT_CATCHMENT_SET, now = new Date()) {
  const spec = CATCHMENT_SETS[setKey];
  if (!spec) throw new HttpError(400, `set must be one of ${Object.keys(CATCHMENT_SETS).join(", ")}`);
  const logger = createRequestLogger({ method: "GET" }, "rdp/cso-catchment");
  const set = { key: setKey, label: spec.label, provider: spec.provider, providerLabel: providerLabel(spec.provider), sourceId: spec.sourceId,
    expectedOutfalls: spec.expectedOutfalls, relationshipSet: spec.relationshipSet, relationshipVersion: spec.relationshipVersion, scope: spec.scope };
  const base = { set, method: CATCHMENT_METHOD, generatedAt: now.toISOString() };

  // The catalogue (locations) is read alongside the walk so both fit inside the route's duration.
  const catalogueRead = withDeadline(readCatalogue(), CATCHMENT_CATALOGUE_DEADLINE_MS)
    .then((value) => ({ value, error: null }), (error) => ({ value: null, error: errorCode(error) }));
  let walk;
  try {
    walk = await withDeadline(readSetActivity(setKey, CATCHMENT_WINDOW_HOURS), CATCHMENT_READ_DEADLINE_MS);
    if (walk.provider !== spec.provider || walk.sourceId !== spec.sourceId) throw new RdpError("RESPONSE_CONTRACT_ERROR");
  } catch (error) {
    const code = errorCode(error);
    logger.warn(`RDP CSO catchment unavailable ${JSON.stringify({ set: setKey, code })}`);
    return { ...base, state: "unavailable", reason: UNAVAILABLE_REASONS[code] ?? "read_failed", errorCode: code };
  }

  const { value: catalogue, error: catalogueError } = await catalogueRead;
  const assetsById = catalogue ? new Map(catalogue.assets.map((asset) => [asset.assetId, asset])) : null;
  const rows = buildCatchmentRows(walk, assetsById, now);
  const summary = summariseCatchment(walk, rows, now);

  let comparison;
  try {
    comparison = await readLegacyComparison(rows, walk);
  } catch {
    comparison = { state: "unavailable", interchangeable: false };
  }

  const degraded = !walk.complete || walk.partialPages > 0 || catalogueError !== null;
  if (degraded) {
    logger.warn(`RDP CSO catchment degraded ${JSON.stringify({ set: setKey, stopReason: walk.stopReason, code: walk.errorCode,
      missing: walk.missing, partialPages: walk.partialPages, duplicates: walk.duplicates, catalogue: catalogueError })}`);
  }
  const attribution = catalogue?.catalogues.find((entry) => entry.provider === spec.provider && entry.sourceId === spec.sourceId)?.attribution ?? null;
  return {
    ...base,
    state: degraded ? "partial" : "available",
    selection: {
      // What RDP reports as the effective set on this stage, next to the reviewed size and the catalogue attribution.
      reportedTotal: walk.total,
      matchesReviewed: walk.total === spec.expectedOutfalls,
      catalogueMembers: catalogue ? catalogue.assets.filter((asset) => asset.sets.includes(setKey)).length : null,
      notInCatalogue: assetsById ? rows.filter((row) => !row.inCatalogue).length : null,
    },
    window: { hours: walk.hours, from: walk.from, to: walk.to, retrievedAt: walk.retrievedAt },
    read: { complete: walk.complete, pages: walk.pageCount, received: walk.received, missing: walk.missing, partialPages: walk.partialPages,
      duplicates: walk.duplicates, restarted: walk.restarted, stopReason: walk.stopReason, errorCode: walk.errorCode, catalogueError },
    summary,
    highlights: highlights(rows),
    comparison,
    attribution,
  };
}
