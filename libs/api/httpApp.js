import { NextResponse } from "next/server";
import { HttpError } from "./http";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/authOptions";
import { ADMIN_ACCESS, getAdminAccess } from "../auth/adminAccess";

export function sendRouteSuccess(data, status = 200, headers = undefined) {
  return NextResponse.json({ ok: true, data }, { status, headers });
}

export function sendRouteError(status, message, details = undefined, headers = undefined) {
  const payload = {
    ok: false,
    error: {
      message,
      ...(details && typeof details === "object" ? { details } : {}),
    },
  };

  return NextResponse.json(payload, { status, headers });
}

export function methodNotAllowed(allowedMethods) {
  return sendRouteError(405, "Method Not Allowed", undefined, {
    Allow: allowedMethods.join(", "),
  });
}

export async function parseJsonObjectBody(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Invalid request body");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Invalid request body");
  }

  return body;
}

export async function requireRouteSession() {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }

  return session;
}

/**
 * Requires an authenticated administrator: `401` without a session, `403` for an authenticated
 * identity outside ADMIN_AUTH0_SUBS (including when the allowlist is unset, which fails closed).
 * Use this, not requireRouteSession(), for every admin page API and privileged mutation.
 */
export async function requireRouteAdmin() {
  const session = await requireRouteSession();
  const access = getAdminAccess(session.user?.id);

  if (access === ADMIN_ACCESS.UNCONFIGURED) {
    throw new HttpError(403, "Admin access is not configured");
  }

  if (access !== ADMIN_ACCESS.GRANTED) {
    throw new HttpError(403, "Forbidden");
  }

  return session;
}
