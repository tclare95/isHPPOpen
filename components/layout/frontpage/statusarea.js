import { Row, ProgressBar, Container } from "react-bootstrap";
import { useFetchedStatus } from "../../../libs/statussswrhook";
import { Accordion } from "react-bootstrap";

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
    { year: 2023, closed: 90 },
    { year: 2024, closed: 63 },
  ],
  monthlyClosureTrend: [
    { month: "January", closed: 134 },
    { month: "February", closed: 95 },
    { month: "March", closed: 86 },
    { month: "April", closed: 22 },
    { month: "May", closed: 1 },
    { month: "June", closed: 14 },
    { month: "July", closed: 3 },
    { month: "August", closed: 7 },
    { month: "September", closed: 2 },
    { month: "October", closed: 49 },
    { month: "November", closed: 77 },
    { month: "December", closed: 118 },
  ],
  overallMonthlyClosurePercentages: [
    { month: "January", overall_closure_percentage: 34.52054794520548 },
    { month: "February", overall_closure_percentage: 29.20353982300885 },
    { month: "March", overall_closure_percentage: 23.118279569892472 },
    { month: "April", overall_closure_percentage: 8.61111111111111 },
    { month: "May", overall_closure_percentage: 0.8064516129032258 },
    { month: "June", overall_closure_percentage: 2.801120448179272 },
    { month: "July", overall_closure_percentage: 0.2688172043010753 },
    { month: "August", overall_closure_percentage: 1.3440860215053763 },
    { month: "September", overall_closure_percentage: 1.1396011396011396 },
    { month: "October", overall_closure_percentage: 12.609970674486803 },
    { month: "November", overall_closure_percentage: 22.15568862275449 },
    { month: "December", overall_closure_percentage: 35.77235772357724 },
  ],
};

export default function StatusArea() {
  const { statusData, statusError, statusPending } = useFetchedStatus();

  if (statusPending || !statusData) {
    return <div>Loading</div>;
  }

  const currentStatus = statusData.currentStatus ? "Open" : "Closed";
  const effectiveLastOpenDate = statusData.lastChangedDate.split("T")[0];

  return (
    <div
      className="mt-4 text-white text-center justify-content-center"
      id="stats"
    >
      <Row className="justify-content-center">
        <h2>HPP Closure Stats</h2>
        <p>Note: this only accounts for river level - not any other closures</p>
      </Row>
      <Row className="justify-content-center">
        {statusData.currentStatus ? null : (
          <p>HPP was last open on: {effectiveLastOpenDate}</p>
        )}
      </Row>
      <Row className="justify-content-center mt-4">
        <div className="text-center w-100">
          <p className="font-weight-bold mb-4">HPP has been closed for:</p>
          {[
            { days: 7, closures: statusData.closuresInLast7Days },
            { days: 28, closures: statusData.closuresInLast28Days },
            { days: 182, closures: statusData.closuresInLast182Days },
          ].map(({ days, closures }) => (
            <Row className="justify-content-center mb-3" key={days}>
              <div className="text-center w-100">
                <p>
                  <span className="font-weight-bold">{closures}</span> of the
                  last {days} days (
                  <span className="font-weight-bold">
                    {Math.round((closures / days) * 100)}
                  </span>
                  %)
                </p>
                <ProgressBar
                  variant="danger"
                  now={Math.round((closures / days) * 100)}
                  className="w-50 mx-auto"
                />
              </div>
            </Row>
          ))}
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
                    <p className="font-weight-bold mb-4">
                      Yearly Closure Trend
                    </p>
                    <table className="table table-striped table-bordered">
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
              <Accordion.Header>
                Overall Monthly Closure Percentages
              </Accordion.Header>
              <Accordion.Body>
                <Row>
                  <div className="text-center w-100">
                    <p className="font-weight-bold mb-4">
                      Overall Monthly Closure Percentages
                    </p>
                    <table className="table table-striped table-bordered">
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          <th scope="col">Overall Closure Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicData.overallMonthlyClosurePercentages.map(
                          (data) => (
                            <tr key={data.month}>
                              <td>{data.month}</td>
                              <td>
                                {data.overall_closure_percentage.toFixed(2)}
                              </td>
                            </tr>
                          )
                        )}
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
