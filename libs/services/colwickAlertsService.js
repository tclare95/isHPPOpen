import { createHash, randomBytes } from "node:crypto";
import * as yup from "yup";
import { HttpError } from "../api/http";
import { connectToDatabase } from "../database";
import { getLatestForecastSnapshot } from "./forecastService";
import { getTrentWeirsSnapshot } from "./trentWeirsService";
import { getHppStatusSnapshot } from "./hppStatusService";
import { getLatestWaterQualitySnapshot, getWaterQualityDensitySeries } from "./waterQualityService";
import { TRENT_DASHBOARD_STATIONS, getTrentStationKey } from "../trentWeirsConfig";
import { sendAlertConfirmationEmail, sendManageAlertsAccessEmail, sendThresholdAlertEmail } from "./alertMailerService";

export const ALERT_SUBSCRIPTIONS_COLLECTION = "alertSubscriptions";
export const ALERT_MANAGE_SESSIONS_COLLECTION = "alertManageSessions";
export const ALERT_DELIVERIES_COLLECTION = "alertDeliveries";
export const ALERT_RUNS_COLLECTION = "alertRuns";
export const ALERT_RATE_LIMITS_COLLECTION = "alertRateLimits";
export const COLWICK_ALERT_GAUGE_KEY = "4009-level";
export const ALERT_MANAGE_SESSION_MS = 30 * 60 * 1000;
export const ALERT_CONFIRMATION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

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

