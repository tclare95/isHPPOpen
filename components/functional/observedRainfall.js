"use client";

import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import Badge from "react-bootstrap/Badge";
import Table from "react-bootstrap/Table";
import StatusMessage from "../layout/site/StatusMessage";
import RainfallLevelChart from "./rainfallLevelChart";
import { SWR_15_MINUTES } from "../../libs/dataFreshness";
import useFetch from "../../libs/useFetch";
import { describeConvention, describeLatest, describeWindow, formatLabelTime, UNAVAILABLE_TEXT } from "../../libs/rainfall/present";
import "../../styles/rainfall.css";

const CHART_HOURS = [24, 72];
const COLWICK_STATION_ID = 4009;

// Colwick readings from the Trent gauges feed already on this page (SWR shares the request with TrentDashboard).
export function colwickLevelPoints(trent) {
  const readings = trent?.stations?.find((station) => station.stationId === COLWICK_STATION_ID)?.measures?.level?.readings ?? [];
  return readings
    .map((reading) => ({ t: Date.parse(reading.dateTime), value: reading.value }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.value))
    .sort((a, b) => a.t - b.t);
}

function WindowCell({ window }) {
  const { headline, detail, state } = describeWindow(window);
  return (
    <td data-state={state}>
      <div className={state === "complete" ? "rainfall-total" : "rainfall-total rainfall-total--partial"}>{headline}</div>
      <div className="rainfall-detail">{detail}</div>
    </td>
  );
}

WindowCell.propTypes = { window: PropTypes.object };

function LatestCell({ gauge, nowMs }) {
  const latest = describeLatest(gauge, nowMs);
  return (
    <td>
      <div>{latest.text}</div>
      {latest.state === "delayed" ? <Badge bg="warning" text="dark">Delayed</Badge> : null}
      {latest.state === "usual" ? <span className="rainfall-detail">Usual reporting delay</span> : null}
      {gauge.latest?.labelConvention === "unverified" ? <div className="rainfall-detail">Label start/end not verified</div> : null}
    </td>
  );
}

LatestCell.propTypes = { gauge: PropTypes.object.isRequired, nowMs: PropTypes.number.isRequired };

function GaugeRow({ gauge, windowHours, nowMs }) {
  const unavailable = gauge.status === "unavailable";
  return (
    <tr>
      <th scope="row">
        <div>{gauge.name}</div>
        <div className="rainfall-detail">{gauge.area} · EA gauge {gauge.reference}</div>
      </th>
      {unavailable ? (
        <td colSpan={windowHours.length + 1} className="rainfall-detail">
          {UNAVAILABLE_TEXT[gauge.unavailableReason] ?? UNAVAILABLE_TEXT.temporarily_unavailable} Not shown as zero.
        </td>
      ) : (
        <>
          {windowHours.map((hours) => <WindowCell key={hours} window={gauge.windows?.find((window) => window.hours === hours)} />)}
          <LatestCell gauge={gauge} nowMs={nowMs} />
        </>
      )}
    </tr>
  );
}

GaugeRow.propTypes = { gauge: PropTypes.object.isRequired, windowHours: PropTypes.arrayOf(PropTypes.number).isRequired, nowMs: PropTypes.number.isRequired };

function GaugeNotes({ gauges }) {
  const notes = [];
  const delayedTail = gauges.filter((gauge) => gauge.status === "available" && !gauge.windowsEndAtLatestReport);
  const revised = gauges.filter((gauge) => gauge.revised > 0);
  const paginated = gauges.filter((gauge) => gauge.rangeSummaryUnavailable === "paginated");
  if (delayedTail.length) {
    notes.push(`${delayedTail.map((gauge) => gauge.name).join(", ")}: nothing reported for over 6 hours, so the windows run to now and the unreported intervals count as missing.`);
  }
  if (revised.length) {
    notes.push(`${revised.map((gauge) => `${gauge.name} (${gauge.revised})`).join(", ")}: some intervals were corrected by the source after first receipt; the latest values are shown.`);
  }
  if (paginated.length) {
    notes.push(`${paginated.map((gauge) => gauge.name).join(", ")}: the data platform did not return its own summary for this read; totals are worked out here using the same rules.`);
  }
  if (!notes.length) return null;
  return <ul className="rainfall-notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul>;
}

GaugeNotes.propTypes = { gauges: PropTypes.arrayOf(PropTypes.object).isRequired };

