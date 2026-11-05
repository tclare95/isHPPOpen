import EventDetail from "../../../../components/history/events/EventDetail";

export const metadata = {
  title: "High-water event | Is HPP Open",
  description: "An observed Colwick high-water period: its readings, observed peak and time at or above HPP's 2.2 m level rule.",
};

export default async function HighWaterEventPage({ params }) {
  const { id } = await params;
  return <EventDetail id={id} />;
}
