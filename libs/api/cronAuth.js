import { HttpError } from "./http";

function getHeaderValue(headers, name) {
  if (!headers) {
    return null;
  }

  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const matchingKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return matchingKey ? headers[matchingKey] : null;
}

/** Vercel cron requests carry `Authorization: Bearer ${CRON_SECRET}`. */
export function assertCronAuthorized(request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    throw new HttpError(500, "Cron secret not configured");
  }

  const authorization = getHeaderValue(request?.headers, "authorization");

  if (authorization !== `Bearer ${configuredSecret}`) {
    throw new HttpError(401, "Unauthorized");
  }
}
