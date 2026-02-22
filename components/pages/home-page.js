'use client';

import { useState } from 'react';
import Container from 'react-bootstrap/Container';
import Header from '../layout/frontpage/header';
import TopContent from '../layout/frontpage/topcontent';
import EventsArea from '../layout/frontpage/eventsarea';
import WaterQuality from '../layout/frontpage/waterquality';
import WeirInfo from '../layout/frontpage/weirinfo';
import StatusArea from '../layout/frontpage/statusarea';
import Footer from '../layout/frontpage/footer';
import GraphContext from '../../libs/context/graphcontrol';

export default function HomePage({ events, message }) {
  const [upperBound, setUpperBound] = useState(2.2);
  const [lowerBound, setLowerBound] = useState(1.0);

  const updateBounds = (event) => {
    const newLowerBound = parseFloat(event.target.getAttribute('data-lowerbound'));
    const newUpperBound = parseFloat(event.target.getAttribute('data-upperbound'));
    setUpperBound(newUpperBound);
    setLowerBound(newLowerBound);
  };

  return (
    <Container fluid>
      <Header message={message.banner_message} />
      <GraphContext.Provider value={{ upperBound, lowerBound, updateBounds }}>
        <Container>
          <TopContent cachedEvents={events} />
          <EventsArea />
          <WaterQuality />
          <WeirInfo />
          <StatusArea />
        </Container>
      </GraphContext.Provider>
      <Footer />
    </Container>
  );
}
