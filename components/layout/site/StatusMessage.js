import PropTypes from "prop-types";

// Loading, empty, stale, unavailable and failed states in the /history style. It shows only the
// words it is given, never a placeholder number. "empty" is a successful read with nothing to show.
const CLASSES = {
  loading: "history-skeleton",
  empty: "history-empty",
  stale: "history-notice history-notice--warning",
  unavailable: "history-notice history-notice--warning",
  error: "history-notice history-notice--warning",
};

export default function StatusMessage({ state, title, children, className }) {
  return (
    <div className={`${CLASSES[state]}${className ? ` ${className}` : ""}`} data-state={state}
      role={state === "error" ? "alert" : "status"} aria-live={state === "error" ? undefined : "polite"}>
      {state === "loading" ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
      {title ? <><strong>{title}</strong>{" "}</> : null}
      {children}
    </div>
  );
}

StatusMessage.propTypes = {
  state: PropTypes.oneOf(Object.keys(CLASSES)).isRequired,
  title: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string,
};
