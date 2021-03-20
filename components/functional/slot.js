import Col from "react-bootstrap/Col";

export default function Slot (props) {
    let colClass
       if(props.remaining === 0) {
           colClass = "col-2 border  border-danger  m-1 bg-danger text-white rounded justify-content-center"
       } else if (props.remaining > 0 && props.remaining <= 8) {
           colClass = "col-2 border  border-warning m-1 bg-warning text-white rounded justify-content-center"
       } else {
            colClass = "col-2 border border-light m-1 bg-light text-dark rounded justify-content-center"
       };
       const day = new Date( Date.parse(props.startDate));
    return (
       <Col className={colClass}>
                <div className="text-center">
                <h5 className="eventText">{day.toDateString()}</h5>
                </div>
                <div className="text-center">
                <p className="eventText"><span className="font-italic">Start Time:</span> {day.toLocaleTimeString()} <br/> Remaining slots: {props.remaining} </p>
                </div>
                {props.remaining ? 
                
                <a className="btn btn-sm btn-primary m-1" target="_blank"  rel="noopener noreferrer" href="https://www.nwscnotts.com/nwsc/bookingscentre/index">Click Here to Book</a> : <div></div> 
                }

            </Col>
    )
}