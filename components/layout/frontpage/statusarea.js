import { Row, ProgressBar, Accordion, Alert, Spinner } from "react-bootstrap";
import useFetch from "../../../libs/useFetch";

const historicData = {
  yearlyClosureTrend: [
    { year: 2012, closed: 26 },
    { year: 2013, closed: 43 },
    { year: 2014, closed: 68 },
    { year: 2015, closed: 23 },
    { year: 2016, closed: 49 },
    { year: 2017, closed: 28 },
    { year: 2018, closed: 46 },
    { year: 2019, closed: 101 },
    { year: 2020, closed: 71 },
    { year: 2021, closed: 50 },
    { year: 2022, closed: 44 },
    { year: 2023, closed: 95 },
    { year: 2024, closed: 103 },
    { year: 2025, closed: 58 },
    { year: 2026, closed: 41 },
  ],

  monthlyClosureTrend: [
    { month: "January", closed: 185 },
    { month: "February", closed: 135 },
    { month: "March", closed: 104 },
    { month: "April", closed: 35 },
    { month: "May", closed: 5 },
    { month: "June", closed: 14 },
    { month: "July", closed: 3 },
    { month: "August", closed: 7 },
    { month: "September", closed: 9 },
    { month: "October", closed: 57 },
    { month: "November", closed: 107 },
    { month: "December", closed: 185 },
  ],

  overallMonthlyClosurePercentages: [
    { month: "January", overall_closure_percentage: 43.325527 },
    { month: "February", overall_closure_percentage: 35.064935 },
    { month: "March", overall_closure_percentage: 25.806452 },
    { month: "April", overall_closure_percentage: 8.974359 },
    { month: "May", overall_closure_percentage: 1.240695 },
    { month: "June", overall_closure_percentage: 3.617571 },
    { month: "July", overall_closure_percentage: 0.744417 },
    { month: "August", overall_closure_percentage: 1.736973 },
    { month: "September", overall_closure_percentage: 2.319588 },
    { month: "October", overall_closure_percentage: 14.143921 },
    { month: "November", overall_closure_percentage: 27.15736 },
    { month: "December", overall_closure_percentage: 42.923434 },
  ],
};

const toPercent = (value, total) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  const raw = Math.round((value / total) * 100);
  return Math.max(0, Math.min(100, raw));
};

const formatDisplayDate = (dateInput) => {
  if (!dateInput) {
    return "Unknown";
  }

  const parsedDate = new Date(dateInput);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }

  return parsedDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getDaysAgo = (dateInput) => {
  if (!dateInput) {
    return null;
  }

  const parsedDate = new Date(dateInput);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const today = new Date();
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const utcDate = Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());

  return Math.max(0, Math.floor((utcToday - utcDate) / (1000 * 60 * 60 * 24)));
};

