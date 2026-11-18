"use client";

import PropTypes from "prop-types";

// Fixed copy for the result codes the confirm/unsubscribe links redirect with. The URL only selects a
// message; it can never supply text, so a crafted link cannot show a fake "active" subscription.
export const ALERT_RESULT_COPY = Object.freeze({
  confirmed: { variant: "success", text: "Alert confirmed. It is now active, and we will email you when its condition is met." },
  already_active: { variant: "info", text: "This alert was already active. Nothing has changed." },
  confirm_invalid: { variant: "warning", text: "This confirmation link is invalid, has expired or has already been used, so nothing was activated. If you confirmed it earlier, the alert is still active: request a management link below to check. Otherwise, set the alert up again." },
  confirm_error: { variant: "danger", text: "We could not confirm your alert just now, so it is not active yet. Please try the link in your email again later." },
  unsubscribed: { variant: "secondary", text: "Alert stopped. You will not get further emails for it." },
  unsubscribe_invalid: { variant: "warning", text: "This unsubscribe link is no longer valid. To check or stop your alerts, request a management link below." },
  unsubscribe_error: { variant: "danger", text: "We could not stop your alert just now. Please try the link again, or request a management link below." },
});

// Plain /history notices: neutral for done or unchanged, warning for "nothing changed, act", an alert for a failure.
const NOTICE_CLASS = {
  success: "history-notice",
  info: "history-notice",
  secondary: "history-notice",
  warning: "history-notice history-notice--warning",
  danger: "alert alert-danger",
};

export default function AlertResultNotice({ result }) {
  const copy = ALERT_RESULT_COPY[result];
  if (!copy) return null;
  return <p className={`${NOTICE_CLASS[copy.variant]} mb-3`} role="status" data-variant={copy.variant}>{copy.text}</p>;
}

AlertResultNotice.propTypes = {
  result: PropTypes.string,
};
