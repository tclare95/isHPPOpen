import PropTypes from "prop-types";
import { useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import StatusMessage from "../layout/site/StatusMessage";
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
import SourceHealthBadge from "./sourceHealthBadge";

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
  const [numDays, setNumDays] = useState(3);
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [selectedKeys, setSelectedKeys] = useState(getAllComparisonKeys);
  const [overviewHidden, setOverviewHidden] = useState(false);
  const { data, error, isPending } = useFetch("/api/trentweirs", SWR_15_MINUTES);
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
    <Card text="light" className="history-panel p-0 mb-4">
      <Card.Body className="py-3">
        <Row className="g-4 align-items-start mb-3">
          <Col lg={12}>
            <div className="text-center text-lg-start">
              <Stack direction="horizontal" className="justify-content-center justify-content-lg-start align-items-center gap-2 flex-wrap mb-1">
                <Card.Title className="mb-0">Explore and compare gauges</Card.Title>
                <Badge bg="secondary">{selectionCount} selected</Badge>
              </Stack>
              <div className="text-secondary small">Pick gauges here, then review the comparison workspace below.</div>
              <div className="text-secondary small">Email alerts are available for any gauge, HPP status or water quality. <a className="text-info" href="/alerts">Set up alerts</a><SourceHealthBadge health={data?.health} observedAge /></div>
            </div>
          </Col>
        </Row>

        <Row className="g-3 mb-3">
          <Col>
            <Stack direction="horizontal" className="gap-2 flex-wrap justify-content-center justify-content-lg-end">
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
            The latest reading and recent trend at each gauge. Level gauges can be added to the comparison.
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
            The selected gauges over the chosen time window.
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

  const managementSection = (
    <section className="mb-4" id="trent-manage-alerts">
      <Card text="light" className="history-panel p-0">
        <Card.Body>
          <Stack direction="horizontal" className="justify-content-between align-items-center mb-3">
            <div>
              <h2 className="h4 mb-1">Manage alerts</h2>
              <p className="text-secondary mb-0">
                Already signed up for Colwick alerts? Email yourself a secure link to review or remove them here.
              </p>
            </div>
          </Stack>
          <Row className="justify-content-center">
            <Col lg={8} xl={7}>
              <AlertManagementAccess />
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </section>
  );

  if (isPending) {
    return <StatusMessage state="loading">Loading Trent gauges…</StatusMessage>;
  }

  if (error) {
    return <StatusMessage state="error">The Trent gauge readings could not be loaded right now. Try again shortly.</StatusMessage>;
  }

  if (!data?.stations?.length) {
    return <StatusMessage state="unavailable">No Trent gauge readings are available right now.</StatusMessage>;
  }

  return (
    <>
      {controlsSection}
      {overviewHidden ? null : summarySection}
      {comparisonSection}
      {managementSection}
    </>
  );
}

TrentDashboard.propTypes = {
  initialViewMode: PropTypes.oneOf(["level", "rate", "combined"]),
};
