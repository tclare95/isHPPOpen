// Eligibility of RDP observation rows for historical summaries (#104).
//
// RDP stores provider quality verbatim:
// - imported EA Hydrology rows: a JSON object string, e.g. {"qcode":"Edited","quality":"Good"};
// - live flood-monitoring rows: the raw JSON of EA's optional `quality` (usually absent → null).
//
// Rules (documented in docs/HISTORICAL_RIVER_CONDITIONS.md):
// - qualified:   Hydrology `Good` (an `Edited` qcode is kept as qualified but flagged).
// - provisional: no stated quality (live telemetry), `Unchecked` or `Estimated`. Shown and
//                summarised, but labelled provisional and never used as a seasonal baseline.
// - excluded:    `Suspect`, `Missing`, `Rejected`, any other value or unreadable quality.
//                Excluded rows become gaps (unknown time), never a level.
export const QUALITY_CLASS = Object.freeze({
  QUALIFIED: "qualified",
  PROVISIONAL: "provisional",
  EXCLUDED: "excluded",
});

const PROVISIONAL = new Set(["Unchecked", "Estimated"]);

function parseQuality(raw) {
  if (raw === null || raw === undefined) return { quality: null, qcode: null };
  if (typeof raw !== "string" || raw.length > 256) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return { quality: parsed, qcode: null };
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.quality === "string" &&
        (parsed.qcode === undefined || typeof parsed.qcode === "string")) {
      return { quality: parsed.quality, qcode: parsed.qcode ?? null };
    }
    return null;
  } catch {
    // A bare, unquoted provider word is accepted as that word.
    return /^[A-Za-z]{1,32}$/.test(raw) ? { quality: raw, qcode: null } : null;
  }
}

export function classifyQuality(raw) {
  const parsed = parseQuality(raw);
  if (!parsed) return { cls: QUALITY_CLASS.EXCLUDED, edited: false };
  const edited = parsed.qcode === "Edited";
  if (parsed.quality === "Good") return { cls: QUALITY_CLASS.QUALIFIED, edited };
  if (parsed.quality === null || PROVISIONAL.has(parsed.quality)) return { cls: QUALITY_CLASS.PROVISIONAL, edited };
  return { cls: QUALITY_CLASS.EXCLUDED, edited };
}
