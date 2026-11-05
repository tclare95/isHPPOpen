import { Suspense } from "react";
import HistoryExplorer from "../../components/history/HistoryExplorer";

export const metadata = {
  title: "River level history | Is HPP Open",
  description: "Explore observed Colwick river levels since 2016, time at or above HPP's 2.2 m level rule, and how today compares with past seasons.",
};

export default function HistoryPage() {
  return (
    <Suspense fallback={<main className="history-page text-white"><p className="container py-5">Loading river history…</p></main>}>
      <HistoryExplorer />
    </Suspense>
  );
}
