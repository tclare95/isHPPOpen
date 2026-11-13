import PropTypes from "prop-types";
import Badge from "react-bootstrap/Badge";
import { getDisplayedHealthState } from "../../libs/operationalHealth";

const VARIANTS = { fresh: "success", stale: "warning", fallback: "warning", unavailable: "secondary" };

// `observedAge` is for payloads whose `generatedAt` is the observed time of the data (e.g. Trent),
// so a cached "fresh" response is downgraded once that observation passes the freshness limit.
export default function SourceHealthBadge({ health, observedAge = false }) {
  if (!health) return null;
  const state = observedAge ? getDisplayedHealthState(health) : health.state;
  const label = state === "fresh" ? "Updated" : state === "fallback" ? "Using saved data" : state === "stale" ? "Data may be stale" : "Data unavailable";
  return <Badge bg={VARIANTS[state] || "secondary"} className="ms-2">{label}</Badge>;
}

SourceHealthBadge.propTypes = {
  health: PropTypes.shape({ state: PropTypes.string, generatedAt: PropTypes.string }),
  observedAge: PropTypes.bool,
};
