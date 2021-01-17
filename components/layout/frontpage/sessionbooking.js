import Button from "react-bootstrap/Button";
import Row from "react-bootstrap/Row";
import Collapse from "react-bootstrap/Collapse";
import {useState} from "react";
import Slots from "../../functional/slots";
import { useFetchedOpenSlots } from "../../../libs/openslotswrhook"


export default function SessionBooking () {
    const [open, setOpen] = useState(false);
    const { slotArray, error, isPending } = useFetchedOpenSlots();
    let slotArrayMod = slotArray
    const handleClick = (event) => {
        setOpen(true);
        slotArrayMod = slotArray.slice(event.target.value-1)
    } 
    return (
        <div className="text-white text-center justify-content-center">
            <Row className="mt-4 justify-content-center">
                <h2>Session Booking Info</h2>
            </Row>
            <Row className="justify-content-center">
            { slotArray === undefined || slotArray.length == 0 ? <h6 className ="text-center">No Sessions Available</h6> : <a href = {"https://www.nwscnotts.com/nwsc/onlineticketing/browse/82/91/"+slotArray[0].StartDate.slice(0,10)} target="_blank" rel="noopener noreferrer"><h6 className ="text-center"> Click to go to the next session with open slots ({ new Date(slotArray[0].StartDate).toDateString()}, at {slotArray[0].StartTime})</h6></a>}
            </Row>
            <Row className="mt-2 justify-content-center">
                <h6>Find Sessions with open Slots</h6>
            </Row>
            <Row className="justify-content-center">
                <Button value="3" className="m-1" onClick={handleClick}>Next 3 Days</Button>
                <Button value="7" className="m-1" onClick={handleClick}>Next 7 Days</Button>
                <Button value="14" className="m-1" onClick={handleClick}>Next 14 Days</Button>
                <Button value="28" className="m-1" onClick={handleClick}>Next 28 Days</Button>
            </Row>
            <Row className="justify-content-center">
                <Collapse in={open}>
                    <div id="toggle-sessions-area">
                        {isPending ? 'Loading' : <Slots slotArray={slotArrayMod} isPending={isPending}/>}
                    </div>
                </Collapse>
            </Row>
        </div>
    )
}