export async function createColwickAlertSubscription(payload, { now = new Date(), ip } = {}) {
  const parsed = await subscriptionSchema.validate(payload, { stripUnknown: true }); const email = normalizedEmail(parsed.email); const rule = normalizeRule(parsed); const { db } = await connectToDatabase();
  await limitRequests(db, email, ip, now); const confirmationToken = createToken(); const unsubscribeToken = createToken(); const key = alertKey(email, rule);
  await db.collection(ALERT_SUBSCRIPTIONS_COLLECTION).updateOne({ alertKey: key }, { $set: { ...rule, email, alertKey: key, status: "pending_confirmation", confirmationTokenHash: hashToken(confirmationToken), confirmationExpiresAt: timestamp(new Date(now.getTime() + ALERT_CONFIRMATION_MS)), unsubscribeToken, updatedAt: timestamp(now), confirmedAt: null, unsubscribedAt: null, lastConditionState: "armed", lastTriggeredAt: null, lastEvaluatedAt: null }, $setOnInsert: { createdAt: timestamp(now) } }, { upsert: true });
  await sendAlertConfirmationEmail({ email, gaugeName: nameOf(rule), source: rule.source || "status", direction: rule.direction, threshold: rule.threshold, confirmationToken, unsubscribeToken, ruleDescription: descriptionOf(rule) });
  return { message: "Check your email to confirm this alert." };
}
export async function confirmColwickAlertSubscription(token, { now = new Date() } = {}) {
  if (!token) throw new HttpError(400, "Missing token parameter"); const { db } = await connectToDatabase(); const collection = db.collection(ALERT_SUBSCRIPTIONS_COLLECTION); const rule = await collection.findOne({ confirmationTokenHash: hashToken(token), status: "pending_confirmation" });
  if (!rule || (rule.confirmationExpiresAt && new Date(rule.confirmationExpiresAt) <= now)) throw new HttpError(404, "Alert confirmation token is invalid or expired");
  await collection.updateOne({ alertKey: rule.alertKey }, { $set: { status: "active", confirmedAt: timestamp(now), updatedAt: timestamp(now) }, $unset: { confirmationTokenHash: "", confirmationExpiresAt: "" } }); return { message: "Colwick alert confirmed." };
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
function gaugeCondition(rule, trent, forecast) { const definition = stationFor(rule.gaugeKey); const stationId = rule.stationId ?? definition?.stationId; const measureType = rule.measureType ?? definition?.measureType ?? "level"; if (rule.source === "forecast") { const row = forecast?.forecast_data?.find((item) => rule.direction === "below" ? Number(item.forecast_reading) <= rule.threshold : Number(item.forecast_reading) >= rule.threshold); return row ? { met: true, value: Number(row.forecast_reading), at: row.forecast_date, forecastRunAt: forecast?.metadata?.forecast_time || null } : { met: false }; } const measure = trent?.stations?.find((station) => station.stationId === stationId)?.measures?.[measureType]; const value = measure?.latestValue; if (!Number.isFinite(value)) return null; const margin = measureType === "flow" ? 1 : 0.03; const met = rule.direction === "below" ? value <= rule.threshold : value >= rule.threshold; return { met, clear: rule.direction === "below" ? value >= rule.threshold + margin : value <= rule.threshold - margin, value, at: measure.readings?.[0]?.dateTime || null }; }
function risk(rows) { const values = rows.slice(-3).map((item) => Number(item.numberCSOsPerKm2)).filter(Number.isFinite); if (!values.length) return null; const mean = values.reduce((sum, value) => sum + value, 0) / values.length; return mean >= 0.025 ? "red" : mean >= 0.010 ? "amber" : "green"; }
function condition(rule, sources) { const type = typeOf(rule); if (type === "gauge") return rule.source === "forecast" ? usable(sources.forecast) ? gaugeCondition(rule, null, sources.forecast.value) : null : usable(sources.trent) ? gaugeCondition(rule, sources.trent.value, null) : null; if (type === "hpp_status") { const value = sources.hpp.value?.data?.currentStatus; return usable(sources.hpp) && typeof value === "boolean" ? { met: rule.desiredStatus === (value ? "open" : "closed"), clear: rule.desiredStatus !== (value ? "open" : "closed"), value: value ? "open" : "closed", at: sources.hpp.value.data.health.generatedAt } : null; } const value = usable(sources.water) && sources.cso.status === "fulfilled" ? risk(sources.cso.value) : null; if (!value) return null; const rank = { green: 0, amber: 1, red: 2 }; return { met: rank[value] >= rank[rule.riskLevel], clear: rank[value] < rank[rule.riskLevel], value, at: sources.water.value.ScrapeTimestamp }; }
async function sendOnce(db, rule, state, now) { const transitionId = `${rule.alertKey}:${state.at || timestamp(now)}:${state.value}`; const deliveries = db.collection(ALERT_DELIVERIES_COLLECTION); const defaultKey = createHash("sha256").update(transitionId).digest("hex"); const existing = typeof deliveries.findOne === "function" ? await deliveries.findOne({ alertKey: rule.alertKey, transitionId }) : null; if (existing?.state === "sent" || existing?.state === "claimed") return false; const key = existing?.idempotencyKey || defaultKey; if (existing) await deliveries.updateOne({ alertKey: rule.alertKey, transitionId }, { $set: { state: "claimed", updatedAt: timestamp(now) } }); else { const result = await deliveries.updateOne({ alertKey: rule.alertKey, transitionId }, { $setOnInsert: { alertKey: rule.alertKey, transitionId, idempotencyKey: key, state: "claimed", createdAt: timestamp(now), updatedAt: timestamp(now) } }, { upsert: true }); if (result?.upsertedCount === 0) return false; } try { await sendThresholdAlertEmail({ email: rule.email, gaugeName: nameOf(rule), source: rule.source || "status", direction: rule.direction, threshold: rule.threshold, observedValue: typeof state.value === "number" ? state.value : null, observedAt: state.at, forecastRunAt: state.forecastRunAt, unsubscribeToken: rule.unsubscribeToken, ruleDescription: descriptionOf(rule), idempotencyKey: key }); await deliveries.updateOne({ alertKey: rule.alertKey, transitionId }, { $set: { state: "sent", sentAt: timestamp(now), updatedAt: timestamp(now) } }); return true; } catch (error) { await deliveries.updateOne({ alertKey: rule.alertKey, transitionId }, { $set: { state: "failed", updatedAt: timestamp(now) } }); throw error; } }
export async function runColwickAlerts({ now = new Date() } = {}) {
  const started = Date.now(); const { db } = await connectToDatabase(); const deliveries = db.collection(ALERT_DELIVERIES_COLLECTION); if (typeof deliveries.createIndex === "function") await deliveries.createIndex({ alertKey: 1, transitionId: 1 }, { unique: true }); const rules = await db.collection(ALERT_SUBSCRIPTIONS_COLLECTION).find({ status: "active" }).toArray();
  const [trent, forecast, hpp, water, cso] = await Promise.allSettled([getTrentWeirsSnapshot(), getLatestForecastSnapshot(), getHppStatusSnapshot(), getLatestWaterQualitySnapshot(), getWaterQualityDensitySeries(3)]); const sources = { trent, forecast, hpp, water, cso }; const collection = db.collection(ALERT_SUBSCRIPTIONS_COLLECTION); let sent = 0, rearmed = 0, skipped = 0, suppressed = 0;
  for (const rule of rules) { const next = condition(rule, sources); if (!next) { skipped += 1; await collection.updateOne({ alertKey: rule.alertKey }, { $set: { lastEvaluatedAt: timestamp(now), updatedAt: timestamp(now) } }); continue; } if (rule.lastConditionState === "triggered" && next.clear) { rearmed += 1; await collection.updateOne({ alertKey: rule.alertKey }, { $set: { lastConditionState: "armed", lastEvaluatedAt: timestamp(now), updatedAt: timestamp(now) } }); continue; } if (next.met && rule.lastConditionState !== "triggered") { try { if (await sendOnce(db, rule, next, now)) sent += 1; else suppressed += 1; await collection.updateOne({ alertKey: rule.alertKey }, { $set: { lastConditionState: "triggered", lastTriggeredAt: timestamp(now), lastEvaluatedAt: timestamp(now), updatedAt: timestamp(now) } }); } catch { skipped += 1; } continue; } await collection.updateOne({ alertKey: rule.alertKey }, { $set: { lastEvaluatedAt: timestamp(now), updatedAt: timestamp(now) } }); }
  const sourceFailures = Object.entries(sources).filter(([, result]) => !usable(result)).map(([name]) => name); const result = { scanned: rules.length, sent, rearmed, skipped, suppressed, sourceFailures, durationMs: Date.now() - started }; const runs = db.collection(ALERT_RUNS_COLLECTION); if (typeof runs.insertOne === "function") await runs.insertOne({ ...result, startedAt: timestamp(now), completedAt: new Date().toISOString(), status: sourceFailures.length ? "degraded" : "success" }); return result;
}
