"use client";

import { useEffect, useState } from "react";
import PropTypes from "prop-types";

// Shared read-state presentation for the history pages (#104, #105).
export const HISTORY_SWR = { revalidateOnFocus: false, refreshInterval: 0, shouldRetryOnError: false };
const SLOW_LOAD_MS = 4000;

// A failed read is never presented as "no data".
export function ErrorNotice({ error, what }) {
  const reason = error?.payload?.error?.details?.reason;
  const message = error?.payload?.error?.message ?? `The ${what} could not be loaded.`;
  return (
    <div className={`alert ${reason === "integrity" || reason === "unreliable" ? "alert-danger" : "alert-warning"} mb-0`} role="alert">
      <strong>{reason === "unavailable" ? "History unavailable." : "Read failed."}</strong> {message} This is not the same as having no river data for this period.
    </div>
  );
}

ErrorNotice.propTypes = { error: PropTypes.object, what: PropTypes.string.isRequired };

export function LoadingBlock({ label, slow }) {
  return (
    <div className="history-skeleton" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      {label}
      {slow ? <p className="history-muted small mb-0 mt-2">The first load of a period reads every 15-minute reading from the archive and can take up to a minute. Later visits are cached.</p> : null}
    </div>
  );
}

LoadingBlock.propTypes = { label: PropTypes.string.isRequired, slow: PropTypes.bool };

export function useSlow(pending) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => { clearTimeout(timer); setSlow(false); };
  }, [pending]);
  return slow;
}
