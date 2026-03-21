import { createHash, randomBytes } from "node:crypto";
import * as yup from "yup";
import { HttpError } from "../api/http";
import { connectToDatabase } from "../database";
import { getLatestForecastSnapshot } from "./forecastService";
import { getTrentWeirsSnapshot } from "./trentWeirsService";
import {
  sendAlertConfirmationEmail,
  sendManageAlertsAccessEmail,
  sendThresholdAlertEmail,
} from "./alertMailerService";

export const ALERT_SUBSCRIPTIONS_COLLECTION = "alertSubscriptions";
export const ALERT_MANAGE_SESSIONS_COLLECTION = "alertManageSessions";
export const COLWICK_ALERT_GAUGE_KEY = "4009-level";
export const ALERT_HYSTERESIS_METERS = 0.03;
export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const ALERT_MANAGE_SESSION_MS = 30 * 60 * 1000;

const subscriptionSchema = yup.object({
  email: yup.string().email().required(),
  gaugeKey: yup.string().oneOf([COLWICK_ALERT_GAUGE_KEY]).required(),
  source: yup.string().oneOf(["live", "forecast"]).required(),
  direction: yup.string().oneOf(["above", "below"]).required(),
  threshold: yup.number().min(0).max(10).required(),
});

const emailSchema = yup.string().email().required();

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeThreshold(threshold) {
  return Number(Number(threshold).toFixed(3));
}

function normalizeAlertPayload(parsed) {
  return {
    email: normalizeEmail(parsed.email),
    gaugeKey: parsed.gaugeKey,
    source: parsed.source,
    direction: parsed.direction,
    threshold: normalizeThreshold(parsed.threshold),
  };
}

function buildAlertKey({ email, gaugeKey, source, direction, threshold }) {
  return [email, gaugeKey, source, direction, threshold.toFixed(3)].join("|");
}

function createToken() {
  return randomBytes(24).toString("hex");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function getSubscriptionsCollection(db) {
  return db.collection(ALERT_SUBSCRIPTIONS_COLLECTION);
}

function getManageSessionsCollection(db) {
  return db.collection(ALERT_MANAGE_SESSIONS_COLLECTION);
}

function buildManageSession(token, email, now) {
  return {
    tokenHash: hashToken(token),
    email,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ALERT_MANAGE_SESSION_MS).toISOString(),
  };
}

function isManageSessionExpired(session, now = new Date()) {
  const expiryTime = new Date(session.expiresAt).getTime();

  return Number.isNaN(expiryTime) || expiryTime <= now.getTime();
}

async function getValidManageSessionContext(token, { now = new Date() } = {}) {
  if (!token) {
    throw new HttpError(400, "Missing token parameter");
  }

  const { db } = await connectToDatabase();
  const sessionCollection = getManageSessionsCollection(db);
  const tokenHash = hashToken(token);
  const session = await sessionCollection.findOne({ tokenHash });

  if (!session) {
    throw new HttpError(404, "Alert management link is invalid or expired");
  }

  if (isManageSessionExpired(session, now)) {
    throw new HttpError(404, "Alert management link is invalid or expired");
  }

  return {
    db,
    sessionCollection,
    session,
  };
}

async function rotateManageSessionToken(sessionCollection, session, now = new Date()) {
  const nextToken = createToken();
  const nextSession = buildManageSession(nextToken, session.email, now);

  await sessionCollection.updateOne(
    { email: session.email },
    {
      $set: nextSession,
    }
  );

  return nextToken;
}

function toManagedAlert(subscription) {
  return {
    alertKey: subscription.alertKey,
    gaugeName: subscription.gaugeName,
    source: subscription.source,
    direction: subscription.direction,
    threshold: subscription.threshold,
    status: subscription.status,
    createdAt: subscription.createdAt || null,
    updatedAt: subscription.updatedAt || null,
    confirmedAt: subscription.confirmedAt || null,
    lastTriggeredAt: subscription.lastTriggeredAt || null,
  };
}

