"use client";

import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import StatusMessage from "../layout/site/StatusMessage";

// Shared read-state presentation for the history pages (#104, #105).
export const HISTORY_SWR = { revalidateOnFocus: false, refreshInterval: 0, shouldRetryOnError: false };
const SLOW_LOAD_MS = 4000;

// A failed read is never presented as "no data".
export function ErrorNotice({ error, what }) {
  const reason = error?.payload?.error?.details?.reason;
  const message = error?.payload?.error?.message ?? `The ${what} could not be loaded.`;
  return (
    <StatusMessage state={reason === "unavailable" ? "unavailable" : "error"}
      title={reason === "unavailable" ? "History unavailable." : "Read failed."}>
      {message} This is not the same as having no river data for this period.
    </StatusMessage>
  );
}

ErrorNotice.propTypes = { error: PropTypes.object, what: PropTypes.string.isRequired };

export function LoadingBlock({ label, slow }) {
  return (
    <StatusMessage state="loading" className="history-skeleton">
      {label}
      {slow ? <p className="history-muted small mb-0 mt-2">The first load of a period can take up to a minute. Later visits are quicker.</p> : null}
    </StatusMessage>
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
