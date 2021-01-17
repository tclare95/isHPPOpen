const currentTime = new Date();
import {useFetchedLevels} from '../../libs/levelsswrhook'
import {useFetchedEvents} from '../../libs/eventsswrhook'


export default function OpenTitle () {
    const { levelData, error, isPending } = useFetchedLevels();
    const { eventData, eventError, eventIsPending } = useFetchedEvents();

    if (error || eventError) {
        return (
            <div>
                Error Loading
            </div>
        )
    }
    
    if (isPending || eventIsPending) {
        return (
            <div>
                Loading
            </div>
        )
    }

    //pull the event array, check if the current date falls between two events
    let checkvalue = false
    eventData.forEach(element => {
        let endDate
        endDate = new Date(element.event_end_date);
        let startDate
        startDate = new Date(element.event_start_date)
        if(currentTime <= endDate && currentTime >= startDate) {
            checkvalue = true
        } 
    });
    if (checkvalue) {
        return(
        <h2 className="font-weight-bold m-3">HPP is <span className="text-danger">Closed</span> for an event</h2>
        )
    }
    //check if the most recent recorded river level is >2.2m
    if(levelData.level_data[0].reading_level > 2.2) {
        return (
            <h2 className="font-weight-bold m-3">HPP is <span className="text-danger">Closed</span> because of water levels</h2>
        )
    }

    
    return (
        <h2 className="font-weight-bold m-3">HPP is (probably) <span className="text-success">Open</span><br/> <small className="font-weight-light font-italic text-muted">For prebooked sessions only</small></h2>
    )
}