function getColwickLiveSnapshot(trentSnapshot) {
  if (!trentSnapshot || trentSnapshot.fallback || trentSnapshot.partial) {
    return null;
  }

  const station = trentSnapshot.stations?.find((item) => item.stationId === 4009);
  const measure = station?.measures?.level;
  const latestReading = measure?.readings?.[0];

  if (!measure || typeof measure.latestValue !== "number") {
    return null;
  }

  return {
    value: measure.latestValue,
    observedAt: latestReading?.dateTime || null,
  };
}

function getForecastCrossing(forecastSnapshot, threshold, direction) {
  const rows = Array.isArray(forecastSnapshot?.forecast_data) ? forecastSnapshot.forecast_data : [];

  return rows.find((row) => {
    const value = Number(row?.forecast_reading);

    if (!Number.isFinite(value)) {
      return false;
    }

    return direction === "below" ? value <= threshold : value >= threshold;
  }) || null;
}

function isForecastClear(forecastSnapshot, threshold, direction) {
  const rows = Array.isArray(forecastSnapshot?.forecast_data) ? forecastSnapshot.forecast_data : [];

  if (rows.length === 0) {
    return false;
  }

  return rows.every((row) => {
    const value = Number(row?.forecast_reading);

    if (!Number.isFinite(value)) {
      return false;
    }

    return direction === "below"
      ? value >= threshold + ALERT_HYSTERESIS_METERS
      : value <= threshold - ALERT_HYSTERESIS_METERS;
  });
}

function buildConditionState(subscription, liveSnapshot, forecastSnapshot) {
  if (subscription.source === "live") {
    if (!liveSnapshot) {
      return { dataAvailable: false };
    }

    const conditionMet = subscription.direction === "below"
      ? liveSnapshot.value <= subscription.threshold
      : liveSnapshot.value >= subscription.threshold;

    const clear = subscription.direction === "below"
      ? liveSnapshot.value >= subscription.threshold + ALERT_HYSTERESIS_METERS
      : liveSnapshot.value <= subscription.threshold - ALERT_HYSTERESIS_METERS;

    return {
      dataAvailable: true,
      conditionMet,
      clear,
      observedValue: liveSnapshot.value,
      observedAt: liveSnapshot.observedAt,
      forecastRunAt: null,
    };
  }

  if (!forecastSnapshot) {
    return { dataAvailable: false };
  }

  const crossing = getForecastCrossing(forecastSnapshot, subscription.threshold, subscription.direction);

  return {
    dataAvailable: true,
    conditionMet: Boolean(crossing),
    clear: isForecastClear(forecastSnapshot, subscription.threshold, subscription.direction),
    observedValue: crossing?.forecast_reading ?? null,
    observedAt: crossing?.forecast_date ?? null,
    forecastRunAt: forecastSnapshot.metadata?.forecast_time ?? null,
  };
}

function isCooldownActive(subscription, now) {
  if (!subscription.lastTriggeredAt) {
    return false;
  }

  const lastTriggeredTime = new Date(subscription.lastTriggeredAt).getTime();

  if (Number.isNaN(lastTriggeredTime)) {
    return false;
  }

  return now.getTime() - lastTriggeredTime < ALERT_COOLDOWN_MS;
}

async function updateAlertState(collection, alertKey, update) {
  await collection.updateOne({ alertKey }, update);
}

