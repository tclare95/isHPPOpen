"use client";

import PropTypes from "prop-types";
import Form from "react-bootstrap/Form";
import { shortMonthName, monthName } from "../../libs/history/present";

// Year select, month chips ("Whole year" + Jan–Dec) and previous/next stepping.
export default function PeriodPicker({ year, month, firstYear, current, onChange }) {
  const years = [];
  for (let y = current.year; y >= firstYear; y--) years.push(y);
  const isFuture = (y, m) => y > current.year || (y === current.year && m > current.month);

  const step = (direction) => {
    if (!month) return onChange({ year: year + direction, month: null });
    const index = year * 12 + (month - 1) + direction;
    return onChange({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  };
  const canPrev = month ? year > firstYear || month > 1 : year > firstYear;
  const canNext = month ? !isFuture(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1) : year < current.year;
  const label = month ? `${monthName(month)} ${year}` : "Whole year";

  return (
    <div className="history-picker" role="group" aria-label="Choose a period">
      <div className="history-picker__row">
        <button type="button" className="history-picker__step" onClick={() => step(-1)} disabled={!canPrev} aria-label="Previous period">‹</button>
        <Form.Select aria-label="Year" value={year} className="history-picker__year"
          onChange={(event) => {
            const nextYear = Number(event.target.value);
            onChange({ year: nextYear, month: month && !isFuture(nextYear, month) ? month : null });
          }}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Form.Select>
        <span className="history-picker__label" aria-live="polite">{label}</span>
        <button type="button" className="history-picker__step" onClick={() => step(1)} disabled={!canNext} aria-label="Next period">›</button>
      </div>
      <div className="history-picker__months">
        <button type="button" className={`history-chip${month ? "" : " is-active"}`} aria-pressed={!month} onClick={() => onChange({ year, month: null })}>Whole year</button>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((m) => (
          <button key={m} type="button" className={`history-chip${month === m ? " is-active" : ""}`} aria-pressed={month === m}
            disabled={isFuture(year, m)} onClick={() => onChange({ year, month: m })} aria-label={`${monthName(m)} ${year}`}>
            {shortMonthName(m)}
          </button>
        ))}
      </div>
    </div>
  );
}

PeriodPicker.propTypes = {
  year: PropTypes.number.isRequired,
  month: PropTypes.number,
  firstYear: PropTypes.number.isRequired,
  current: PropTypes.shape({ year: PropTypes.number, month: PropTypes.number }).isRequired,
  onChange: PropTypes.func.isRequired,
};
