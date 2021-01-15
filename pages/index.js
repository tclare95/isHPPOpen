import Head from 'next/head'
import Container from 'react-bootstrap/Container'
import TopContent from '../components/layout/topcontent'
import Header from '../components/layout/header'
import SessionBooking from '../components/layout/sessionbooking'
import EventsArea from '../components/layout/eventsarea'
import WaterQuality from '../components/layout/waterquality'
import WeirInfo from '../components/layout/weirinfo'
import Footer from '../components/layout/footer'

export default function Home() {
  return (
    <Container fluid className="bg-dark">
      <Header />
      <Container>
        <TopContent />
        <SessionBooking />
        <EventsArea />
        <WaterQuality /> 
        <WeirInfo />
      </Container>
      <Footer />
    </Container>
      )
}