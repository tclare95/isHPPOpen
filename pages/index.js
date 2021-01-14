import Head from 'next/head'
import Container from 'react-bootstrap/Container'
import TopContent from '../components/layout/topcontent'
import Header from '../components/layout/header'

export default function Home() {
  return (
    <Container fluid className="bg-dark">
      <Header />
      <Container>
        <TopContent />
      </Container>
    </Container>
      )
}