export default function StatusArea() {
  const { data: statusData, error: statusError, isPending: statusPending } = useFetch("/api/hppstatus");

  if (statusPending || !statusData) {
    return (
      <div className="mt-4 text-white text-center" id="stats" aria-live="polite">
        <Spinner animation="border" role="status" size="sm" className="mr-2" />
        <span>Loading HPP closure stats…</span>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="mt-4" id="stats">
        <Alert variant="danger" className="text-center mb-0">
          We couldn&apos;t load closure stats right now. Please try again shortly.
        </Alert>
      </div>
    );
  }

  const currentStatus = statusData.currentStatus ? "Open" : "Closed";
  const lastOpenDate = statusData.lastChangedDate;
  const lastOpenDaysAgo = getDaysAgo(lastOpenDate);
  let lastOpenAgoText = "";
  if (lastOpenDaysAgo !== null) {
    let dayLabel = "days";
    if (lastOpenDaysAgo === 1) {
      dayLabel = "day";
    }
    lastOpenAgoText = ` (${lastOpenDaysAgo} ${dayLabel} ago)`;
  }

  const closureWindows = [
    { days: 7, closures: statusData.closuresInLast7Days ?? 0 },
    { days: 28, closures: statusData.closuresInLast28Days ?? 0 },
    { days: 182, closures: statusData.closuresInLast182Days ?? 0 },
  ];

  return (
    <div
      className="mt-4 text-white text-center justify-content-center"
      id="stats"
    >
      <Row className="justify-content-center">
        <h2>HPP Closure Stats</h2>
        <p>
          Current status: <span className="font-weight-bold">{currentStatus}</span>
        </p>
        <p>Note: this only accounts for river level - not any other closures</p>
      </Row>
      <Row className="justify-content-center">
        {statusData.currentStatus ? null : (
          <p>
            HPP was last open on: {formatDisplayDate(lastOpenDate)}
            {lastOpenAgoText}
          </p>
        )}
      </Row>
      <Row className="justify-content-center mt-4">
        <div className="text-center w-100">
          <p className="font-weight-bold mb-4">HPP has been closed for:</p>
          {closureWindows.map(({ days, closures }) => {
            const roundedClosures = Math.max(0, Math.min(days, Math.round(closures)));
            const percentage = toPercent(roundedClosures, days);

            return (
            <Row className="justify-content-center mb-3" key={days}>
              <div className="text-center w-100">
                <p>
                  <span className="font-weight-bold">{roundedClosures}</span>
                  {` of the last ${days} days (`}
                  <span className="font-weight-bold">{`${percentage}%`}</span>
                  {`)`}
                </p>
                <ProgressBar
                  variant="danger"
                  now={percentage}
                  className="w-50 mx-auto"
                  label={`${percentage}%`}
                  aria-label={`HPP closed ${percentage}% of the last ${days} days`}
                />
              </div>
            </Row>
            );
          })}
        </div>
      </Row>
      <Row className="justify-content-center mt-4">
        <div className="text-center w-100">Historical Closure Data</div>

        <div
          className="mt-4 text-white text-center justify-content-center"
          id="historical-accordion"
        >
          <Accordion>
            <Accordion.Item eventKey="0">
              <Accordion.Header>Yearly Closure Trend</Accordion.Header>
              <Accordion.Body>
                <Row>
                  <div className="text-center w-100">
                    <p className="font-weight-bold text-white mb-4">Yearly Closure Trend</p>
                    <table className="table table-dark table-striped table-bordered">
                      <caption className="visually-hidden">Yearly Closure Trend</caption>
                      <thead>
                        <tr>
                          <th scope="col">Year</th>
                          <th scope="col">Closure Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicData.yearlyClosureTrend.map((data) => (
                          <tr key={data.year}>
                            <td>{data.year}</td>
                            <td>{data.closed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Row>
              </Accordion.Body>
            </Accordion.Item>
            <Accordion.Item eventKey="1">
              <Accordion.Header>Monthly Closure Trend</Accordion.Header>
              <Accordion.Body>
                <Row>
                  <div className="text-center w-100">
                    <p className="font-weight-bold text-white mb-4">Monthly Closure Trend</p>
                    <table className="table table-dark table-striped table-bordered">
                      <caption className="visually-hidden">Monthly Closure Trend</caption>
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          <th scope="col">Closure Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicData.monthlyClosureTrend.map((data) => (
                          <tr key={data.month}>
                            <td>{data.month}</td>
                            <td>{data.closed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Row>
              </Accordion.Body>
            </Accordion.Item>
            <Accordion.Item eventKey="2">
              <Accordion.Header>
                Overall Monthly Closure Percentages
              </Accordion.Header>
              <Accordion.Body>
                <Row>
                  <div className="text-center w-100">
                    <p className="font-weight-bold text-white mb-4">Overall Monthly Closure Percentages</p>
                    <table className="table table-dark table-striped table-bordered">
                      <caption className="visually-hidden">Overall Monthly Closure Percentages</caption>
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          <th scope="col">Overall Closure Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicData.overallMonthlyClosurePercentages.map((data) => (
                          <tr key={data.month}>
                            <td>{data.month}</td>
                            <td>{data.overall_closure_percentage.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Row>
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </div>
      </Row>
    </div>
  );
}
