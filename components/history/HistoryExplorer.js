"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "react-bootstrap/Container";
import useFetch from "../../libs/useFetch";
import { SWR_15_MINUTES } from "../../libs/dataFreshness";
import { dayOfYearIndex } from "../../libs/history/aggregate";
import { COLWICK_HISTORY, SEASONAL_RULES } from "../../libs/history/config";
import {
  baselineReasonText, describeSupport, describeYears, formatDayKey, formatDuration, formatLevel, formatPercent, monthName, shortMonthName,
} from "../../libs/history/present";
import { currentLondonMonth, londonMidnightUtc, monthBounds, yearBounds } from "../../libs/history/ukCalendar";
import DayCalendar from "./DayCalendar";
import EvidencePanel from "./EvidencePanel";
import LevelChart from "./LevelChart";
import PeriodPicker from "./PeriodPicker";
import ShareBars from "./ShareBars";
import SummaryTiles from "./SummaryTiles";
import TodayContext from "./TodayContext";

const HISTORY_SWR = { revalidateOnFocus: false, refreshInterval: 0, shouldRetryOnError: false };
const SLOW_LOAD_MS = 4000;
const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;

export function readPeriod(params, current) {
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  const validYear = Number.isInteger(year) && year >= COLWICK_HISTORY.firstYear && year <= current.year
    ? year : Math.max(COLWICK_HISTORY.firstYear, current.year - 1);
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12 &&
    !(validYear === current.year && month > current.month) ? month : null;
  return { year: validYear, month: validMonth };
}

function ErrorNotice({ error, what }) {
  const reason = error?.payload?.error?.details?.reason;
  const message = error?.payload?.error?.message ?? `The ${what} could not be loaded.`;
  return (
    <div className={`alert ${reason === "integrity" || reason === "unreliable" ? "alert-danger" : "alert-warning"} mb-0`} role="alert">
      <strong>{reason === "unavailable" ? "History unavailable." : "Read failed."}</strong> {message} This is not the same as having no river data for this period.
    </div>
  );
}

ErrorNotice.propTypes = { error: PropTypes.object, what: PropTypes.string.isRequired };

function LoadingBlock({ label, slow }) {
  return (
    <div className="history-skeleton" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      {label}
      {slow ? <p className="history-muted small mb-0 mt-2">The first load of a period reads every 15-minute reading from the archive and can take up to a minute. Later visits are cached.</p> : null}
    </div>
  );
}

LoadingBlock.propTypes = { label: PropTypes.string.isRequired, slow: PropTypes.bool };

function useSlow(pending) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => { clearTimeout(timer); setSlow(false); };
  }, [pending]);
  return slow;
}

