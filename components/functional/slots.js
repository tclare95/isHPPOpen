import Row from "react-bootstrap/Row";

export default function Slots (props) {
    

    if (props.isPending) {
        return ('Loading')
    }
    if(props.slotArray[0]) {
        return (
            <Row className="justify-content-center">
                {slotArray.map((slot, index) => (
               <div>
               <Slot key={slot.StartDate} startDate={slot.StartDate} startTime={slot.StartTime} endTime={slot.EndTime} remaining={slot.RemainingOnlineCapacity}/>
               </div>
           ))}
            </Row>
        )
    }
    return (
        <div>No Slots Found</div>
    )
}