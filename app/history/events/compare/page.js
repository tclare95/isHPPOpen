import { Suspense } from "react";
import StatusMessage from "../../../../components/layout/site/StatusMessage";
import EventComparison from "../../../../components/history/events/EventComparison";

export const metadata = {
  title: "Compare high-water events | Is HPP Open",
  description: "Compare two observed Colwick high-water events: overlaid river level readings, highest levels, rise and recovery, and time at or above HPP's 2.2 m level rule.",
};

export default function CompareHighWaterEventsPage() {
  return (
    <Suspense fallback={<main className="history-page text-white"><div className="container py-5"><StatusMessage state="loading">Loading comparison…</StatusMessage></div></main>}>
      <EventComparison />
    </Suspense>
  );
}