export async function createColwickAlertSubscription(payload, { now = new Date() } = {}) {
  const parsed = await subscriptionSchema.validate(payload, { stripUnknown: true });
  const normalized = normalizeAlertPayload(parsed);
  const confirmationToken = createToken();
  const unsubscribeToken = createToken();
  const alertKey = buildAlertKey(normalized);
  const nowIso = now.toISOString();
  const { db } = await connectToDatabase();
  const collection = getSubscriptionsCollection(db);

  await collection.updateOne(
    { alertKey },
    {
      $set: {
        ...normalized,
        alertKey,
        gaugeName: "Colwick",
        stationId: 4009,
        measureType: "level",
        status: "pending_confirmation",
        confirmationTokenHash: hashToken(confirmationToken),
        unsubscribeToken,
        updatedAt: nowIso,
        confirmedAt: null,
        unsubscribedAt: null,
        lastConditionState: "armed",
        lastTriggeredAt: null,
        lastEvaluatedAt: null,
        lastObservedValue: null,
        lastObservedAt: null,
        lastForecastRunAt: null,
      },
      $setOnInsert: {
        createdAt: nowIso,
      },
    },
    { upsert: true }
  );

  await sendAlertConfirmationEmail({
    email: normalized.email,
    gaugeName: "Colwick",
    source: normalized.source,
    direction: normalized.direction,
    threshold: normalized.threshold,
    confirmationToken,
    unsubscribeToken,
  });

  return {
    message: "Check your email to confirm this Colwick alert.",
  };
}

