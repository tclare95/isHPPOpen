import { HttpError } from "../api/http";

const RESEND_API_URL = "https://api.resend.com/emails";

function getAlertsBaseUrl() {
  const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  return (baseUrl || "http://localhost:3000").replace(/\/$/, "");
}

function getRequiredMailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_FROM_EMAIL;
  const replyTo = process.env.ALERTS_REPLY_TO_EMAIL;

  if (!apiKey) {
    throw new HttpError(500, "Alert email provider is not configured");
  }

  if (!from) {
    throw new HttpError(500, "Alert sender email is not configured");
  }

  return { apiKey, from, replyTo };
}

async function sendEmail({ to, subject, text }) {
  const { apiKey, from, replyTo } = getRequiredMailConfig();
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    let message = "Failed to send alert email";

    try {
      const payload = await response.json();
      message = payload?.message || payload?.error?.message || message;
    } catch {
      message = "Failed to send alert email";
    }

    throw new HttpError(502, message);
  }
}

function formatDirection(direction) {
  return direction === "below" ? "drops to or below" : "rises to or above";
}

function formatSource(source) {
  return source === "forecast" ? "forecast" : "live level";
}

export function buildConfirmationUrl(token) {
  return `${getAlertsBaseUrl()}/api/alerts/confirm?token=${encodeURIComponent(token)}`;
}

export function buildUnsubscribeUrl(token) {
  return `${getAlertsBaseUrl()}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function buildDashboardAlertStatusUrl(status, message) {
  const url = new URL("/trentweirs", `${getAlertsBaseUrl()}/`);
  url.searchParams.set("alertStatus", status);

  if (message) {
    url.searchParams.set("alertMessage", message);
  }

  return url.toString();
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
}) {
  const confirmationUrl = buildConfirmationUrl(confirmationToken);
  const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);

  await sendEmail({
    to: email,
    subject: `Confirm your ${gaugeName} alert`,
    text: [
      `Please confirm your ${gaugeName} ${formatSource(source)} alert.`,
      "",
      `We will email you when ${gaugeName} ${formatDirection(direction)} ${threshold.toFixed(2)} m.`,
      "",
      `Confirm alert: ${confirmationUrl}`,
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join("\n"),
  });
}

export async function sendManageAlertsAccessEmail({ email, manageToken }) {
  const manageUrl = buildManageAlertsUrl(manageToken);

  await sendEmail({
    to: email,
    subject: "Manage your Colwick alerts",
    text: [
      "Use the link below to view and manage your Colwick alerts.",
      "",
      `Manage alerts: ${manageUrl}`,
      "",
      "For security, this link expires after 24 hours.",
    ].join("\n"),
  });
}

export async function sendThresholdAlertEmail({
  email,
  gaugeName,
  source,
  direction,
  threshold,
  observedValue,
  observedAt,
  forecastRunAt,
  unsubscribeToken,
}) {
  const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);
  const sourceLabel = formatSource(source);
  const formattedObservedValue = typeof observedValue === "number"
    ? `${observedValue.toFixed(2)} m`
    : "Unavailable";
  const triggerLine = source === "forecast"
    ? `Forecast threshold crossed at: ${observedAt || "Unknown time"}`
    : `Observed at: ${observedAt || "Unknown time"}`;

  await sendEmail({
    to: email,
    subject: `${gaugeName} alert: ${direction === "below" ? "below" : "above"} ${threshold.toFixed(2)} m`,
    text: [
      `${gaugeName} ${sourceLabel} has triggered your alert.`,
      "",
      `Rule: alert when ${gaugeName} ${formatDirection(direction)} ${threshold.toFixed(2)} m`,
      `Value: ${formattedObservedValue}`,
      triggerLine,
      ...(forecastRunAt ? [`Forecast generated at: ${forecastRunAt}`] : []),
      "",
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join("\n"),
  });
}