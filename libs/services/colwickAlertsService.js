import { createHash, randomBytes, randomUUID } from "node:crypto";
import * as yup from "yup";
import { HttpError } from "../api/http";
import { connectToDatabase } from "../database";
import { getLatestForecastSnapshot } from "./forecastService";
import { getHppStatusSnapshot } from "./hppStatusService";
import { getLatestWaterQualitySummaryHealth, getWaterQualityDensitySeries } from "./waterQualityService";
import { TRENT_DASHBOARD_STATIONS, getTrentStationKey } from "../trentWeirsConfig";
import { sendAlertConfirmationEmail, sendManageAlertsAccessEmail, sendThresholdAlertEmail } from "./alertMailerService";
import { getCsoActivityAssessment } from "../waterQualityIndicator";
import { alertRisk, ASSESSMENT_METHOD } from "../waterQualityAssessment";
import { decideWaterQualityRule, summariseWaterQualityDecisions } from "../alerts/waterQualityAlertDecision";
import { getRdpAlertAssessment, getWaterQualityAssessmentMode, LEGACY_ASSESSMENT_VERSION } from "./waterQualityAssessmentService";
import { createRequestLogger } from "../api/logger";
import { decideGaugeRule, describeGaugeRead, gaugeRetryGate, getGaugeAlertSourceMode, isLiveGaugeRule } from "../alerts/gaugeAlertDecision";
import { compareGaugeAlertShadow } from "../alerts/gaugeAlertShadow";

export const ALERT_SUBSCRIPTIONS_COLLECTION = "alertSubscriptions";
export const ALERT_MANAGE_SESSIONS_COLLECTION = "alertManageSessions";
export const ALERT_DELIVERIES_COLLECTION = "alertDeliveries";
export const ALERT_RUNS_COLLECTION = "alertRuns";
export const ALERT_RATE_LIMITS_COLLECTION = "alertRateLimits";
export const COLWICK_ALERT_GAUGE_KEY = "4009-level";
export const ALERT_MANAGE_SESSION_MS = 30 * 60 * 1000;
export const ALERT_CONFIRMATION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
// Live gauge observation-progress fields (#51 Slice D). A re-subscription starts without progress.
const OBSERVATION_PROGRESS_UNSET = { lastObservedAt: "", lastObservedValue: "", lastObservedSource: "", lastObservedMeasurementId: "", lastObservedState: "", lastObservedTransitionId: "", gaugeHold: "" };

const subscriptionSchema = yup.object({ email: yup.string().email().required(), alertType: yup.string().oneOf(["gauge", "hpp_status", "water_quality"]), gaugeKey: yup.string(), source: yup.string().oneOf(["live", "forecast"]), direction: yup.string().oneOf(["above", "below"]), threshold: yup.number().min(0).max(10000), desiredStatus: yup.string().oneOf(["open", "closed"]), riskLevel: yup.string().oneOf(["amber", "red"]) });
const emailSchema = yup.string().email().required();
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const createToken = () => randomBytes(24).toString("hex");
const normalizedEmail = (email) => email.trim().toLowerCase();
const timestamp = (now) => now.toISOString();
const typeOf = (rule) => rule.alertType || "gauge";
const stationFor = (gaugeKey) => TRENT_DASHBOARD_STATIONS.find((station) => getTrentStationKey(station) === gaugeKey);

function nameOf(rule) {
  if (typeOf(rule) === "hpp_status") return `HPP ${rule.desiredStatus === "open" ? "opens" : "closes"}`;
  if (typeOf(rule) === "water_quality") return `CSO risk reaches ${rule.riskLevel}`;
  return rule.gaugeName || stationFor(rule.gaugeKey)?.gaugeName || "Trent gauge";
}
function descriptionOf(rule) {
  if (typeOf(rule) === "hpp_status") return `We will email you when HPP is reported ${rule.desiredStatus}.`;
  if (typeOf(rule) === "water_quality") return `We will email you when CSO risk reaches ${rule.riskLevel}.`;
  const unit = stationFor(rule.gaugeKey)?.measureType === "flow" ? "cumecs" : "m";
  return `We will email you when ${nameOf(rule)} ${rule.direction === "below" ? "drops to or below" : "rises to or above"} ${Number(rule.threshold).toFixed(2)} ${unit}.`;
}
function normalizeRule(payload) {
  const alertType = payload.alertType || "gauge";
  if (alertType === "hpp_status") { if (!payload.desiredStatus) throw new HttpError(400, "Choose an HPP status"); return { alertType, desiredStatus: payload.desiredStatus, gaugeName: "HPP status" }; }
  if (alertType === "water_quality") { if (!payload.riskLevel) throw new HttpError(400, "Choose a water quality risk level"); return { alertType, riskLevel: payload.riskLevel, gaugeName: "Water quality" }; }
  const station = stationFor(payload.gaugeKey);
  if (!station) throw new HttpError(400, "Unknown Trent gauge");
  if (!payload.source || !payload.direction || !Number.isFinite(payload.threshold)) throw new HttpError(400, "Incomplete gauge alert");
  if (payload.source === "forecast" && payload.gaugeKey !== COLWICK_ALERT_GAUGE_KEY) throw new HttpError(400, "Forecast alerts are available for Colwick only");
  return { alertType, gaugeKey: payload.gaugeKey, gaugeName: station.gaugeName, stationId: station.stationId, measureType: station.measureType, source: payload.source, direction: payload.direction, threshold: Number(Number(payload.threshold).toFixed(3)) };
}
function alertKey(email, rule) { return [email, rule.alertType, rule.gaugeKey || rule.desiredStatus || rule.riskLevel, rule.source || "", rule.direction || "", rule.threshold ?? ""].join("|"); }
function managedRule(rule) { return { alertKey: rule.alertKey, alertType: typeOf(rule), gaugeName: nameOf(rule), source: rule.source || null, direction: rule.direction || null, threshold: rule.threshold ?? null, desiredStatus: rule.desiredStatus || null, riskLevel: rule.riskLevel || null, status: rule.status, createdAt: rule.createdAt || null, updatedAt: rule.updatedAt || null, confirmedAt: rule.confirmedAt || null, lastTriggeredAt: rule.lastTriggeredAt || null, description: descriptionOf(rule) }; }

