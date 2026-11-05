import { COLWICK_HISTORY } from "../../../libs/history/config";

// Prominent statement that events are river-level evidence, not HPP decisions (#105, #89).
export default function NotClosuresNote() {
  const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;
  return (
    <p className="history-notice mb-4">
      <strong>River levels, not HPP closures.</strong> These events are reconstructed from observed Colwick river levels at or above {threshold}.
      They are not a record of when HPP actually closed, flood warnings or forecasts; HPP&apos;s recorded status history is kept separately and is not changed by these pages.
    </p>
  );
}
