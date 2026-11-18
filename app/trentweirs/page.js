"use client";

import { Suspense } from "react";
import Container from "react-bootstrap/Container";
import ObservedRainfall from "../../components/functional/observedRainfall";
import TrentDashboard from "../../components/functional/trentDashboard";
import PageHeader from "../../components/layout/site/PageHeader";
import StatusMessage from "../../components/layout/site/StatusMessage";

function TrentWeirsPageFallback() {
  return <StatusMessage state="loading">Loading Trent gauges…</StatusMessage>;
}

export default function TrentWeirsPage() {
  return (
    <Container fluid as="main" className="history-page text-white">
      <Container className="py-4 py-lg-5">
        <PageHeader title="Trent gauges" lead="Recent levels at gauges along the Trent, a chart to compare them, and rain recorded upstream." />
        <div className="text-center">
          <Suspense fallback={<TrentWeirsPageFallback />}>
            <TrentDashboard />
          </Suspense>
        </div>
        <ObservedRainfall />
      </Container>
    </Container>
  );
}
