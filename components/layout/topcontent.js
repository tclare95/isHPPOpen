import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'

export default function TopContent () {
    return (
        <div className="text-white text-center">
        <Row className="justify-content-center">
          <Col className="text-center">
            <h1>Is HPP Open?</h1>
            <h2>HPP is Closed</h2>
          </Col>
        </Row>
        <Row className="justify-content-center">
            <h3>The River Level is over 4000</h3>
        </Row>
        <Row className="justify-content-center ">
            <p> 
                The river level data is 1000 hours old. Generally HPP white water course is open below 2.2 meters on the gauge. Check the graph below for trends and a 36 hour river level forecast.
            </p>
            <p>
                If the level is close to the cuttoff, or if you want to be doubly sure, call the WWC on 0115 982 1212 
            </p>
            <p>
                Check below the graph for details about the availability of slots during sessions, and events that may affect the status of the course.
            </p>
        </Row>
        </div>
    )
}