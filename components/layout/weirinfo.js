import Row from "react-bootstrap/Row";
import Accordion from "react-bootstrap/Accordion"
import Card from "react-bootstrap/Card"
import ListGroup from "react-bootstrap/ListGroup"
import Button from "react-bootstrap/Button"

export default function WeirInfo () {
    return (
        <div className="mt-4 text-white text-center justify-content-center" id="weirs">
            <Row className="justify-content-center">
                <h2>Trent Weirs</h2>
                <h6>When the Trent is at the correct level for a weir to work, it will be displayed below the level at the top of the page. Check out info about parking, levels etc below.</h6>
                <h6>Weirs can be dangerous! Always check them yourself before committing!</h6>
            </Row>
            <Accordion className="bg-secondary">
                <Card className="bg-dark">
                    <Card.Header className="bg-secondary">
                        <Accordion.Toggle as={Button} variant="link" eventKey="0" className="text-left">
                           Newark Weir
                        </Accordion.Toggle>
                    </Card.Header>
                    <Accordion.Collapse eventKey="0">
                    <Card.Body>
                        <Card.Title>Newark Weir</Card.Title>
                        <Card.Text>A friendly green wave in low levels, it builds gradually, eventually turning into a sticky walled in monster when it gets too high. Look before you leap! Very grotty and dirty water - keep an eye out for stuff floating in the eddies!</Card.Text>
                    
                    <ListGroup className="bg-dark">
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Water Levels</span> 1.9m - 2.4m</ListGroup.Item>
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Location: </span>Parking on a small area of rough ground after a bridge over the river. Get in after crossing the bridges on river left. <a href="https://www.google.co.uk/maps/place/53%C2%B004'29.6%22N+0%C2%B049'03.1%22W/" target="_blank" rel="noopener noreferrer">Google Maps Link</a></ListGroup.Item>
                        <a href = "#chart" role="button" className="btn btn-sm btn-primary m-1" data-lowerbound="1.9" data-upperbound="2.4" >Show level guides on graph</a>
                    </ListGroup>
                    </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion> 
        </div>
    )
}