"use client";

import PropTypes from "prop-types";
import Container from "react-bootstrap/Container";
import Header from "../layout/frontpage/header";
import TopContent from "../layout/frontpage/topcontent";
import EventsArea from "../layout/frontpage/eventsarea";
import WaterQuality from "../layout/frontpage/waterquality";
import WeirInfo from "../layout/frontpage/weirinfo";
import StatusArea from "../layout/frontpage/statusarea";

export default function HomePageClient({ events, message }) {
  return (
    <Container fluid className="history-page text-white py-4">
      <Header message={message} />
      <Container>
        <TopContent cachedEvents={events} />
        <EventsArea />
        <WaterQuality />
        <WeirInfo />
        <StatusArea />
      </Container>
    </Container>
  );
}

HomePageClient.propTypes = {
  events: PropTypes.arrayOf(PropTypes.object),
  message: PropTypes.shape({
    banner_title: PropTypes.string,
    banner_message: PropTypes.string,
    banner_enabled: PropTypes.bool,
  }),
};

HomePageClient.defaultProps = {
  events: [],
  message: null,
};
