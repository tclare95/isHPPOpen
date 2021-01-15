import Row from "react-bootstrap/Row";
import Accordion from "react-bootstrap/Accordion"
import Card from "react-bootstrap/Card"
import ListGroup from "react-bootstrap/ListGroup"
import { useContext } from "react";
import GraphContext from '../../libs/context/graphcontrol'

export default function WeirInfo () {
    const {upperBound, lowerBound, updateBounds} = useContext(GraphContext)

    return (
        <div className="mt-4 text-white text-center justify-content-center" id="weirs">
            <Row className="justify-content-center mb-3">
                <h2>Trent Weirs</h2>
                <h6>When the Trent is at the correct level for a weir to work, it will be displayed below the level at the top of the page. Check out info about parking, levels etc below.</h6>
                <h6>Weirs can be dangerous! Always check them yourself before committing!</h6>
            </Row>
            <Accordion className="bg-secondary">
                <Card className="bg-dark">
                    <Accordion.Toggle as={Card.Header} eventKey="0" className="bg-secondary ">
                      <span className="text-info">Newark Weir</span> 
                    </Accordion.Toggle>
                    
                    <Accordion.Collapse eventKey="0">
                    <Card.Body>
                        <Card.Title>Newark Weir</Card.Title>
                        <Card.Text>A friendly green wave in low levels, it builds gradually, eventually turning into a sticky walled in monster when it gets too high. Look before you leap! Very grotty and dirty water - keep an eye out for stuff floating in the eddies!</Card.Text>
                    
                    <ListGroup className="bg-dark">
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Water Levels</span> 1.9m - 2.4m</ListGroup.Item>
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Location: </span>Parking on a small area of rough ground after a bridge over the river. Get in after crossing the bridges on river left. <a href="https://www.google.co.uk/maps/place/53%C2%B004'29.6%22N+0%C2%B049'03.1%22W/" target="_blank" rel="noopener noreferrer">Google Maps Link</a></ListGroup.Item>
                        <a href = "#chart" role="button" className="btn btn-sm btn-primary m-1" data-lowerbound="1.9" data-upperbound="2.4" onClick={updateBounds}>Show level guides on graph</a>
                    </ListGroup>
                    </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
            <Accordion className="bg-secondary">
                <Card className="bg-dark">
                    <Accordion.Toggle as={Card.Header} eventKey="0" className="bg-secondary ">
                      <span className="text-info">Trent Lock</span> 
                    </Accordion.Toggle>
                    
                    <Accordion.Collapse eventKey="0">
                    <Card.Body>
                        <Card.Title>Trent Lock</Card.Title>
                        <Card.Text>A big green fast wave that you can front surf and carve around on to your hearts content. As the river rises it gets more of a pile, but is a bit finicky in shorter boats. As it only comes in when the Trent is in flood, watch out for debris.</Card.Text>
                    
                    <ListGroup className="bg-dark">
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Water Levels</span> 2.85m - 3.6m Towards the lower end of the range, long boats are better. If the river is falling, it can change.</ListGroup.Item>
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Location: </span>Parking at the Trent Lock inn. Get on, and paddle down the main Trent, go past the bouys (on the left) and under the bridges. You should see the wave. <a href="https://www.google.co.uk/maps/place/53%C2%B004'29.6%22N+0%C2%B049'03.1%22W/" target="_blank" rel="noopener noreferrer">Google Maps Link</a></ListGroup.Item>
                        <a href = "#chart" role="button" className="btn btn-sm btn-primary m-1" data-lowerbound="2.85" data-upperbound="3.6" onClick={updateBounds}>Show level guides on graph</a>
                    </ListGroup>
                    </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
            <Accordion className="bg-secondary">
                <Card className="bg-dark">
                    <Accordion.Toggle as={Card.Header} eventKey="0" className="bg-secondary ">
                      <span className="text-info">Sawley Weir</span> 
                    </Accordion.Toggle>
                    
                    <Accordion.Collapse eventKey="0">
                    <Card.Body>
                        <Card.Title>Sawley Weir</Card.Title>
                        <Card.Text>A big wave that comes in when Trent Lock is too high. As it only comes in when the Trent is in flood, watch out for debris.</Card.Text>
                    
                    <ListGroup className="bg-dark">
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Water Levels</span>  3.5m+ Towards the lower end of the range, long boats are better.</ListGroup.Item>
                        <ListGroup.Item className="bg-dark"><span className="font-weight-bold">Location: </span>To be added <a href="https://www.google.co.uk/maps/place/52%C2%B052'35.6%22N+1%C2%B016'25.9%22W/" target="_blank" rel="noopener noreferrer">Google Maps Link</a></ListGroup.Item>
                        <a href = "#chart" role="button" className="btn btn-sm btn-primary m-1" data-lowerbound="3.5" data-upperbound="5" onClick={updateBounds}>Show level guides on graph</a>
                    </ListGroup>
                    </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion> 
        </div>
    )
}