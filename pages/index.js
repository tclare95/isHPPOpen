import Head from 'next/head'
import Container from 'react-bootstrap/Container'
import TopContent from '../components/layout/topcontent'
import Header from '../components/layout/header'
import GraphArea from '../components/layout/grapharea'
import SessionBooking from '../components/layout/sessionbooking'
import EventsArea from '../components/layout/eventsarea'
import WaterQuality from '../components/layout/waterquality'
import WeirInfo from '../components/layout/weirinfo'

export default function Home() {
  return (
    <Container fluid className="bg-dark">
      <Header />
      <Container>
        <TopContent />
        <GraphArea />
        <SessionBooking />
        <EventsArea />
        <WaterQuality /> 
        <WeirInfo />
      </Container>
    </Container>
      )
}