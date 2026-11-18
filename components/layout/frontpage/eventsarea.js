import Collapse from "react-bootstrap/Collapse";
import { useState } from "react";
import Events from "../../functional/events";
import Button from "react-bootstrap/Button";

export default function EventsArea() {
    const [open, setOpen] = useState(false);
    return (
        <section className="history-panel text-white text-center" aria-labelledby="events-heading">
            <h2 id="events-heading" className="h4">Upcoming events</h2>
            <Button variant="outline-light" onClick={() => setOpen(!open)} aria-controls="toggle-events-area" aria-expanded={open}>
                {open ? "Hide upcoming events" : "Show upcoming events"}
            </Button>
            <Collapse in={open}>
                <div id="toggle-events-area" className="text-start">
                    <Events />
                </div>
            </Collapse>
        </section>
    );
}
