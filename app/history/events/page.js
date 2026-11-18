import { Suspense } from "react";
import StatusMessage from "../../../components/layout/site/StatusMessage";
import EventsExplorer from "../../../components/history/events/EventsExplorer";

export const metadata = {
  title: "High-water events | Is HPP Open",
  description: "Past periods when the observed Colwick river level was at or above HPP's 2.2 m level rule: when the river rose, its observed peak and how long it stayed high.",
};

export default function HighWaterEventsPage() {
  return (
    <Suspense fallback={<main className="history-page text-white"><div className="container py-5"><StatusMessage state="loading">Loading high-water events…</StatusMessage></div></main>}>
      <EventsExplorer />
    </Suspense>
  );
}