async function limitRequests(db, email, ip, now) {
  const collection = db.collection(ALERT_RATE_LIMITS_COLLECTION); const cutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  for (const [kind, value, limit] of [["email", email, 3], ["ip", ip || "unknown", 10]]) {
    if (typeof collection.findOne !== "function") return;
    const key = `${kind}:${value}`; const old = await collection.findOne({ key }); const withinWindow = old?.windowStartedAt && new Date(old.windowStartedAt) > cutoff;
    if (withinWindow && old.count >= limit) throw new HttpError(429, "Too many alert requests. Please try again later.");
    await collection.updateOne({ key }, { $set: { windowStartedAt: withinWindow ? old.windowStartedAt : timestamp(now), updatedAt: timestamp(now) }, $inc: { count: withinWindow ? 1 : 1 } }, { upsert: true });
    if (!withinWindow) await collection.updateOne({ key }, { $set: { count: 1 } });
  }
}

// Delivery-transition state cleared when an inactive rule is (re)requested, so a re-subscription starts
// as a new rule: it is not stuck resuming an old pending/held delivery or re-baselined as an old one.
const TRANSITION_STATE_UNSET = { pendingTransitionId: "", pendingSince: "", lastTransitionId: "", wqAssessment: "" };
export const ALERT_PENDING_MESSAGE = "Almost done: open the link we emailed you within 24 hours to confirm. The alert is not active until you confirm it.";

export async function createColwickAlertSubscription(payload, { now = new Date(), ip } = {}) {
  const parsed = await subscriptionSchema.validate(payload, { stripUnknown: true }); const email = normalizedEmail(parsed.email); const rule = normalizeRule(parsed); const { db } = await connectToDatabase();
  await limitRequests(db, email, ip, now); const confirmationToken = createToken(); const key = alertKey(email, rule);
  const subscriptions = db.collection(ALERT_SUBSCRIPTIONS_COLLECTION);
  const confirmation = { confirmationTokenHash: hashToken(confirmationToken), confirmationExpiresAt: timestamp(new Date(now.getTime() + ALERT_CONFIRMATION_MS)) };
  // Requesting an alert that is already active must not deactivate it (anyone who knows the address could
  // otherwise switch it off) or reset its alert state. It stays active with its existing unsubscribe link;
  // the emailed link only reports that it is already active. The response is identical either way.
  const existing = await subscriptions.findOne({ alertKey: key });
  const keptActive = existing?.status === "active" && (await subscriptions.updateOne({ alertKey: key, status: "active" }, { $set: confirmation }))?.matchedCount === 1;
  const unsubscribeToken = keptActive ? existing.unsubscribeToken : createToken();
  if (!keptActive) {
    await subscriptions.updateOne({ alertKey: key }, { $set: { ...rule, email, alertKey: key, status: "pending_confirmation", ...confirmation, unsubscribeToken, updatedAt: timestamp(now), confirmedAt: null, unsubscribedAt: null, lastConditionState: "armed", lastTriggeredAt: null, lastEvaluatedAt: null }, $unset: { ...OBSERVATION_PROGRESS_UNSET, ...TRANSITION_STATE_UNSET }, $setOnInsert: { createdAt: timestamp(now) }, $inc: { stateRevision: 1 } }, { upsert: true });
  }
  await sendAlertConfirmationEmail({ email, gaugeName: nameOf(rule), source: rule.source || "status", direction: rule.direction, threshold: rule.threshold, confirmationToken, unsubscribeToken, ruleDescription: descriptionOf(rule) });
  return { message: ALERT_PENDING_MESSAGE };
}
/** Returns `{ status: "confirmed" | "already_active", message }`; an unusable link is a 404. */
export async function confirmColwickAlertSubscription(token, { now = new Date() } = {}) {
  if (!token) throw new HttpError(400, "Missing token parameter"); const { db } = await connectToDatabase(); const collection = db.collection(ALERT_SUBSCRIPTIONS_COLLECTION);
  const tokenHash = hashToken(token);
  const rule = await collection.findOne({ confirmationTokenHash: tokenHash, status: { $in: ["pending_confirmation", "active"] } });
  if (!rule || (rule.confirmationExpiresAt && new Date(rule.confirmationExpiresAt) <= now)) throw new HttpError(404, "This confirmation link is invalid, expired or has already been used.");
  const consumeToken = { $unset: { confirmationTokenHash: "", confirmationExpiresAt: "" } };
  if (rule.status === "active") {
    // A repeated request for an active alert: nothing to activate and no alert state to change.
    await collection.updateOne({ alertKey: rule.alertKey, confirmationTokenHash: tokenHash, status: "active" }, consumeToken);
    return { status: "already_active", message: "This alert is already active." };
  }
  const result = await collection.updateOne({ alertKey: rule.alertKey, confirmationTokenHash: tokenHash, status: "pending_confirmation" }, { $set: { status: "active", confirmedAt: timestamp(now), updatedAt: timestamp(now) }, ...consumeToken });
  // A concurrent re-request or unsubscribe replaced this link: it did not activate anything.
  if (result?.matchedCount === 0) throw new HttpError(404, "This confirmation link is invalid, expired or has already been used.");
  return { status: "confirmed", message: "Alert confirmed." };
}
export async function unsubscribeColwickAlertSubscription(token, { now = new Date() } = {}) {
  if (!token) throw new HttpError(400, "Missing token parameter"); const { db } = await connectToDatabase(); const collection = db.collection(ALERT_SUBSCRIPTIONS_COLLECTION); const rule = await collection.findOne({ unsubscribeToken: token }); if (!rule) throw new HttpError(404, "Alert unsubscribe token is invalid or expired");
  await collection.updateOne({ alertKey: rule.alertKey }, { $set: { status: "unsubscribed", unsubscribedAt: timestamp(now), updatedAt: timestamp(now) } }); return { message: "Alert unsubscribed." };
}
async function managementSession(token, now) { if (!token) throw new HttpError(400, "Missing token parameter"); const { db } = await connectToDatabase(); const sessions = db.collection(ALERT_MANAGE_SESSIONS_COLLECTION); const session = await sessions.findOne({ tokenHash: hashToken(token) }); if (!session || new Date(session.expiresAt) <= now) throw new HttpError(404, "Alert management link is invalid or expired"); return { db, sessions, session }; }
export async function requestColwickAlertManagementLink(emailInput, { now = new Date(), ip } = {}) { const email = normalizedEmail(await emailSchema.validate(emailInput)); const { db } = await connectToDatabase(); await limitRequests(db, email, ip, now); const token = createToken(); await db.collection(ALERT_MANAGE_SESSIONS_COLLECTION).updateOne({ email }, { $set: { email, tokenHash: hashToken(token), createdAt: timestamp(now), expiresAt: timestamp(new Date(now.getTime() + ALERT_MANAGE_SESSION_MS)) } }, { upsert: true }); await sendManageAlertsAccessEmail({ email, manageToken: token }); return { message: "Check your email for a link to manage your Colwick alerts." }; }
export async function listColwickAlertsForManagement(token, { now = new Date() } = {}) { const { db, sessions, session } = await managementSession(token, now); const rules = await db.collection(ALERT_SUBSCRIPTIONS_COLLECTION).find({ email: session.email, status: { $ne: "unsubscribed" } }).toArray(); const nextToken = createToken(); await sessions.updateOne({ email: session.email }, { $set: { tokenHash: hashToken(nextToken), createdAt: timestamp(now), expiresAt: timestamp(new Date(now.getTime() + ALERT_MANAGE_SESSION_MS)) } }); return { email: session.email, alerts: rules.map(managedRule), manageToken: nextToken }; }
export async function deleteManagedColwickAlert({ token, alertKey: key }, { now = new Date() } = {}) { if (!key) throw new HttpError(400, "Missing alertKey"); const { db, session } = await managementSession(token, now); const result = await db.collection(ALERT_SUBSCRIPTIONS_COLLECTION).updateOne({ email: session.email, alertKey: key, status: { $ne: "unsubscribed" } }, { $set: { status: "unsubscribed", unsubscribedAt: timestamp(now), updatedAt: timestamp(now) } }); if (!result?.matchedCount) throw new HttpError(404, "Alert not found"); return { message: "Alert removed." }; }

