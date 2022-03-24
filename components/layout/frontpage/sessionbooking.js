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
  const [queryLength, setQueryLength] = useState("0");
  const [showFull, setShowFull] = useState(false);
  let isPending = true;
  const { data, error, mutate } = useSWR(
    "/api/newslot?offset=" + queryLength,
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
  };

  return (
    <div id="booking" className="text-white text-center justify-content-center">
      <Row className="mt-4 justify-content-center">
        <h2>Session Booking Info</h2>
      </Row>
      <Row className="mt-0 justify-content-center">
        <p className="font-italic">
          You need to be Signed up to the HPP Website to sign up using the links
          below. They should just take you to the booking page once you log in.
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
        <Button value="0" className="m-1" onClick={handleClick}>
          Slots Today
        </Button>
        <Button value="1" className="m-1" onClick={handleClick}>
          Slots Tomorrow
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
