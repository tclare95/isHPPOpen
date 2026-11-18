import { HttpError } from "../api/http";

const RESEND_API_URL = "https://api.resend.com/emails";
export const ALERT_EMAIL_TIMEOUT_MS = 10 * 1000;

/**
 * Email failure carrying whether the provider could have accepted the message.
 * - "rejected": the provider definitely did not accept it (configuration error or a 4xx response).
 * - "uncertain": the provider may have accepted it (timeout, network failure, 5xx or idempotency conflict).
 */
export class AlertEmailError extends HttpError {
  constructor(statusCode, message, outcome, reason) {
    super(statusCode, message);
    this.name = "AlertEmailError";
    this.deliveryOutcome = outcome;
    this.reason = reason;
  }
}

function getAlertsBaseUrl() {
  const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  return (baseUrl || "http://localhost:3000").replace(/\/$/, "");
}

function getRequiredMailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_FROM_EMAIL;
  const replyTo = process.env.ALERTS_REPLY_TO_EMAIL;

  if (!apiKey) {
    throw new AlertEmailError(500, "Alert email provider is not configured", "rejected", "config");
  }

  if (!from) {
    throw new AlertEmailError(500, "Alert sender email is not configured", "rejected", "config");
  }

  return { apiKey, from, replyTo };
}

async function sendEmail({ to, subject, text, idempotencyKey }) {
  const { apiKey, from, replyTo } = getRequiredMailConfig();
  let response;

  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(ALERT_EMAIL_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new AlertEmailError(502, "Alert email provider did not respond", "uncertain", timedOut ? "timeout" : "network");
  }

  if (!response.ok) {
    let message = "Failed to send alert email";

    try {
      const payload = await response.json();
      message = payload?.message || payload?.error?.message || message;
    } catch {
      message = "Failed to send alert email";
    }

    // 409 is an idempotency conflict (in progress or reused key): the original request may have succeeded.
    const outcome = response.status === 409 || response.status >= 500 ? "uncertain" : "rejected";
    throw new AlertEmailError(502, message, outcome, `http_${response.status}`);
  }
}

function formatDirection(direction) {
  return direction === "below" ? "drops to or below" : "rises to or above";
}

function formatSource(source) {
  return source === "forecast" ? "forecast" : "live level";
}

/** Shown in every alert-related email: alerts inform, they do not authorise. */
export const ALERT_SAFETY_NOTE = "Alerts are for information only. They are not a guarantee of river access or water safety, "
  + "and delayed or unavailable source data can delay or prevent an alert. Always check conditions yourself.";

export function buildConfirmationUrl(token) {
  return `${getAlertsBaseUrl()}/api/alerts/confirm?token=${encodeURIComponent(token)}`;
}

export function buildUnsubscribeUrl(token) {
  return `${getAlertsBaseUrl()}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Alert result codes shown on the Alerts Centre with fixed copy (never free text from the URL). */
export const ALERT_RESULTS = Object.freeze(["confirmed", "already_active", "confirm_invalid", "confirm_error", "unsubscribed", "unsubscribe_invalid", "unsubscribe_error"]);

export function buildAlertsResultUrl(result) {
  const url = new URL("/alerts", `${getAlertsBaseUrl()}/`);
  url.searchParams.set("result", ALERT_RESULTS.includes(result) ? result : "confirm_error");
  return url.toString();
}

/** The Alerts Centre, where anyone can request a management link for their own address. */
export function buildAlertsCentreUrl() {
  return `${getAlertsBaseUrl()}/alerts`;
}

export function buildManageAlertsUrl(token) {
  return `${getAlertsBaseUrl()}/alerts?token=${encodeURIComponent(token)}`;
}

export async function sendAlertConfirmationEmail({
  email,
  gaugeName,
  source,
  direction,
  threshold,
  confirmationToken,
  unsubscribeToken,
  ruleDescription,
}) {
  const confirmationUrl = buildConfirmationUrl(confirmationToken);
  const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);

  await sendEmail({
    to: email,
    subject: `Confirm your ${gaugeName} alert`,
    text: [
      "Please confirm your email alert. It is not active until you do.",
      "",
      ruleDescription || `We will email you when ${gaugeName} ${formatDirection(direction)} ${threshold.toFixed(2)} m.`,
      "",
      `Confirm alert (link expires in 24 hours): ${confirmationUrl}`,
      "",
      "If you did not request this, ignore this email and no alert will be set up.",
      "",
      ALERT_SAFETY_NOTE,
      "",
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join("\n"),
  });
}

export async function sendManageAlertsAccessEmail({ email, manageToken }) {
  const manageUrl = buildManageAlertsUrl(manageToken);

  await sendEmail({
    to: email,
    subject: "Manage your river alerts",
    text: [
      "Use the link below to review or stop the email alerts for this address.",
      "",
      `Manage alerts: ${manageUrl}`,
      "",
      "For security, this link expires after 30 minutes. If you did not request it, you can ignore this email.",
    ].join("\n"),
  });
}

function formatObserved({ alertType, unit, observedValue, observedLabel }) {
  if (typeof observedValue === "number") return `${observedValue.toFixed(2)} ${unit || "m"}`;
  if (observedLabel) return alertType === "water_quality" ? `${observedLabel} risk` : `HPP reported ${observedLabel}`;
  return "Unavailable";
}

export async function sendThresholdAlertEmail({
  email,
  alertType,
  gaugeName,
  source,
  unit,
  direction,
  threshold,
  observedValue,
  observedLabel,
  observedAt,
  forecastRunAt,
  unsubscribeToken,
  ruleDescription,
  idempotencyKey,
}) {
  const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);
  const isGauge = threshold !== undefined && threshold !== null;
  const unitLabel = unit || "m";
  const headline = isGauge ? `${gaugeName} ${formatSource(source)} has met your alert rule.` : `Your ${gaugeName} alert has been triggered.`;
  const timeLine = source === "forecast"
    ? `Forecast threshold crossed at: ${observedAt || "Unknown time"}`
    : `${isGauge ? "Observed at" : "Checked at"}: ${observedAt || "Unknown time"}`;

  await sendEmail({
    to: email,
    subject: isGauge ? `${gaugeName} alert: ${direction === "below" ? "below" : "above"} ${Number(threshold).toFixed(2)} ${unitLabel}` : `${gaugeName} alert`,
    text: [
      headline,
      "",
      ruleDescription || `Rule: alert when ${gaugeName} ${formatDirection(direction)} ${Number(threshold).toFixed(2)} ${unitLabel}`,
      `${isGauge ? "Value" : "Status"}: ${formatObserved({ alertType, unit, observedValue, observedLabel })}`,
      timeLine,
      ...(forecastRunAt ? [`Forecast generated at: ${forecastRunAt}`] : []),
      "",
      "You will not get another email for this rule until the condition clears and is met again.",
      "",
      ALERT_SAFETY_NOTE,
      "",
      `Review your alerts: ${buildAlertsCentreUrl()}`,
      `Unsubscribe from this alert: ${unsubscribeUrl}`,
    ].join("\n"),
    idempotencyKey,
  });
}
