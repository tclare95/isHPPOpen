// Client helpers for admin editor requests: one place to turn auth failures into useful copy.

export function describeAdminFailure(status, serverMessage, fallback) {
  if (status === 401) return "Your admin session has ended. Sign in again, then retry.";
  if (status === 403) return "This account is not authorised to manage site content.";
  return serverMessage || fallback;
}

/** Sends an admin JSON request; resolves the `data` envelope or throws an Error carrying `status`. */
export async function adminRequest(url, { method = "GET", body, fallback = "The request failed. Please try again." } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error("Couldn’t reach the server. Check your connection and try again."), { status: 0 });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const message = describeAdminFailure(response.status, payload?.error?.message || payload?.message, fallback);
    throw Object.assign(new Error(message), { status: response.status });
  }
  return payload?.data ?? null;
}

/** SWR fetcher for admin reads that keeps the auth-specific explanation. */
export const adminFetcher = (url) => adminRequest(url, { fallback: "Unable to load events right now." });