export default function ObservedRainfall() {
  const { data, error, isPending } = useFetch("/api/rainfall/observed", SWR_15_MINUTES);
  const { data: trent } = useFetch("/api/trentweirs", SWR_15_MINUTES);
  const [selectedId, setSelectedId] = useState(null);
  const [chartHours, setChartHours] = useState(24);
  const levelPoints = useMemo(() => colwickLevelPoints(trent), [trent]);
  // Report ages are re-measured each minute so a long-open page shows a growing delay rather than a frozen one.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const gauges = data?.gauges ?? [];
  const chartable = gauges.filter((gauge) => gauge.status !== "unavailable" && gauge.intervals);
  const selected = chartable.find((gauge) => gauge.measurementId === selectedId) ?? chartable[0] ?? null;
  const toMs = data?.range ? Date.parse(data.range.to) : null;

  let body;
  if (isPending) {
    body = <StatusMessage state="loading">Loading observed rainfall…</StatusMessage>;
  } else if (error || !data) {
    body = <StatusMessage state="error">Observed rainfall could not be loaded. No rainfall is assumed.</StatusMessage>;
  } else if (data.status === "unavailable") {
    body = (
      <StatusMessage state="unavailable" title="Observed rainfall unavailable.">
        {UNAVAILABLE_TEXT[data.unavailableReason] ?? UNAVAILABLE_TEXT.temporarily_unavailable} No rainfall is assumed.
      </StatusMessage>
    );
  } else {
    body = (
      <>
        {data.status === "partial" ? (
          <StatusMessage state="unavailable" className="mb-3">Some rain gauges are unavailable; they are listed but not counted as dry.</StatusMessage>
        ) : null}
        <h3 className="history-chart__title mb-2">How much rain has been recorded</h3>
        <div className="table-responsive">
          <Table variant="dark" size="sm" className="rainfall-table align-top mb-2">
            <caption className="rainfall-detail">
              Totals over the most recent reports at each gauge. A total is given only when every 15-minute interval was reported;
              otherwise &ldquo;at least&rdquo; is the sum of what was reported.
            </caption>
            <thead>
              <tr>
                <th scope="col">Rain gauge</th>
                {data.windowHours.map((hours) => <th scope="col" key={hours}>Last {hours} h</th>)}
                <th scope="col">Latest report</th>
              </tr>
            </thead>
            <tbody>
              {gauges.map((gauge) => <GaugeRow key={gauge.measurementId} gauge={gauge} windowHours={data.windowHours} nowMs={nowMs} />)}
            </tbody>
          </Table>
        </div>
        <GaugeNotes gauges={gauges} />

        {selected && toMs ? (
          <div className="mt-4">
            <div className="history-chart__toolbar flex-wrap">
              <h3 className="history-chart__title">Rainfall and Colwick level over the same period</h3>
              <div className="d-flex gap-1" role="group" aria-label="Chart period">
                {CHART_HOURS.map((hours) => (
                  <button key={hours} type="button" className={`history-chip${chartHours === hours ? " is-active" : ""}`}
                    aria-pressed={chartHours === hours} onClick={() => setChartHours(hours)}>{hours} h</button>
                ))}
              </div>
            </div>
            <div className="rainfall-gauge-picker" role="group" aria-label="Rain gauge">
              {chartable.map((gauge) => (
                <button key={gauge.measurementId} type="button" className={`history-chip${gauge === selected ? " is-active" : ""}`}
                  aria-pressed={gauge === selected} onClick={() => setSelectedId(gauge.measurementId)}>{gauge.name}</button>
              ))}
            </div>
            <RainfallLevelChart gauge={selected} levelReadings={levelPoints} fromMs={toMs - chartHours * 3600000} toMs={toMs} />
            <ul className="history-legend">
              <li><span className="history-legend__swatch rainfall-legend__bar" />Rain in a 15-minute interval (verified timing)</li>
              <li><span className="history-legend__swatch rainfall-legend__bar--unverified" />Rain at a label whose start/end is not verified</li>
              <li><span className="history-legend__swatch history-legend__swatch--gap" />Missing or unusable (not zero)</li>
              <li><span className="history-legend__swatch rainfall-legend__pending" />Not reported yet</li>
              <li><span className="history-legend__line" />Colwick river level</li>
            </ul>
            <p className="rainfall-detail mb-0">
              Rain gauge {selected.name}: {describeConvention(selected.latest?.labelConvention ?? selected.intervals.at(-1)?.labelConvention)} for the
              latest report. Unverified labels are drawn centred on the label, so their timing against the level line is only
              accurate to about 15 minutes. Times are UK local; the latest label is {formatLabelTime(selected.latestReportedLabel, true)}.
            </p>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section id="rainfall" className="history-panel text-start mt-4" aria-labelledby="rainfall-heading">
      <p className="history-eyebrow mb-1">Measured by rain gauges · not a forecast</p>
      <h2 id="rainfall-heading" className="h4">Observed rainfall</h2>
      <p className="history-intro">
        Rain recorded in 15-minute totals by six Environment Agency rain gauges across the Trent catchment upstream of
        Holme Pierrepont, via the River Data Platform. The telemetry is unchecked, usually arrives 30–70 minutes late in
        batches, and can be corrected later. Missing intervals are shown as gaps, never as dry.
      </p>
      {body}
      <p className="rainfall-detail mt-3 mb-0">
        Rainfall and river level are shown side by side for context only. This does not show how much a river rise was caused
        by this rain or how long it takes to arrive. Predicted rainfall is part of the separate <Link href="/forecastinfo">forecast</Link>,
        and is not included here.
      </p>
    </section>
  );
}
