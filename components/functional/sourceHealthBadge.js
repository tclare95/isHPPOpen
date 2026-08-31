import PropTypes from "prop-types";
import Badge from "react-bootstrap/Badge";

const VARIANTS = { fresh: "success", stale: "warning", fallback: "warning", unavailable: "secondary" };

export default function SourceHealthBadge({ health }) {
  if (!health) return null;
  const label = health.state === "fresh" ? "Updated" : health.state === "fallback" ? "Using saved data" : health.state === "stale" ? "Data may be stale" : "Data unavailable";
  return <Badge bg={VARIANTS[health.state] || "secondary"} className="ms-2">{label}</Badge>;
}

SourceHealthBadge.propTypes = { health: PropTypes.shape({ state: PropTypes.string, generatedAt: PropTypes.string }) };
