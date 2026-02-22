"use client";

import PropTypes from "prop-types";
import Container from "react-bootstrap/Container";
import Header from "../layout/frontpage/header";
import TopContent from "../layout/frontpage/topcontent";
import EventsArea from "../layout/frontpage/eventsarea";
import WaterQuality from "../layout/frontpage/waterquality";
import WeirInfo from "../layout/frontpage/weirinfo";
import StatusArea from "../layout/frontpage/statusarea";
import Footer from "../layout/frontpage/footer";

export default function HomePageClient({ events, message }) {
  return (
    <Container fluid>
      <Header message={message?.banner_message ?? ""} />
      <Container>
        <TopContent cachedEvents={events} />
        <EventsArea />
        <WaterQuality />
        <WeirInfo />
        <StatusArea />
      </Container>
      <Footer />
    </Container>
  );
}

HomePageClient.propTypes = {
  events: PropTypes.arrayOf(PropTypes.object),
  message: PropTypes.shape({
    banner_message: PropTypes.string,
  }),
};

HomePageClient.defaultProps = {
  events: [],
  message: null,
};
