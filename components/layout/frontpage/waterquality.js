import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";

export default function WaterQuality () {
    return (
        <div className="mt-4 text-white text-center justify-content-center" id="waterquality">
            <Row className="justify-content-center">
                <h2>Water Quality</h2>
            </Row>
            <Row className="justify-content-center">
                <p>The water quality at hpp has quite the poor reputation. However quite a lot of the time, particularly in the summer, it is not that bad! To help judge what the quality will be like, the "traffic light" system next to the water level is based on the current river level and forecast levels. Please note this is only a rough indication - other factors may be in play when you paddle so take sensible precautions.</p>
            </Row>
            <Row className="justify-content-center">
                <Table bordered hover variant="dark">
                <tbody>
                    <tr><td>Bad water quality</td><td><div className="align-middle rounded-circle d-inline-block circle ml-2 mt-2 bg-danger"></div></td><td> High risk of Trent Belly! The Trent will be a lovely brown colour, with bits.</td></tr>
                    <tr><td>Poor water quality</td><td><div className="align-middle rounded-circle d-inline-block circle ml-2 mt-2 bg-warning"></div></td><td> The most common level. Drinking the water is not recommended, but there is nothing mystical about it.</td></tr>
                    <tr><td>Good Water quality</td><td><div className="align-middle rounded-circle d-inline-block circle ml-2 mt-2 bg-success"></div></td><td> Most likely in summer. The water is likely to be fairly clear, and you might even see fish!</td></tr>
                </tbody>
                </Table>
            </Row>
        </div>
    )
}