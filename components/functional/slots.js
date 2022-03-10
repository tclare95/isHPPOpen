import Row from "react-bootstrap/Row";
import Slot from "./slot";

export default function Slots(props) {
  if (props.isPending) {
    return "Loading";
  }
  if (props.slotArray[0]) {
    return (
      <Row className="justify-content-center">
        {props.slotArray.map((slot, index) => (
          <Slot
            key={slot.ActivityInstanceId}
            startDate={slot.Time}
            instanceID={slot.ActivityInstanceId}
            startTime={slot.Time}
            endTime={slot.Duration}
            remaining={slot.RemainingCapacity}
            showFull={props.showFull}
          />
        ))}
      </Row>
    );
  }
  return <div>No Slots Found</div>;
}
