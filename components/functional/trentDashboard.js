import PropTypes from "prop-types";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Stack from "react-bootstrap/Stack";
import { SWR_15_MINUTES } from "../../libs/dataFreshness";
import useFetch from "../../libs/useFetch";
import {
  getTrentStationKey,
  TRENT_CHART_STATIONS,
  TRENT_WEIR_BLOCKS,
} from "../../libs/trentWeirsConfig";
import AlertManagementAccess from "./alertManagementAccess";
import MultiMeasureChart from "./multimeasurechart";
import TrentWeirBlock from "./trentWeir";

const RANGE_OPTIONS = [1, 3, 7];
const VIEW_OPTIONS = [
  { id: "level", label: "Levels" },
  { id: "rate", label: "Change" },
  { id: "combined", label: "Combined" },
];

function getStationMeasure(snapshot, stationId, measureType) {
  const station = snapshot?.stations?.find((item) => item.stationId === stationId);
  return station?.measures?.[measureType] ?? null;
}

function getAllComparisonKeys() {
  return TRENT_CHART_STATIONS.map((station) => getTrentStationKey(station));
}

export default function TrentDashboard({ initialViewMode = "level" }) {
  const searchParams = useSearchParams();
  const [numDays, setNumDays] = useState(3);
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [selectedKeys, setSelectedKeys] = useState(getAllComparisonKeys);
  const [overviewHidden, setOverviewHidden] = useState(false);
  const { data, error, isPending } = useFetch("/api/trentweirs", SWR_15_MINUTES);
  const alertStatus = searchParams?.get("alertStatus");
  const alertMessage = searchParams?.get("alertMessage");

  const dashboardAlertVariant = alertStatus === "error"
    ? "danger"
    : alertStatus === "unsubscribed"
      ? "secondary"
      : "success";

  const selectedStations = useMemo(
    () => TRENT_CHART_STATIONS.filter((station) => selectedKeys.includes(getTrentStationKey(station))),
    [selectedKeys]
  );

  const selectionCount = selectedStations.length;
  const partialSelection = useMemo(
    () =>
      selectedStations.filter(
        (station) => !getStationMeasure(data, station.stationId, station.measureType ?? "level")
      ),
    [data, selectedStations]
  );

  function handleStationToggle(station) {
    const stationKey = getTrentStationKey(station);

    setSelectedKeys((currentKeys) => {
      const nextKeys = currentKeys.includes(stationKey)
        ? currentKeys.filter((key) => key !== stationKey)
        : [...currentKeys, stationKey];

      if (nextKeys.length === 0) {
        return currentKeys;
      }

      return nextKeys;
    });
  }

  function resetSelection() {
    setSelectedKeys(getAllComparisonKeys());
  }

  const controlsSection = (
    <Card bg="dark" text="light" border="secondary" className="shadow-sm mb-4">
      <Card.Body className="py-3">
        <Row className="g-3 align-items-center mb-3">
          <Col lg={5}>
            <div className="text-center text-lg-start">
              <Stack direction="horizontal" className="justify-content-center justify-content-lg-start align-items-center gap-2 flex-wrap mb-1">
                <Card.Title className="mb-0">Explore and compare gauges</Card.Title>
                <Badge bg="secondary">{selectionCount} selected</Badge>
              </Stack>
              <div className="text-secondary small">Pick gauges here, then review the comparison workspace below.</div>
              <div className="text-secondary small">Colwick now also supports live and forecast email alerts.</div>
            </div>
          </Col>
          <Col lg={7}>
            <Stack direction="horizontal" className="gap-2 flex-wrap justify-content-center justify-content-lg-end align-items-start">
              <div style={{ minWidth: "260px" }}>
                <AlertManagementAccess compact />
              </div>
              <Button size="sm" variant="outline-light" href="#trent-compare">
                Jump to comparison
              </Button>
              <Button size="sm" variant="outline-light" onClick={() => setOverviewHidden((current) => !current)}>
                {overviewHidden ? "Show overview cards" : "Hide overview cards"}
              </Button>
              <Button size="sm" variant="outline-light" onClick={resetSelection}>
                Reset to all gauges
              </Button>
            </Stack>
          </Col>
        </Row>

        <Row className="g-3 justify-content-center text-center align-items-end mb-1">
          <Col lg={4} md={6}>
            <div className="small text-uppercase text-secondary mb-2">Time window</div>
            <ButtonGroup className="w-100">
              {RANGE_OPTIONS.map((days) => (
                <Button
                  key={days}
                  variant={numDays === days ? "primary" : "outline-light"}
                  onClick={() => setNumDays(days)}
                >
                  {days}d
                </Button>
              ))}
            </ButtonGroup>
          </Col>
          <Col lg={4} md={6}>
            <div className="small text-uppercase text-secondary mb-2">Chart view</div>
            <ButtonGroup className="w-100">
              {VIEW_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  variant={viewMode === option.id ? "primary" : "outline-light"}
                  onClick={() => setViewMode(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </ButtonGroup>
          </Col>
          <Col xl={10} xs={12}>
            <div className="small text-uppercase text-secondary mb-2">Level gauges in comparison</div>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              {TRENT_CHART_STATIONS.map((station) => {
                const stationKey = getTrentStationKey(station);
                const isSelected = selectedKeys.includes(stationKey);
                return (
                  <Button
                    key={stationKey}
                    size="sm"
                    variant={isSelected ? "primary" : "outline-light"}
                    onClick={() => handleStationToggle(station)}
                    className="px-3"
                  >
                    {station.name}
                  </Button>
                );
              })}
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );

  const summarySection = (
    <section className="mb-4" id="trent-overview">
      <Stack direction="horizontal" className="justify-content-between align-items-center mb-3">
        <div>
          <h2 className="h4 mb-1">Gauge snapshots</h2>
          <p className="text-secondary mb-0">
            Quick summaries for the current shortlist, with the level gauges ready to add into the comparison view.
          </p>
        </div>
        <Badge bg="secondary">{TRENT_WEIR_BLOCKS.length} cards</Badge>
      </Stack>
      <Row className="g-4">
        {TRENT_WEIR_BLOCKS.map((station) => (
          <TrentWeirBlock
            key={getTrentStationKey(station)}
            station={station}
            measureSnapshot={getStationMeasure(data, station.stationId, station.measureType)}
            numDays={numDays}
            isSelected={selectedKeys.includes(getTrentStationKey(station))}
            onSelect={station.comparisonEnabled ? handleStationToggle : undefined}
          />
        ))}
      </Row>
    </section>
  );

  const comparisonSection = (
    <section className="mb-4" id="trent-compare">
      <Stack direction="horizontal" className="justify-content-between align-items-center mb-3">
        <div>
          <h2 className="h4 mb-1">Comparison workspace</h2>
          <p className="text-secondary mb-0">
            Use presets or toggles above to compare the gauges that matter for the day&apos;s paddling question.
          </p>
        </div>
        <Badge bg="secondary">{selectionCount} gauges</Badge>
      </Stack>
      {partialSelection.length > 0 ? (
        <Alert variant="warning">
          Some selected gauges are currently unavailable: {partialSelection.map((station) => station.name).join(", ")}.
        </Alert>
      ) : null}
      <MultiMeasureChart stations={selectedStations} stationSnapshot={data} numDays={numDays} viewMode={viewMode} />
    </section>
  );

  if (isPending) {
    return <Alert variant="secondary">Loading Trent dashboard…</Alert>;
  }

  if (error) {
    return <Alert variant="danger">Unable to load Trent dashboard data right now.</Alert>;
  }

  if (!data?.stations?.length) {
    return <Alert variant="warning">No Trent gauge data is available right now.</Alert>;
  }

  return (
    <>
      {alertStatus && alertMessage ? (
        <Alert variant={dashboardAlertVariant} className="mb-4">
          {alertMessage}
        </Alert>
      ) : null}
      {controlsSection}
      {overviewHidden ? null : summarySection}
      {comparisonSection}
    </>
  );
}

TrentDashboard.propTypes = {
  initialViewMode: PropTypes.oneOf(["level", "rate", "combined"]),
};
