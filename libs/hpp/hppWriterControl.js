// Single-writer control for openIndicator (#89).
//
// Pure functions only: no I/O or clock. One Mongo document,
// `hppWriterControl/openIndicator`, names the writer that owns openIndicator.
// The legacy scraper and the app both read it, and each writes only while it
// is the owner. Moving ownership is an operator handover (scripts/hpp-writer.mjs),
// never a side effect of a deploy or an environment variable.
//
// Fencing. A handover cannot interrupt a run that has already read the
// control, so the new owner waits out the old owner's longest run:
// - to app: the app writes only after the scraper has acknowledged the new
//   epoch from a run that *started* after the switch, wrote nothing, and
//   at least LEGACY_FENCE_MS has passed (scraper Lambda timeout is 120 s).
// - to legacy: the scraper resumes only APP_FENCE_MS after the switch (app
//   route maxDuration is 60 s; its lease is 5 minutes).
//
// Absent control means legacy owns openIndicator, exactly as before #89.

export const WRITER_CONTROL_COLLECTION = "hppWriterControl";
export const WRITER_CONTROL_ID = "openIndicator";
export const OWNERS = Object.freeze({ LEGACY: "legacy", APP: "app" });

const MINUTE_MS = 60 * 1000;
export const LEGACY_FENCE_MS = 5 * MINUTE_MS;
export const APP_FENCE_MS = 5 * MINUTE_MS;

export const WRITER_HOLD_REASONS = Object.freeze({
  NOT_OWNER: "writer_not_owner",
  AWAITING_LEGACY_STOP: "writer_awaiting_legacy_stop",
  LEGACY_STILL_WRITING: "writer_legacy_still_writing",
  FENCE: "writer_fence",
  EPOCH_MISMATCH: "writer_epoch_mismatch",
  FOREIGN_WRITE: "writer_foreign_write",
});

const time = (value) => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const ownerOf = (control) => control?.owner ?? OWNERS.LEGACY;

/**
 * May the app write openIndicator now? Returns `{ allowed, reason? }`.
 * `reason` is a WRITER_HOLD_REASONS value, recorded as the run's hold reason.
 */
export function appWriterStatus(control, now) {
  if (ownerOf(control) !== OWNERS.APP) return { allowed: false, reason: WRITER_HOLD_REASONS.NOT_OWNER };
  const switchedAt = time(control.switchedAt);
  const ack = control.legacyAck;
  if (switchedAt === null || !Number.isInteger(control.epoch)) return { allowed: false, reason: WRITER_HOLD_REASONS.NOT_OWNER };
  if (!ack || ack.epoch !== control.epoch || !(time(ack.runStartedAt) >= switchedAt)) {
    return { allowed: false, reason: WRITER_HOLD_REASONS.AWAITING_LEGACY_STOP };
  }
  if (ack.observedOwner !== OWNERS.APP || ack.wrote !== false) {
    return { allowed: false, reason: WRITER_HOLD_REASONS.LEGACY_STILL_WRITING };
  }
  if (now.getTime() < switchedAt + LEGACY_FENCE_MS) return { allowed: false, reason: WRITER_HOLD_REASONS.FENCE };
  return { allowed: true };
}

/**
 * May the legacy scraper write openIndicator now? The scraper repository
 * implements the same rule; this copy drives the fixture tests.
 */
export function legacyMayWrite(control, now) {
  if (!control) return true;
  if (ownerOf(control) !== OWNERS.LEGACY) return false;
  const switchedAt = time(control.switchedAt);
  return switchedAt === null || now.getTime() >= switchedAt + APP_FENCE_MS;
}
