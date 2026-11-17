import { Suspense } from "react";
import StatusMessage from "../../components/layout/site/StatusMessage";
import HistoryExplorer from "../../components/history/HistoryExplorer";

export const metadata = {
  title: "River level history | Is HPP Open",
  description: "Explore observed Colwick river levels since 2016, time at or above HPP's 2.2 m level rule, and how today compares with past seasons.",
};

export default function HistoryPage() {
  return (
    <Suspense fallback={<main className="history-page text-white"><div className="container py-5"><StatusMessage state="loading">Loading river history…</StatusMessage></div></main>}>
      <HistoryExplorer />
    </Suspense>
  );
}
