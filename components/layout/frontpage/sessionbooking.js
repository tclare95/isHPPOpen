import Button from "react-bootstrap/Button";
import Row from "react-bootstrap/Row";
import Collapse from "react-bootstrap/Collapse";
import { useState } from "react";
import Slots from "../../functional/slots";
import useSWR from "swr";
import { fetcher } from "../../../libs/fetcher";
import Form from "react-bootstrap/Form";

export default function SessionBooking() {
  const [open, setOpen] = useState(false);
  const [queryLength, setQueryLength] = useState("14");
  const [showFull, setShowFull] = useState(false);
  let isPending = true;
  const { data, error, mutate } = useSWR(
    "/api/allslots?length=" + queryLength,
    fetcher
  );
  if (data) isPending = false;
  let slotArrayMod = data;
  const handleClick = (event) => {
    setQueryLength(event.target.value);

    setOpen(true);
  };
  const handleSwitchClick = (event) => {
    setShowFull(!showFull);
  }
  return (
    <div className="text-white text-center justify-content-center">
      <Row className="mt-4 justify-content-center">
        <h2>Session Booking Info</h2>
        <p className="font-italic">
          HPP has changed their booking system. At the current time I am unable
          to link directly to book slots on their site. You can only book slots
          within the 7 days before it is due to start, and you need to be logged
          into your account on the site.
        </p>
      </Row>
      <Row className="mt-2 justify-content-center">
        <h5>Find Sessions</h5>
      </Row>
      <Row className="justify-content-center">
        <Form.Check
          type="switch"
          id="custom-switch"
          label="Show Full Sessions"
          onClick={handleSwitchClick}
        />
      </Row>
      <Row className="justify-content-center">
        <Button value="3" className="m-1" onClick={handleClick}>
          Next 3 Days
        </Button>
        <Button value="7" className="m-1" onClick={handleClick}>
          Next 7 Days
        </Button>
        <Button value="14" className="m-1" onClick={handleClick}>
          Next 14 Days
        </Button>
        <Button value="28" className="m-1" onClick={handleClick}>
          Next 28 Days
        </Button>
      </Row>
      <Row className="justify-content-center">
        <Collapse in={open}>
          <div id="toggle-sessions-area">
            {isPending ? (
              "Loading"
            ) : (
              <Slots
                slotArray={slotArrayMod}
                isPending={isPending}
                showFull={showFull}
              />
            )}
          </div>
        </Collapse>
      </Row>
    </div>
  );
}
