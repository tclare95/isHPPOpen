import Container from 'react-bootstrap/Container'
import TopContent from '../components/layout/topcontent'
import Header from '../components/layout/header'
import SessionBooking from '../components/layout/sessionbooking'
import EventsArea from '../components/layout/eventsarea'
import WaterQuality from '../components/layout/waterquality'
import WeirInfo from '../components/layout/weirinfo'
import Footer from '../components/layout/footer'
import GraphContext from '../libs/context/graphcontrol'
import {useState} from 'react'
import Meta from '../components/meta'

export default function Home() {
  const [upperBound, setUpperBound] = useState(2.2);
  const [lowerBound, setLowerBound] = useState(1.0);
  const updateBounds = (event) => {
    const newLowerBound = parseFloat(event.target.getAttribute("data-lowerbound"));
    const newUpperBound = parseFloat(event.target.getAttribute("data-upperbound"));
    setUpperBound(newUpperBound);
    setLowerBound(newLowerBound);
  }
  return (
    <Container fluid className="bg-dark">
      <Meta />
      <Header />
      <GraphContext.Provider
        value={{
          upperBound,
          lowerBound,
          updateBounds
        }}
      >
      <Container>
        <TopContent />
        <SessionBooking />
        <EventsArea />
        <WaterQuality /> 
        <WeirInfo />
      </Container>
      </GraphContext.Provider>
      <Footer />
    </Container>
      )
}