function DailyTable({ days }) {
  return (
    <details className="history-table">
      <summary>Show daily figures as a table</summary>
      <div className="table-responsive">
        <table className="table table-dark table-sm table-striped mb-0">
          <caption className="visually-hidden">Daily Colwick levels and time at or above {threshold}</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Min</th><th scope="col">Mean</th><th scope="col">Max</th><th scope="col">At/above {threshold}</th><th scope="col">Unknown</th><th scope="col">Readings</th></tr></thead>
          <tbody>
            {days.filter((day) => day.elapsedMs > 0).map((day) => (
              <tr key={day.date}>
                <th scope="row">{formatDayKey(day.date)}</th>
                <td>{formatLevel(day.min)}</td><td>{formatLevel(day.mean)}</td><td>{formatLevel(day.max)}</td>
                <td>{formatDuration(day.aboveMs)}</td><td>{formatDuration(day.unknownMs)}</td>
                <td>{day.n}{day.provisional ? ` (${day.provisional} provisional)` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

DailyTable.propTypes = { days: PropTypes.array.isRequired };

function PeriodNotices({ data, label }) {
  const support = describeSupport(data.summary);
  const failed = data.months?.filter((month) => month.status !== "available") ?? [];
  return (
    <>
      {data.period.inProgress ? <p className="history-notice">This period is still in progress. Figures cover elapsed time only.</p> : null}
      {data.summary.readings.provisional > 0 ? (
        <p className="history-notice">Includes {data.summary.readings.provisional.toLocaleString("en-GB")} provisional readings (live telemetry not yet checked by the Environment Agency, shown dashed). They may be revised and are not used to define what is typical.</p>
      ) : null}
      {failed.length ? <p className="history-notice history-notice--warning">{failed.length === 1 ? "One month" : `${failed.length} months`} ({failed.map((month) => shortMonthName(month.month)).join(", ")}) could not be read and {failed.length === 1 ? "is" : "are"} left out rather than shown as empty.</p> : null}
      {support.tone === "none" ? (
        <div className="history-empty">
          <h3 className="h5">No observations for {label}</h3>
          <p className="mb-0">The River Data Platform returned no Colwick readings for this period. This usually means history has not been imported for it yet, or it is before live collection began. It is not a sign that the river was low or that HPP was open.</p>
        </div>
      ) : support.tone !== "full" ? <p className="history-notice history-notice--warning">{support.text}</p> : null}
    </>
  );
}

PeriodNotices.propTypes = { data: PropTypes.object.isRequired, label: PropTypes.string.isRequired };

export default function HistoryExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const [current] = useState(() => currentLondonMonth());
  const { year, month } = readPeriod(params, current);
  const periodKey = `${year}-${month ?? "all"}`;
  const [zoomState, setZoomState] = useState({ key: null, range: null, day: null });
  const zoom = zoomState.key === periodKey ? zoomState.range : null;
  const selectedDay = zoomState.key === periodKey ? zoomState.day : null;

  const overview = useFetch("/api/history/colwick/overview", HISTORY_SWR);
  const periodUrl = month ? `/api/history/colwick/month?year=${year}&month=${month}` : `/api/history/colwick/year?year=${year}`;
  const period = useFetch(periodUrl, HISTORY_SWR);
  const levels = useFetch("/api/levels", SWR_15_MINUTES);
  const periodSlow = useSlow(period.isPending);
  const overviewSlow = useSlow(overview.isPending);

  const setPeriod = (next) => {
    const query = new URLSearchParams({ year: String(next.year) });
    if (next.month) query.set("month", String(next.month));
    router.replace(`/history?${query.toString()}`, { scroll: false });
  };

  const data = period.data && (month ? period.data.month === month && period.data.year === year : period.data.year === year && !period.data.month) ? period.data : null;
  const bounds = month ? monthBounds(year, month) : yearBounds(year);
  const end = data ? Date.parse(data.period.end ?? data.period.to) : bounds.to;
  const effectiveEnd = data && !month && data.period.inProgress ? Math.min(bounds.to, Date.parse(data.source.readAt)) : end;
  const label = month ? `${monthName(month)} ${year}` : String(year);

  const band = useMemo(() => {
    const doy = overview.data?.dayOfYear;
    if (!doy || !data) return [];
    // One point per UK day at noon, with the first and last days extended to the period edges.
    const dayStart = (date, offset = 0) => {
      const [y, m, d] = date.split("-").map(Number);
      return londonMidnightUtc(y, m, d + offset);
    };
    const points = data.days.map((day) => ({ t: dayStart(day.date) + 12 * 3600000, ...doy[dayOfYearIndex(day.date)] }));
    if (!points.length) return points;
    return [{ ...points[0], t: dayStart(data.days[0].date) }, ...points, { ...points.at(-1), t: dayStart(data.days.at(-1).date, 1) }];
  }, [overview.data, data]);

  const seasonal = month ? overview.data?.seasonal?.[month - 1] : null;
  const longTerm = useMemo(() => {
    const items = overview.data?.seasonal?.filter((item) => item.available) ?? [];
    const supported = items.reduce((sum, item) => sum + item.supportedMs, 0);
    const years = [...new Set(items.flatMap((item) => item.referenceYears))];
    return items.length === 12 && supported ? { share: items.reduce((sum, item) => sum + item.aboveMs, 0) / supported, years } : null;
  }, [overview.data]);

  const latest = levels.data?.level_data?.[0]
    ? { value: levels.data.level_data[0].reading_level, observedAt: levels.data.level_data[0].reading_date } : null;

  const comparisonRows = overview.data ? (month
    ? overview.data.months.filter((row) => row.month === month).map((row) => ({
      key: row.year, label: String(row.year), summary: row.summary, highlight: row.year === year,
      inProgress: row.inProgress, reference: seasonal?.available ? seasonal.aboveShare : undefined,
    }))
    : overview.data.yearly.map((row) => ({
      key: row.year, label: String(row.year), summary: row.summary, highlight: row.year === year,
      inProgress: row.inProgress, reference: longTerm?.share,
    })))
    : [];

  // "N of M reference years had less time at/above" — only with a fully supported period.
  let rankText = null;
  if (month && data && seasonal?.available && describeSupport(data.summary).tone === "full" && !data.period.inProgress) {
    const others = overview.data.months.filter((row) => row.month === month && row.year !== year && row.baseline === "eligible");
    if (others.length >= SEASONAL_RULES.minReferenceYears) {
      const lower = others.filter((row) => row.summary.aboveShare < data.summary.aboveShare).length;
      rankText = `${label} had more time at or above ${threshold} than ${lower} of the ${others.length} other qualified ${monthName(month)}s (${describeYears(others.map((row) => row.year))}).`;
    }
  }

  return (
    <main className="history-page text-white">
      <Container className="py-4 py-lg-5">
        <header className="mb-4">
          <Link href="/" className="history-back">← Back to home</Link>
          <h1 className="display-6 fw-bold mt-3 mb-2">River level history</h1>
          <p className="lead history-intro mb-0">Explore observed river levels at Colwick since {COLWICK_HISTORY.firstYear}, how often they reached HPP&apos;s {threshold} level rule, and how today compares with past seasons.</p>
        </header>

        <TodayContext overview={overview.data} overviewError={overview.error} latest={latest} levelsError={levels.error}
          currentMonth={current.month} onExplore={() => setPeriod(current)} />

        <div className="history-sticky">
          <PeriodPicker year={year} month={month} firstYear={COLWICK_HISTORY.firstYear} current={current} onChange={setPeriod} />
        </div>

        <section className="history-panel" aria-labelledby="history-period" aria-busy={period.isPending}>
          <h2 id="history-period" className="h4 mb-3">{label}</h2>
          {period.error ? <ErrorNotice error={period.error} what={`history for ${label}`} /> : null}
          {!period.error && !data ? <LoadingBlock label={`Loading Colwick readings for ${label}…`} slow={periodSlow} /> : null}
          {data ? (
            <>
              <PeriodNotices data={data} label={label} />
              {data.summary.support !== "none" ? (
                <>
                  <SummaryTiles summary={data.summary}
                    typicalShare={month ? seasonal?.aboveShare ?? undefined : longTerm?.share}
                    typicalLabel={month ? `Typical ${monthName(month)} (${describeYears(seasonal?.referenceYears)})` : `Long-term average (${describeYears(longTerm?.years)})`} />
                  <LevelChart mode={month ? "month" : "year"} from={bounds.from} to={bounds.to} end={effectiveEnd}
                    days={data.days} readings={data.readings ?? []} band={band} zoom={zoom}
                    onZoomChange={(range) => setZoomState({ key: periodKey, range, day: null })}
                    title={month ? `Colwick level, ${label} (15-minute readings, ${COLWICK_HISTORY.unit})` : `Colwick daily level range and mean, ${label} (${COLWICK_HISTORY.unit})`} />
                  <ul className="history-legend history-legend--chart" aria-label="Chart key">
                    <li><span className="history-legend__line" aria-hidden="true" />{month ? "Observed level" : "Daily mean"}</li>
                    {month ? <li><span className="history-legend__line history-legend__line--provisional" aria-hidden="true" />Provisional</li> : <li><span className="history-legend__swatch history-legend__swatch--range" aria-hidden="true" />Daily min–max</li>}
                    <li><span className="history-legend__swatch history-legend__swatch--band" aria-hidden="true" />Typical for the time of year (10th–90th percentile of daily means{band.find((b) => b.years) ? `, ${band.find((b) => b.years).years} years` : ""})</li>
                    <li><span className="history-legend__line history-legend__line--threshold" aria-hidden="true" />{threshold} HPP level rule</li>
                    <li><span className="history-legend__swatch history-legend__swatch--gap" aria-hidden="true" />No supported readings</li>
                  </ul>
                  <p className="history-muted small">{month ? "Drag across the chart to zoom (desktop) or pick a day below." : "Pick a month below to see its individual readings."} Gaps are never joined or filled in.</p>

                  {month ? (
                    <div className="mt-4">
                      <h3 className="h5">Day by day</h3>
                      <DayCalendar days={data.days} selected={selectedDay}
                        onSelect={(date) => {
                          if (!date) return setZoomState({ key: periodKey, range: null, day: null });
                          const [y, m, d] = date.split("-").map(Number);
                          return setZoomState({ key: periodKey, day: date, range: [londonMidnightUtc(y, m, d), londonMidnightUtc(y, m, d + 1)] });
                        }} />
                    </div>
                  ) : (
                    <div className="mt-4">
                      <h3 className="h5">Time at or above {threshold} by month</h3>
                      <ShareBars caption={`Share of supported time at or above ${threshold} by month, ${label}`}
                        rows={data.months.map((row) => ({
                          key: row.month, label: shortMonthName(row.month), summary: row.summary ?? null,
                          reference: overview.data?.seasonal?.[row.month - 1]?.aboveShare ?? undefined,
                        }))}
                        onSelect={(m) => setPeriod({ year, month: m })}
                        referenceLabel={overview.data ? "Typical share for that month across reference years" : undefined} />
                    </div>
                  )}
                  <DailyTable days={data.days} />
                </>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="history-panel" aria-labelledby="history-compare">
          <h2 id="history-compare" className="h4">{month ? `${monthName(month)} in other years` : "Year by year"}</h2>
          <p className="history-muted">Share of supported observed time with the Colwick level at or above {threshold}. {month ? "" : "Select a year to explore it."}</p>
          {rankText ? <p>{rankText}</p> : null}
          {overview.error ? <ErrorNotice error={overview.error} what="year-on-year comparison" /> : null}
          {!overview.error && !overview.data ? <LoadingBlock label="Loading year-on-year comparison…" slow={overviewSlow} /> : null}
          {overview.data ? (
            <>
              {overview.data.monthsFailed ? <p className="history-notice history-notice--warning">{overview.data.monthsFailed} months could not be read yet and are left out; try again shortly.</p> : null}
              <ShareBars caption={month ? `${monthName(month)} share of time at or above ${threshold} by year` : `Share of time at or above ${threshold} by year`}
                rows={comparisonRows} onSelect={(y) => setPeriod({ year: y, month })}
                referenceLabel={month && seasonal?.available ? `Typical ${monthName(month)} share (${describeYears(seasonal.referenceYears)})` : !month && longTerm ? `Long-term average (${describeYears(longTerm.years)})` : undefined} />
              {seasonal && !seasonal.available ? <p className="history-muted small mt-2">Not enough comparable years for a typical {monthName(month)} ({seasonal.referenceYears.length} of {SEASONAL_RULES.minReferenceYears} needed).</p> : null}
              {seasonal?.excludedYears?.length ? (
                <p className="history-muted small mt-2 mb-0">Not used as reference: {seasonal.excludedYears.map((item) => `${item.year} (${baselineReasonText(item.reason)})`).join(", ")}.</p>
              ) : null}
            </>
          ) : null}
          {!month && longTerm ? <p className="history-muted small mt-2 mb-0">Across {describeYears(longTerm.years)}, the level was at or above {threshold} for {formatPercent(longTerm.share)} of supported time.</p> : null}
        </section>

        <EvidencePanel summary={data?.summary} coverage={data?.coverage?.status} readAt={data?.source?.readAt ?? data?.source?.oldestReadAt} />
      </Container>
    </main>
  );
}