export async function confirmColwickAlertSubscription(token, { now = new Date() } = {}) {
  if (!token) {
    throw new HttpError(400, "Missing token parameter");
  }

  const { db } = await connectToDatabase();
  const collection = getSubscriptionsCollection(db);
  const tokenHash = hashToken(token);
  const subscription = await collection.findOne({
    confirmationTokenHash: tokenHash,
    status: "pending_confirmation",
  });

  if (!subscription) {
    throw new HttpError(404, "Alert confirmation token is invalid or expired");
  }

  await updateAlertState(collection, subscription.alertKey, {
    $set: {
      status: "active",
      confirmedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    $unset: {
      confirmationTokenHash: "",
    },
  });

  return {
    message: "Colwick alert confirmed.",
  };
}

export async function unsubscribeColwickAlertSubscription(token, { now = new Date() } = {}) {
  if (!token) {
    throw new HttpError(400, "Missing token parameter");
  }

  const { db } = await connectToDatabase();
  const collection = getSubscriptionsCollection(db);
  const subscription = await collection.findOne({ unsubscribeToken: token });

  if (!subscription) {
    throw new HttpError(404, "Alert unsubscribe token is invalid or expired");
  }

  await updateAlertState(collection, subscription.alertKey, {
    $set: {
      status: "unsubscribed",
      unsubscribedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });

  return {
    message: "Colwick alert unsubscribed.",
  };
}

export async function requestColwickAlertManagementLink(email, { now = new Date() } = {}) {
  const normalizedEmail = normalizeEmail(await emailSchema.validate(email));
  const manageToken = createToken();
  const manageSession = buildManageSession(manageToken, normalizedEmail, now);
  const { db } = await connectToDatabase();
  const collection = getManageSessionsCollection(db);

  await collection.updateOne(
    { email: normalizedEmail },
    {
      $set: manageSession,
    },
    { upsert: true }
  );

  await sendManageAlertsAccessEmail({
    email: normalizedEmail,
    manageToken,
  });

  return {
    message: "Check your email for a link to manage your Colwick alerts.",
  };
}

export async function listColwickAlertsForManagement(token, { now = new Date() } = {}) {
  const { db, session, sessionCollection } = await getValidManageSessionContext(token, { now });
  const collection = getSubscriptionsCollection(db);
  const subscriptions = await collection.find({
    email: session.email,
    gaugeKey: COLWICK_ALERT_GAUGE_KEY,
    status: { $ne: "unsubscribed" },
  }).toArray();
  const manageToken = await rotateManageSessionToken(sessionCollection, session, now);

  return {
    email: session.email,
    alerts: subscriptions.map(toManagedAlert),
    manageToken,
  };
}

export async function deleteManagedColwickAlert({ token, alertKey }, { now = new Date() } = {}) {
  if (!alertKey) {
    throw new HttpError(400, "Missing alertKey");
  }

  const { db, session } = await getValidManageSessionContext(token, { now });
  const collection = getSubscriptionsCollection(db);
  const result = await collection.updateOne(
    {
      email: session.email,
      alertKey,
      gaugeKey: COLWICK_ALERT_GAUGE_KEY,
      status: { $ne: "unsubscribed" },
    },
    {
      $set: {
        status: "unsubscribed",
        unsubscribedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    }
  );

  if (!result?.matchedCount) {
    throw new HttpError(404, "Alert not found");
  }

  return {
    message: "Alert removed.",
  };
}

export async function runColwickAlerts({ now = new Date() } = {}) {
  const { db } = await connectToDatabase();
  const collection = getSubscriptionsCollection(db);
  const subscriptions = await collection.find({
    gaugeKey: COLWICK_ALERT_GAUGE_KEY,
    status: "active",
  }).toArray();

  if (subscriptions.length === 0) {
    return {
      scanned: 0,
      sent: 0,
      rearmed: 0,
      skipped: 0,
      suppressed: 0,
    };
  }

  const [trentResult, forecastResult] = await Promise.allSettled([
    getTrentWeirsSnapshot(),
    getLatestForecastSnapshot(),
  ]);

  const liveSnapshot = trentResult.status === "fulfilled"
    ? getColwickLiveSnapshot(trentResult.value)
    : null;

  const forecastSnapshot = forecastResult.status === "fulfilled"
    ? forecastResult.value
    : null;

  let sent = 0;
  let rearmed = 0;
  let skipped = 0;
  let suppressed = 0;

  for (const subscription of subscriptions) {
    const conditionState = buildConditionState(subscription, liveSnapshot, forecastSnapshot);
    const nowIso = now.toISOString();

    if (!conditionState.dataAvailable) {
      skipped += 1;
      await updateAlertState(collection, subscription.alertKey, {
        $set: {
          updatedAt: nowIso,
          lastEvaluatedAt: nowIso,
        },
      });
      continue;
    }

    if (conditionState.conditionMet && subscription.lastConditionState !== "triggered") {
      const cooldownActive = isCooldownActive(subscription, now);

      await updateAlertState(collection, subscription.alertKey, {
        $set: {
          updatedAt: nowIso,
          lastEvaluatedAt: nowIso,
          lastConditionState: "triggered",
          lastObservedValue: conditionState.observedValue,
          lastObservedAt: conditionState.observedAt,
          lastForecastRunAt: conditionState.forecastRunAt,
        },
      });

      if (cooldownActive) {
        suppressed += 1;
        continue;
      }

      await sendThresholdAlertEmail({
        email: subscription.email,
        gaugeName: "Colwick",
        source: subscription.source,
        direction: subscription.direction,
        threshold: subscription.threshold,
        observedValue: conditionState.observedValue,
        observedAt: conditionState.observedAt,
        forecastRunAt: conditionState.forecastRunAt,
        unsubscribeToken: subscription.unsubscribeToken,
      });

      sent += 1;

      await updateAlertState(collection, subscription.alertKey, {
        $set: {
          updatedAt: nowIso,
          lastEvaluatedAt: nowIso,
          lastTriggeredAt: nowIso,
          lastObservedValue: conditionState.observedValue,
          lastObservedAt: conditionState.observedAt,
          lastForecastRunAt: conditionState.forecastRunAt,
        },
      });

      continue;
    }

    if (subscription.lastConditionState === "triggered" && conditionState.clear) {
      rearmed += 1;
      await updateAlertState(collection, subscription.alertKey, {
        $set: {
          updatedAt: nowIso,
          lastEvaluatedAt: nowIso,
          lastConditionState: "armed",
          lastObservedValue: conditionState.observedValue,
          lastObservedAt: conditionState.observedAt,
          lastForecastRunAt: conditionState.forecastRunAt,
        },
      });
      continue;
    }

    await updateAlertState(collection, subscription.alertKey, {
      $set: {
        updatedAt: nowIso,
        lastEvaluatedAt: nowIso,
        lastObservedValue: conditionState.observedValue,
        lastObservedAt: conditionState.observedAt,
        lastForecastRunAt: conditionState.forecastRunAt,
      },
    });
  }

  return {
    scanned: subscriptions.length,
    sent,
    rearmed,
    skipped,
    suppressed,
  };
}