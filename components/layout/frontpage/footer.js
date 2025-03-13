import Row from "react-bootstrap/Row";
import Collapse from "react-bootstrap/Collapse";
import {useState} from "react";
import Link from "next/link";

export default function Footer () {
    const [open, setOpen] = useState(false);

    return (
        <div className="mt-4 text-light text-center justify-content-center">
            <Row className="justify-content-center bg-secondary">
                <button onClick={() => setOpen(!open)} aria-controls="footer-collapse-text" aria-expanded={open} className="text-info btn btn-link">
                    About
                </button>
                <Link href="/trentlock">Trent Lock Logging</Link>
            </Row>
            <Row className="justify-content-center bg-secondary">
                <Collapse in={open}>
                    <p id="footer-collapse-text">
                        It's often challenging to work out if HPP is open. You have to check river levels, and if there are events on at the centre. With this web app, they are brought together in one place, to make it easier to check. This app isn't a guarantee that it will be open, and has no association with the centre. The water quality is purely an indication of what water levels may be like based off prior experience - there is a huge amount of other factors at play so do not treat it as truth. Use normal precautions such as handwashing etc. <br/><br/> App has been built by <a href="https://tomclare.dev">Tom Clare</a>, using the Environment Agency flood and river level data from the real-time data API (Beta). Please contact if there any bugs, or for suggestions!
                    </p>
                </Collapse>
            </Row>
            <Row className="justify-content-center bg-secondary">
                <p>
                    This site is not associated with the NWSC Nottingham. It uses publicly available information to provide the service.
                </p>
            </Row>
        </div>
    )
}