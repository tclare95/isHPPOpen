import PropTypes from "prop-types";

export const STATUS_STATES = ["loading", "empty", "stale", "unavailable", "error"];

// One presentation for data that is loading, empty, stale, unavailable or failed. It carries only the
// words it is given: it never shows a placeholder number or a conclusion the data cannot support.
// "empty" means a successful read with nothing to show; "unavailable" and "error" mean we do not know.
export default function StatusMessage({ state, title, children, className }) {
  const role = state === "error" ? "alert" : "status";
  return (
    <div className={`site-state site-state--${state}${className ? ` ${className}` : ""}`} role={role}
      aria-live={state === "error" ? undefined : "polite"} data-state={state}>
      {state === "loading" ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
      {title ? <><strong className="site-state__title">{title}</strong>{" "}</> : null}
      {children}
    </div>
  );
}

StatusMessage.propTypes = {
  state: PropTypes.oneOf(STATUS_STATES).isRequired,
  title: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string,
};
