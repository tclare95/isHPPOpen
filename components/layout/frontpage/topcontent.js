import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from "react-bootstrap/Button";
import OpenTitle from '../../functional/opentitle';
import {useFetchedLevels} from '../../../libs/levelsswrhook'
import VomitFactor from '../../functional/vomitfactor';
import WeirLevels from '../../functional/weirlevels';
import ChartRender from '../../functional/chart';

import { useContext } from 'react';
import GraphContext from '../../../libs/context/graphcontrol';

const currentTime = new Date();

export default function TopContent (props) {
    const { levelData, error, isPending } = useFetchedLevels();
    let readingTime = new Date()
    // fixes a weird bug with the time since last reading jumping to large negative values
    let recentLevel
    if (!isPending) {
        readingTime = new Date(levelData.level_data[0].reading_date)
        recentLevel = levelData.level_data[0].reading_level
        
    }
    const {upperBound, lowerBound, updateBounds} = useContext(GraphContext)
    return (
        <div className="text-white text-center">
        <Row className="justify-content-center">
          <Col className="text-center">
            <h1>Is HPP Open?</h1>
            <OpenTitle cachedEvents = {props.cachedEvents}/>
          </Col>
        </Row>
        <Row className="justify-content-center">
            <h3>The River Level is {isPending ? 'Loading' : (Math.round((recentLevel + Number.EPSILON)*100) / 100).toFixed(2)}M</h3><a href="#waterquality"><VomitFactor currentLevel = {isPending ? 'Loading' : levelData.level_data[0].reading_level}/></a>
        </Row>
        <Row className="justify-content-center">
            {isPending ? <div className="d-none"></div> : <WeirLevels currentLevel={recentLevel}/>}
        </Row>
        <Row className="justify-content-center ">
            <p> 
                The river level data is {isPending ? 'Loading' : Math.floor(((currentTime.getTime() - readingTime.getTime())/1000/60/60))} hours old. Generally HPP white water course is open below 2.2 meters on the gauge. Check the graph below for trends and a 36 hour river level forecast.
            </p>
            <p>
                If the level is close to the cuttoff, or if you want to be doubly sure, call the WWC on 0115 982 1212 
            </p>
            <p>
                Check below the graph for details about the availability of slots during sessions, and events that may affect the status of the course.
            </p>
        </Row>
        <Row className="justify-content-center text-white mt-2" id="chart">
            <Col className="justify-content-center text-center">
                {isPending ? 'Loading' :<ChartRender lowerBound = {lowerBound} upperBound = {upperBound}  graphData = {levelData.level_data} graphForeCastData = {levelData.forecast_data}/>}
                <Button className=" mt-2" data-lowerbound="1.01" data-upperbound="2.2" onClick={updateBounds}>Reset graph to HPP guidelines</Button>
            </Col>
        </Row>
        </div>
    )
}