const usable = (result) => result.status === "fulfilled" && (!result.value?.health || result.value.health.state === "fresh");
// Forecast gauge rules only. Live gauge rules are decided from alert-safe observations (libs/alerts).
/** Forecast level hysteresis, the same 0.03 m margin as live level readings. */
const FORECAST_HYSTERESIS_M = 0.03;
/** A forecast row's reading, or null when it is missing or not numeric (null and "" are not 0 m). */
function forecastReading(row) {
  const raw = row?.forecast_reading;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
/**
 * Met when any forecast row reaches the threshold. Clear (re-arm) only when every row is readable and
 * beyond the threshold by the hysteresis margin, as in the original forecast rule.
 */
function forecastCondition(rule, forecast) {
  const rows = Array.isArray(forecast?.forecast_data) ? forecast.forecast_data : [];
  const below = rule.direction === "below";
  const readings = rows.map((row) => ({ row, value: forecastReading(row) }));
  const crossing = readings.find(({ value }) => value !== null && (below ? value <= rule.threshold : value >= rule.threshold));
  if (crossing) return { met: true, clear: false, value: crossing.value, at: crossing.row.forecast_date, forecastRunAt: forecast?.metadata?.forecast_time || null };
  const clear = readings.length > 0 && readings.every(({ value }) => value !== null && (below ? value >= rule.threshold + FORECAST_HYSTERESIS_M : value <= rule.threshold - FORECAST_HYSTERESIS_M));
  return { met: false, clear };
}
function risk(rows, now = new Date()) { const assessment = getCsoActivityAssessment(rows, now); return assessment.level === "high" ? "red" : assessment.level === "elevated" ? "amber" : assessment.level === "lower" ? "green" : null; }
function legacyWaterRisk(sources, now) { const value = usable(sources.water) && sources.cso.status === "fulfilled" ? risk(sources.cso.value, now) : null; return value ? { lowest: value, highest: value, at: sources.water.value.ScrapeTimestamp } : null; }
function condition(rule, sources, now) { const type = typeOf(rule); if (type === "gauge") return rule.source === "forecast" && usable(sources.forecast) ? forecastCondition(rule, sources.forecast.value) : null; if (type === "hpp_status") { const value = sources.hpp.value?.data?.currentStatus; return usable(sources.hpp) && typeof value === "boolean" ? { met: rule.desiredStatus === (value ? "open" : "closed"), clear: rule.desiredStatus !== (value ? "open" : "closed"), value: value ? "open" : "closed", at: sources.hpp.value.data.health.generatedAt } : null; } const value = usable(sources.water) && sources.cso.status === "fulfilled" ? risk(sources.cso.value, now) : null; if (!value) return null; const rank = { green: 0, amber: 1, red: 2 }; return { met: rank[value] >= rank[rule.riskLevel], clear: rank[value] < rank[rule.riskLevel], value, at: sources.water.value.ScrapeTimestamp }; }

// ---------------------------------------------------------------------------
// Scheduled evaluation: concurrency, delivery and run-record safety (#47).
//
// Subscription state changes use compare-and-set on `stateRevision`, so an overlapping or
// stale invocation can never overwrite a newer armed/triggered transition. A threshold
// transition is gated on the subscription first (`pendingTransitionId`), then recorded as
// an immutable delivery intent, then sent. While a rule has a pending delivery it is not
// re-evaluated: later runs only resume that delivery, with the same idempotency key and
// payload, until it is sent, definitively rejected, or held for operator review.
// See docs/ALERT_EVALUATION_RELIABILITY.md.
// ---------------------------------------------------------------------------

/** Resend keeps idempotency keys for 24 hours; stop automatic retries an hour before that. */
export const PROVIDER_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PROVIDER_IDEMPOTENCY_MARGIN_MS = 60 * 60 * 1000;
export const MAX_DELIVERY_ATTEMPTS = 5;
/** A claim or gate older than this is treated as abandoned by a crashed or timed-out invocation. */
export const DELIVERY_CLAIM_STALE_MS = 10 * 60 * 1000;
/** A run still marked "running" after this was interrupted before it could record its outcome. */
export const ALERT_RUN_STALE_MS = 30 * 60 * 1000;
export const ALERT_DELIVERIES_INDEX_KEY = { alertKey: 1, transitionId: 1 };

const ageMs = (value, now) => (value ? now.getTime() - new Date(value).getTime() : Number.POSITIVE_INFINITY);
const isDuplicateKeyError = (error) => error?.code === 11000;
const sendOutcomeOf = (error) => (error?.deliveryOutcome === "rejected" ? "rejected" : "uncertain");
const errorCategoryOf = (error) => error?.reason || (isDuplicateKeyError(error) ? "duplicate_key" : error?.name || "error");

function thresholdEmailPayload(rule, state) {
  return { gaugeName: nameOf(rule), source: rule.source || "status", direction: rule.direction, threshold: rule.threshold, observedValue: typeof state.value === "number" ? state.value : null, observedAt: state.at, forecastRunAt: state.forecastRunAt, unsubscribeToken: rule.unsubscribeToken, ruleDescription: descriptionOf(rule) };
}

let deliveryIndexVerified = false;
/** Read-only check that the unique delivery index exists; provision it with `npm run db:indexes:alerts`. */
async function deliveryIndexStatus(deliveries) {
  if (deliveryIndexVerified) return "present";
  if (typeof deliveries.listIndexes !== "function") return "unverified";
  try {
    const indexes = await deliveries.listIndexes().toArray();
    const expected = JSON.stringify(ALERT_DELIVERIES_INDEX_KEY);
    deliveryIndexVerified = indexes.some((index) => index.unique && JSON.stringify(index.key) === expected);
    return deliveryIndexVerified ? "present" : "missing";
  } catch {
    return "unverified";
  }
}

function createEvaluation(db, now) {
  const subscriptions = db.collection(ALERT_SUBSCRIPTIONS_COLLECTION);
  const deliveries = db.collection(ALERT_DELIVERIES_COLLECTION);
  const at = timestamp(now);
  const deliveryFilter = (rule, transitionId) => ({ alertKey: rule.alertKey, transitionId });

  /** Release a pending transition back to armed; nothing was sent for it. */
  async function releaseTransition(rule, transitionId) {
    // Keep a live gauge's observation marker attached: the triggering observation was processed.
    const markerState = rule.lastObservedAt ? { lastObservedState: "armed" } : {};
    // Likewise a water-quality assessment marker (RDP_WQ_ASSESSMENT=rdp).
    if (rule.wqAssessment) markerState.wqAssessment = { ...rule.wqAssessment, state: "armed" };
    const result = await subscriptions.updateOne(
      { alertKey: rule.alertKey, pendingTransitionId: transitionId },
      { $set: { lastConditionState: "armed", ...markerState, updatedAt: at }, $unset: { pendingTransitionId: "", pendingSince: "" }, $inc: { stateRevision: 1 } }
    );
    return result?.matchedCount === 1;
  }

  /** The delivery for the pending transition reached the provider: keep the rule triggered. */
  async function completeTransition(rule, transitionId) {
    await subscriptions.updateOne(
      { alertKey: rule.alertKey, pendingTransitionId: transitionId },
      { $set: { lastTriggeredAt: at, lastEvaluatedAt: at, updatedAt: at }, $unset: { pendingTransitionId: "", pendingSince: "" } }
    );
  }

  async function holdForReview(rule, delivery, reason) {
    await deliveries.updateOne(
      { ...deliveryFilter(rule, delivery.transitionId), state: delivery.state, attempts: delivery.attempts ?? null },
      { $set: { state: "held_for_review", heldAt: at, heldReason: reason, updatedAt: at } }
    );
    return "held";
  }

  /**
   * Send one claimed attempt and record its outcome. The caller must hold the claim for `attempt`.
   * `priorMayHaveSent` is true when an earlier attempt for this delivery had an uncertain outcome.
   */
  async function attemptSend(rule, delivery, attempt, priorMayHaveSent) {
    const transitionId = delivery.transitionId;
    const claimed = { ...deliveryFilter(rule, transitionId), state: "claimed", attempts: attempt };
    try {
      await sendThresholdAlertEmail({ ...delivery.payload, email: rule.email, idempotencyKey: delivery.idempotencyKey });
    } catch (error) {
      const outcome = sendOutcomeOf(error);
      const lastError = errorCategoryOf(error);
      if (outcome === "rejected" && !priorMayHaveSent) {
        // Definitely never sent: re-arm so a later reading can retry, as before.
        await deliveries.updateOne(claimed, { $set: { state: "failed", lastError, updatedAt: at } });
        await releaseTransition(rule, transitionId);
        return "failed";
      }
      if (outcome === "rejected") {
        // A rejection after an earlier uncertain attempt cannot prove the first attempt failed.
        await deliveries.updateOne(claimed, { $set: { state: "held_for_review", heldAt: at, heldReason: "rejected_after_uncertain", lastError, updatedAt: at } });
        return "held";
      }
      await deliveries.updateOne(claimed, { $set: { state: "uncertain", lastError, updatedAt: at } });
      return "uncertain";
    }
    // Any successful attempt means the provider accepted the message under this idempotency key.
    await deliveries.updateOne({ ...deliveryFilter(rule, transitionId), state: { $ne: "sent" } }, { $set: { state: "sent", sentAt: at, updatedAt: at }, $unset: { lastError: "" } });
    await completeTransition(rule, transitionId);
    return "sent";
  }

  /**
   * Resume an existing delivery record for the rule's pending transition. `retryGate`, for live
   * gauge rules, defers any re-send unless the newest eligible fresh observation still meets the rule.
   */
  async function resumeDelivery(rule, delivery, fallbackPayload, retryGate = null) {
    const transitionId = delivery.transitionId;
    switch (delivery.state) {
      case "sent":
        await completeTransition(rule, transitionId);
        return "suppressed";
      case "held_for_review":
        return "held";
      case "abandoned":
        // An operator confirmed nothing was sent: return the rule to normal evaluation.
        return (await releaseTransition(rule, transitionId)) ? "released" : "conflict";
      case "claimed":
        if (ageMs(delivery.attemptStartedAt || delivery.updatedAt, now) < DELIVERY_CLAIM_STALE_MS) return "in_flight";
        break;
      case "uncertain":
      case "failed":
        break;
      default:
        return holdForReview(rule, delivery, "unknown_state");
    }
    const payload = delivery.payload || fallbackPayload;
    if (!payload) return holdForReview(rule, delivery, "missing_payload");
    const previousAttempts = delivery.attempts ?? (delivery.state === "failed" ? 0 : 1);
    const firstAttemptAt = delivery.firstAttemptAt || delivery.createdAt || at;
    // "failed" is only ever recorded for deliveries with no uncertain attempt.
    const mayHaveBeenSent = delivery.state !== "failed";
    if (mayHaveBeenSent) {
      if (ageMs(firstAttemptAt, now) >= PROVIDER_IDEMPOTENCY_WINDOW_MS - PROVIDER_IDEMPOTENCY_MARGIN_MS) return holdForReview(rule, delivery, "idempotency_window_expired");
      if (previousAttempts >= MAX_DELIVERY_ATTEMPTS) return holdForReview(rule, delivery, "max_attempts");
    }
    if (retryGate && !retryGate().allowed) return "deferred";
    const attempt = previousAttempts + 1;
    const claim = await deliveries.updateOne(
      { ...deliveryFilter(rule, transitionId), state: delivery.state, attempts: delivery.attempts ?? null, attemptStartedAt: delivery.attemptStartedAt ?? null },
      { $set: { state: "claimed", attempts: attempt, attemptStartedAt: at, firstAttemptAt, payload, updatedAt: at } }
    );
    if (claim?.matchedCount !== 1) return "in_flight";
    return attemptSend(rule, { ...delivery, payload, attempts: attempt }, attempt, mayHaveBeenSent);
  }

  /** A rule that already has a pending transition: resume it instead of evaluating a new one. */
  async function resumePending(rule, retryGate) {
    const transitionId = rule.pendingTransitionId;
    const delivery = await deliveries.findOne(deliveryFilter(rule, transitionId));
    if (delivery) return resumeDelivery(rule, delivery, null, retryGate);
    // Gate taken but the delivery intent was never recorded, so no email can have been sent.
    if (ageMs(rule.pendingSince, now) < DELIVERY_CLAIM_STALE_MS) return "in_flight";
    return (await releaseTransition(rule, transitionId)) ? "released" : "conflict";
  }

  /**
   * Live gauge observation progress, written in the same compare-and-set as the state it belongs to.
   * The recorded state/transition fingerprint detaches the marker if another writer changes state.
   */
  function progressUpdate(progress, state, transitionId) {
    if (!progress) return {};
    // Water-quality assessment marker: the assessment version and evidence time the state was decided from.
    if (progress.kind === "wq") {
      return { set: { wqAssessment: { version: progress.version, at: progress.at, lowest: progress.lowest, highest: progress.highest, state,
        transitionId: transitionId ?? null, suppressUntilClear: progress.suppressUntilClear } } };
    }
    return {
      set: { lastObservedAt: progress.at, lastObservedValue: progress.value, lastObservedSource: progress.source, lastObservedMeasurementId: progress.measurementId, lastObservedState: state, lastObservedTransitionId: transitionId ?? null },
      unset: { gaugeHold: "" },
    };
  }

  /** Newly met condition on an armed rule: gate, record the intent, then send. */
  async function trigger(rule, state, progress = null) {
    // A forecast crossing is also identified by its forecast run: a later run can predict the same
    // time and value after the rule has cleared, and that new transition must not reuse a sent delivery.
    const transitionId = `${rule.alertKey}:${state.at || at}:${state.value}${state.forecastRunAt ? `:${state.forecastRunAt}` : ""}`;
    const marker = progressUpdate(progress, "triggered", transitionId);
    const gate = await subscriptions.updateOne(
      { alertKey: rule.alertKey, status: "active", stateRevision: rule.stateRevision ?? null, lastConditionState: rule.lastConditionState ?? null, pendingTransitionId: null },
      { $set: { lastConditionState: "triggered", pendingTransitionId: transitionId, lastTransitionId: transitionId, pendingSince: at, lastEvaluatedAt: at, updatedAt: at, ...marker.set }, ...(marker.unset && { $unset: marker.unset }), $inc: { stateRevision: 1 } }
    );
    if (gate?.matchedCount !== 1) return "conflict";
    const payload = thresholdEmailPayload(rule, state);
    const intent = { alertKey: rule.alertKey, transitionId, idempotencyKey: createHash("sha256").update(transitionId).digest("hex"), state: "claimed", attempts: 1, firstAttemptAt: at, attemptStartedAt: at, payload, createdAt: at, updatedAt: at };
    let inserted = false;
    try {
      const result = await deliveries.updateOne(deliveryFilter(rule, transitionId), { $setOnInsert: intent }, { upsert: true });
      inserted = result?.upsertedCount === 1;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    if (inserted) return attemptSend(rule, intent, 1, false);
    // A record for this exact transition already exists (e.g. from an earlier partial run).
    const existing = await deliveries.findOne(deliveryFilter(rule, transitionId));
    return existing ? resumeDelivery(rule, existing, payload) : "in_flight";
  }

  async function rearm(rule, progress = null) {
    const marker = progressUpdate(progress, "armed", rule.lastTransitionId);
    const result = await subscriptions.updateOne(
      { alertKey: rule.alertKey, status: "active", stateRevision: rule.stateRevision ?? null, lastConditionState: "triggered", pendingTransitionId: null },
      { $set: { lastConditionState: "armed", lastEvaluatedAt: at, updatedAt: at, ...marker.set }, ...(marker.unset && { $unset: marker.unset }), $inc: { stateRevision: 1 } }
    );
    return result?.matchedCount === 1 ? "rearmed" : "conflict";
  }

  /** Record observation progress without a state change (also the first, reconciling marker). */
  async function advance(rule, progress, outcome) {
    const marker = progressUpdate(progress, rule.lastConditionState === "triggered" ? "triggered" : "armed", rule.lastTransitionId);
    const result = await subscriptions.updateOne(
      { alertKey: rule.alertKey, status: "active", stateRevision: rule.stateRevision ?? null, lastConditionState: rule.lastConditionState ?? null, pendingTransitionId: null },
      // Water-quality markers have no `unset`: an absent operator must be omitted, never sent as null.
      { $set: { lastEvaluatedAt: at, updatedAt: at, ...marker.set }, ...(marker.unset && { $unset: marker.unset }), $inc: { stateRevision: 1 } }
    );
    return result?.matchedCount === 1 ? outcome : "conflict";
  }

  /**
   * Hold a live gauge rule: no transition and no progress. The hold is re-decided on every run, so
   * it clears itself once continuity evidence appears; `gaugeHold` is only an operator-visible label.
   */
  async function holdGauge(rule, reason, source) {
    const set = { lastEvaluatedAt: at, updatedAt: at };
    if (rule.gaugeHold?.reason !== reason || rule.gaugeHold?.source !== source) set.gaugeHold = { reason, source, since: at };
    await subscriptions.updateOne({ alertKey: rule.alertKey, stateRevision: rule.stateRevision ?? null }, { $set: set });
    return "gauge_held";
  }

  async function touch(rule) {
    await subscriptions.updateOne({ alertKey: rule.alertKey }, { $set: { lastEvaluatedAt: at, updatedAt: at } });
  }

  async function evaluateLiveGauge(rule, read, holdReasons) {
    const decision = decideGaugeRule(rule, read, now);
    switch (decision.kind) {
      case "trigger":
        return trigger(rule, { met: true, value: decision.observation.value, at: decision.observation.at }, decision.progress);
      case "rearm":
        return rearm(rule, decision.progress);
      case "advance":
        return advance(rule, decision.progress, "unchanged");
      case "enrol":
        return advance(rule, decision.progress, "enrolled");
      case "hold":
        holdReasons[decision.reason] = (holdReasons[decision.reason] || 0) + 1;
        return holdGauge(rule, decision.reason, read?.source ?? null);
      case "unchanged":
        await touch(rule);
        return "unchanged";
      default:
        await touch(rule);
        return "skipped";
    }
  }

  /**
   * Water-quality rules decided with assessment markers: every rule under RDP_WQ_ASSESSMENT=rdp, and in legacy/shadow
   * mode only rules that carry a marker (they were last decided by another assessment, e.g. before a rollback).
   */
  async function evaluateWaterQuality(rule, risk, version) {
    const decision = decideWaterQualityRule(rule, risk, version);
    const progress = risk && { kind: "wq", version, at: risk.at, lowest: risk.lowest, highest: risk.highest, suppressUntilClear: decision.suppressUntilClear ?? false };
    switch (decision.kind) {
      case "trigger":
        return trigger(rule, { met: true, value: decision.value, at: risk.at }, progress);
      case "rearm":
        return rearm(rule, progress);
      case "enrol":
        return advance(rule, progress, "enrolled");
      case "advance":
        return advance(rule, progress, "unchanged");
      case "unchanged":
        await touch(rule);
        return "unchanged";
      default:
        await touch(rule);
        return "skipped";
    }
  }

  async function evaluate(rule, sources) {
    if (typeOf(rule) === "water_quality") {
      if (rule.pendingTransitionId) return resumePending(rule, null);
      if (sources.wqMode === "rdp") return evaluateWaterQuality(rule, sources.wq.status === "fulfilled" ? sources.wq.risk : null, ASSESSMENT_METHOD.version);
      if (sources.wqMode === null) {
        await touch(rule);
        return "skipped";
      }
      // Legacy/shadow: unchanged for rules that never saw the RDP assessment (no marker); marked rules re-enrol first.
      if (rule.wqAssessment) return evaluateWaterQuality(rule, legacyWaterRisk(sources, now), LEGACY_ASSESSMENT_VERSION);
    }
    if (isLiveGaugeRule(rule)) {
      const read = sources.gauges?.get(rule.gaugeKey);
      if (rule.pendingTransitionId) return resumePending(rule, () => gaugeRetryGate(rule, read, now));
      return evaluateLiveGauge(rule, read, sources.gaugeHoldReasons);
    }
    if (rule.pendingTransitionId) return resumePending(rule, null);
    const next = condition(rule, sources, now);
    if (!next) {
      await touch(rule);
      return "skipped";
    }
    if (rule.lastConditionState === "triggered" && next.clear) return rearm(rule);
    if (next.met && rule.lastConditionState !== "triggered") return trigger(rule, next);
    await touch(rule);
    return "unchanged";
  }

  return { evaluate, deliveries };
}

async function outstandingDeliveries(deliveries, now) {
  if (typeof deliveries.countDocuments !== "function") return null;
  const staleBefore = timestamp(new Date(now.getTime() - DELIVERY_CLAIM_STALE_MS));
  const [staleClaims, uncertain, heldForReview] = await Promise.all([
    deliveries.countDocuments({ state: "claimed", updatedAt: { $lt: staleBefore } }),
    deliveries.countDocuments({ state: "uncertain" }),
    deliveries.countDocuments({ state: "held_for_review" }),
  ]);
  return { staleClaims, uncertain, heldForReview };
}

const OUTCOME_COUNTERS = { sent: "sent", rearmed: "rearmed", skipped: "skipped", suppressed: "suppressed", conflict: "suppressed", failed: "failed", uncertain: "uncertain", held: "heldForReview", in_flight: "inFlight", released: "released", error: "errors", enrolled: "enrolled", gauge_held: "gaugeHeld", deferred: "deferred" };

// ---------------------------------------------------------------------------
// Live gauge source (#51 Slice D). `RDP_GAUGE_ALERTS_SOURCE` is read once per run and pinned:
// `legacy` and `shadow` evaluate from Environment Agency readings, `rdp` only from RDP. `shadow`
// additionally reads RDP and compares decisions in a pure function; that path has no database
// handle and no mailer. The reader is loaded lazily so the module graph stays free of the
// server-only RDP client when no live gauge rule exists.
// See docs/RDP-GAUGE-ALERTS-51D.md.
// ---------------------------------------------------------------------------

async function readGauges(source, gaugeKeys, now) {
  if (!gaugeKeys.length) return new Map();
  try {
    const { readGaugeAlertObservations } = await import("../alerts/gaugeObservations");
    return await readGaugeAlertObservations({ source, gaugeKeys, now });
  } catch {
    return new Map(gaugeKeys.map((gaugeKey) => [gaugeKey, { ok: false, source, gaugeKey, error: "READER_UNAVAILABLE" }]));
  }
}

function gaugeDiagnostics(gauges, now) {
  return Object.fromEntries([...gauges].map(([key, read]) => [key, describeGaugeRead(read, now)]));
}

/** Never throws and never writes: the comparison is logged and summarised in the response only. */
async function reportGaugeShadow(shadowRead, rules, legacyGauges, now) {
  const logger = createRequestLogger({ method: "GET" }, "alerts/gauge-shadow");
  try {
    const report = compareGaugeAlertShadow({ rules, legacy: legacyGauges, rdp: await shadowRead, now });
    logger.info(`RDP gauge alert shadow comparison ${JSON.stringify(report)}`);
    return { status: report.rdpRead, compared: report.decisions.compared, disagreed: report.decisions.disagreed, pendingDisagreed: report.decisions.pendingDisagreed };
  } catch {
    logger.warn("RDP gauge alert shadow comparison failed");
    return { status: "failed" };
  }
}

/** A cold 7-day set walk takes about 70 s; it is normally a shared cache hit. */
export const WQ_ALERT_READ_DEADLINE_MS = 120000;

/** The RDP assessment's alert view, read once per run. Never rejects. */
async function readWaterQualityAssessment(now) {
  try {
    const assessment = await getRdpAlertAssessment({ now, deadlineMs: WQ_ALERT_READ_DEADLINE_MS });
    const cso = assessment.current.factors.cso;
    const risk = alertRisk(cso);
    return { status: risk ? "fulfilled" : "unavailable", risk,
      diagnostics: { version: assessment.version, level: cso.level, risk, observedAt: cso.observedAt ?? null, unknown: cso.unknown ?? null, reason: cso.unavailableReason ?? null } };
  } catch {
    return { status: "unavailable", risk: null, diagnostics: { reason: "read_failed" } };
  }
}

export async function runColwickAlerts({ now = new Date() } = {}) {
  const started = Date.now();
  const gaugeMode = getGaugeAlertSourceMode();
  // RDP_WQ_ASSESSMENT is pinned for the run. Invalid: water-quality rules are skipped (`wq-assessment-config`).
  const wqMode = getWaterQualityAssessmentMode();
  const { db } = await connectToDatabase();
  const runs = db.collection(ALERT_RUNS_COLLECTION);
  const runId = randomUUID();
  const startedAt = timestamp(now);

  // Make interrupted earlier runs identifiable, then record this run before any side effects.
  const staleRuns = await runs.updateMany(
    { status: "running", startedAt: { $lt: timestamp(new Date(now.getTime() - ALERT_RUN_STALE_MS)) } },
    { $set: { status: "incomplete", reconciledAt: startedAt, reconciledByRunId: runId } }
  );
  await runs.insertOne({ runId, status: "running", startedAt });

  try {
    const { evaluate, deliveries } = createEvaluation(db, now);
    const deliveryIndex = await deliveryIndexStatus(deliveries);
    const rules = await db.collection(ALERT_SUBSCRIPTIONS_COLLECTION).find({ status: "active" }).toArray();
    const liveRules = rules.filter(isLiveGaugeRule);
    const gaugeKeys = [...new Set(liveRules.map((rule) => rule.gaugeKey))];
    // Pre-run copies for the shadow comparison; evaluation never sees them.
    const shadowRules = gaugeMode === "shadow" ? structuredClone(liveRules) : null;
    const shadowRead = gaugeMode === "shadow" && gaugeKeys.length ? readGauges("rdp", gaugeKeys, now).catch(() => null) : null;
    const authoritativeGauges = gaugeMode ? readGauges(gaugeMode === "rdp" ? "rdp" : "legacy", gaugeKeys, now) : Promise.resolve(new Map());
    const wqRules = rules.filter((rule) => typeOf(rule) === "water_quality");
    const readsLegacyWater = wqMode === "legacy" || wqMode === "shadow";
    const readsRdpWater = (wqMode === "rdp" || wqMode === "shadow") && wqRules.length > 0;
    const skippedRead = Promise.resolve(null);
    const [gaugeResult, forecast, hpp, water, cso, wqRead] = await Promise.allSettled([authoritativeGauges, getLatestForecastSnapshot(), getHppStatusSnapshot(),
      readsLegacyWater ? getLatestWaterQualitySummaryHealth() : skippedRead, readsLegacyWater ? getWaterQualityDensitySeries(3) : skippedRead,
      readsRdpWater ? readWaterQualityAssessment(now) : skippedRead]);
    const gauges = gaugeResult.status === "fulfilled" ? gaugeResult.value : new Map();
    const gaugeHoldReasons = {};
    const wq = wqRead.value ?? { status: "not_read", risk: null, diagnostics: null };
    // Shadow decisions use pre-run copies; evaluation never sees them and nothing is written for them.
    const wqShadow = wqMode === "shadow" && wqRules.length
      ? { rdp: wq.diagnostics, decisions: summariseWaterQualityDecisions(structuredClone(wqRules), wq.risk, ASSESSMENT_METHOD.version) } : null;
    const sources = { gauges, gaugeHoldReasons, forecast, hpp, water, cso, wqMode, wq };
    const counts = { sent: 0, rearmed: 0, skipped: 0, suppressed: 0, failed: 0, uncertain: 0, heldForReview: 0, inFlight: 0, released: 0, errors: 0, enrolled: 0, gaugeHeld: 0, deferred: 0 };
    const errorCategories = {};

    for (const rule of rules) {
      let outcome;
      try {
        outcome = await evaluate(rule, sources);
      } catch (error) {
        // Isolate per-rule database failures; durable state lets a later run resume.
        outcome = "error";
        const category = errorCategoryOf(error);
        errorCategories[category] = (errorCategories[category] || 0) + 1;
      }
      const counter = OUTCOME_COUNTERS[outcome];
      if (counter) counts[counter] += 1;
      if (outcome === "failed" || outcome === "error" || outcome === "gauge_held") counts.skipped += 1;
    }

    const gaugeSources = gaugeDiagnostics(gauges, now);
    const sourceFailures = [
      ...(gaugeMode ? [] : ["gauge-source-config"]),
      ...Object.entries(gaugeSources).filter(([, read]) => read.status !== "fresh").map(([key]) => `gauge:${key}`),
      ...["forecast", "hpp"].filter((name) => !usable(sources[name])),
      ...(readsLegacyWater ? ["water", "cso"].filter((name) => !usable(sources[name])) : []),
      ...(wqMode === null ? ["wq-assessment-config"] : []),
      ...(wqMode === "rdp" && readsRdpWater && wq.status !== "fulfilled" ? ["wq-assessment"] : []),
    ];
    const outstanding = await outstandingDeliveries(deliveries, now).catch(() => null);
    const degraded = sourceFailures.length || counts.errors || counts.failed || counts.uncertain || counts.heldForReview || counts.gaugeHeld || deliveryIndex === "missing";
    const result = {
      runId, scanned: rules.length, ...counts, sourceFailures, errorCategories, deliveryIndex,
      gaugeSource: gaugeMode ?? "invalid", gaugeSources, gaugeHoldReasons,
      waterQualitySource: wqMode ?? "invalid", ...(wqMode === "rdp" && wq.diagnostics && { waterQuality: wq.diagnostics }),
      outstandingDeliveries: outstanding,
      needsReview: Boolean(outstanding && (outstanding.staleClaims || outstanding.heldForReview)),
      incompleteRunsReconciled: staleRuns?.modifiedCount ?? 0,
      durationMs: Date.now() - started,
    };
    await runs.updateOne({ runId }, { $set: { ...result, status: degraded ? "degraded" : "success", completedAt: new Date().toISOString() } });
    // The shadow summary is returned (and logged) only; it is never part of the run record.
    if (wqShadow) createRequestLogger({ method: "GET" }, "alerts/wq-shadow").info(`RDP water-quality alert shadow ${JSON.stringify(wqShadow)}`);
    const withWqShadow = wqShadow ? { ...result, waterQualityShadow: wqShadow } : result;
    if (shadowRules) return { ...withWqShadow, shadow: shadowRead ? await reportGaugeShadow(shadowRead, shadowRules, gauges, now) : { status: "no_live_rules" } };
    return withWqShadow;
  } catch (error) {
    await runs.updateOne({ runId }, { $set: { status: "failed", errorCategory: errorCategoryOf(error), durationMs: Date.now() - started, completedAt: new Date().toISOString() } }).catch(() => {});
    throw error;
  }
}
