import { Row, ProgressBar, Container } from 'react-bootstrap';
import { useFetchedStatus } from "../../../libs/statussswrhook";

export default function StatusArea() {
    const { statusData, statusError, statusPending } = useFetchedStatus();

    if (statusPending || !statusData) {
        return <div>Loading</div>;
    }

    const currentStatus = statusData.currentStatus ? "Open" : "Closed";
    // split just the date from the datetime string
    const effectiveLastOpenDate = statusData.lastChangedDate.split('T')[0];

    return (
        <div className="mt-4 text-white text-center justify-content-center" id="stats">
            <Row className="justify-content-center">
                <h2>HPP Closure Stats</h2>
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
                        // { days: 182, closures: statusData.closuresInLast182Days },
                        // { days: 365, closures: statusData.closuresInLast365Days },
                    ].map(({ days, closures }) => (
                        <Row className="justify-content-center mb-3" key={days}>
                            <div className="text-center w-100">
                                <p>
                                    <span className="font-weight-bold">{closures}</span> of the last {days} days (<span className="font-weight-bold">{Math.round((closures/days)*100)}</span>%)
                                </p>
                                <ProgressBar variant='danger' now={Math.round((closures/days)*100)} className="w-50 mx-auto" />
                            </div>
                        </Row>
                    ))}
                </div>
            </Row>
        </div>
    );
}
