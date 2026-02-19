import Container from "react-bootstrap/Container";
import TopContent from "../components/layout/frontpage/topcontent";
import Header from "../components/layout/frontpage/header";
import EventsArea from "../components/layout/frontpage/eventsarea";
import WaterQuality from "../components/layout/frontpage/waterquality";
import WeirInfo from "../components/layout/frontpage/weirinfo";
import Footer from "../components/layout/frontpage/footer";
import Link from "next/link";
import GraphContext from "../libs/context/graphcontrol";
import { useState } from "react";
import Meta from "../components/meta";
import { connectToDatabase } from "../libs/database";
import StatusArea from "../components/layout/frontpage/statusarea";

export default function Home(props) {
  // Set state for bounds for river level graph
  const [upperBound, setUpperBound] = useState(2.2);
  const [lowerBound, setLowerBound] = useState(1.0);
  // Top level event handler for updating the guidelines on the river level graph.
  const updateBounds = (event) => {
    const newLowerBound = parseFloat(
      event.target.getAttribute("data-lowerbound")
    );
    const newUpperBound = parseFloat(
      event.target.getAttribute("data-upperbound")
    );
    setUpperBound(newUpperBound);
    setLowerBound(newLowerBound);
  };
  return (
    <Container fluid >
      <Meta title="Is HPP Open" />
      <Header message={props.message.banner_message} />
      <GraphContext.Provider
        value={{
          upperBound,
          lowerBound,
          updateBounds,
        }}
      >
        <Container>
          <TopContent cachedEvents={props.data} />
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

export async function getStaticProps() {
  let cleanedData = [];
  let cleanedData2 = { banner_message: "" };

  try {
    // Static caching of events
    const { db } = await connectToDatabase();
    let now = null;
    now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() - 1);
    const collection = await db.collection("eventschemas");
    const data = await collection
      .find({ event_end_date: { $gte: tomorrow } })
      .limit(5)
      .toArray();
    cleanedData = JSON.parse(JSON.stringify(data));

    // get the site message for the banner
    const collection2 = await db.collection("sitebannerschemas");
    const data2 = await collection2.findOne();
    if (data2) {
      cleanedData2 = JSON.parse(JSON.stringify(data2));
    }
  } catch (error) {
    console.error("Failed to load static home page data", error);
  }

  // Revalidate = time before next re-renders the page in seconds = 30 minutes
  return { props: { data: cleanedData, message: cleanedData2 }, revalidate: 900 };
}
