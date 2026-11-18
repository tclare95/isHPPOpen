"use client";

import { Fragment } from "react";
import PropTypes from "prop-types";
import { useSession } from "next-auth/react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import useFetch from "../../libs/useFetch";
import { buildNeedsAttention, classifySourceCheck, OVERVIEW_STATES } from "../../libs/operationalOverview";

const REFRESH_MS = 5 * 60 * 1000;
const STATE_STYLE = {
  [OVERVIEW_STATES.HEALTHY]: { bg: "success", label: "Healthy" },
  [OVERVIEW_STATES.DEGRADED]: { bg: "warning", text: "dark", label: "Degraded" },
  [OVERVIEW_STATES.UNAVAILABLE]: { bg: "danger", label: "Unavailable" },
  [OVERVIEW_STATES.UNKNOWN]: { bg: "secondary", label: "Unknown / not checked" },
};

const formatTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "not recorded";
  return date.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
};

function StateBadge({ state }) {
  const style = STATE_STYLE[state] ?? STATE_STYLE[OVERVIEW_STATES.UNKNOWN];
  return <Badge bg={style.bg} text={style.text}>{style.label}</Badge>;
}
StateBadge.propTypes = { state: PropTypes.string };

function Links({ links }) {
  if (!links?.length) return null;
  return (
    <ul className="list-inline small mb-0 mt-2">
      {links.map((link) => {
        const external = link.href.startsWith("http");
        return (
          <li className="list-inline-item me-3" key={link.href}>
            <a href={link.href} className="link-info" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{link.label}</a>
          </li>
        );
      })}
    </ul>
  );
}
Links.propTypes = { links: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, href: PropTypes.string })) };

const itemShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string,
  state: PropTypes.string,
  summary: PropTypes.string,
  evidenceAt: PropTypes.string,
  reasons: PropTypes.array,
  facts: PropTypes.array,
  links: PropTypes.array,
});

function NeedsAttention({ items, notChecked, checkedAt, pending }) {
  return (
    <Card bg="dark" text="light" border={items.length ? "warning" : "secondary"} className="shadow-sm">
      <Card.Body>
        <Card.Title as="h2" className="h5">Needs attention</Card.Title>
        {items.length ? (
          <ul className="list-unstyled mb-0" aria-label="Components needing attention">
            {items.map((item) => (
              <li key={item.key} className="border-top border-secondary pt-2 mt-2">
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <StateBadge state={item.state} />
                  <strong>{item.label}</strong>
                  <span className="text-secondary small">evidence: {formatTime(item.evidenceAt)}</span>
                </div>
                <div className="small mt-1">{item.reasons?.[0]?.message ?? item.summary}</div>
                {item.reasons?.length > 1 ? <div className="small text-secondary">and {item.reasons.length - 1} more reason(s) below</div> : null}
                <Links links={item.links} />
              </li>
            ))}
          </ul>
        ) : pending ? (
          <Card.Text className="text-secondary mb-0"><Spinner size="sm" /> Still checking; nothing is confirmed yet.</Card.Text>
        ) : (
          <Card.Text className="text-secondary mb-0">
            No component reports a problem in this check ({formatTime(checkedAt)}). Each component below is still
            reported separately.
          </Card.Text>
        )}
        {notChecked.length ? (
          <div className="small text-secondary mt-3">
            Not checked because they are not enabled: {notChecked.map((item) => item.label).join(", ")}.
          </div>
        ) : null}
      </Card.Body>
    </Card>
  );
}
NeedsAttention.propTypes = { items: PropTypes.arrayOf(itemShape).isRequired, notChecked: PropTypes.arrayOf(itemShape).isRequired, checkedAt: PropTypes.string, pending: PropTypes.bool };

function ComponentCard({ item }) {
  return (
    <Card bg="dark" text="light" border="secondary" className="h-100 shadow-sm">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-2">
          <Card.Title as="h3" className="h6 mb-1">{item.label}</Card.Title>
          <StateBadge state={item.state} />
        </div>
        <Card.Text className="small mb-2">{item.summary}</Card.Text>
        {item.reasons?.length ? (
          <ul className="small mb-2 ps-3">
            {item.reasons.map((entry) => <li key={entry.category}><code className="text-warning">{entry.category}</code> {entry.message}</li>)}
          </ul>
        ) : null}
        {item.facts?.length ? (
          <dl className="row small text-secondary mb-0">
            {item.facts.map((entry) => (
              <Fragment key={entry.label}>
                <dt className="col-sm-6 fw-normal">{entry.label}</dt>
                <dd className="col-sm-6 text-light mb-1">{entry.kind === "time" ? formatTime(entry.value) : String(entry.value)}</dd>
              </Fragment>
            ))}
          </dl>
        ) : null}
        <Links links={item.links} />
      </Card.Body>
    </Card>
  );
}
ComponentCard.propTypes = { item: itemShape.isRequired };

function SourceChecks({ items }) {
  return (
    <Card bg="dark" text="light" border="secondary" className="shadow-sm">
      <Card.Body>
        <Card.Title as="h2" className="h5">Live source checks</Card.Title>
        <Card.Text className="small text-secondary">Checked now by <code>/api/admin/operational-health</code>.</Card.Text>
        {items.map((item) => (
          <div className="d-flex flex-wrap justify-content-between gap-2 border-top border-secondary pt-2 mt-2" key={item.key}>
            <span>{item.label} <span className="small text-secondary">({item.sourceState ?? "no result"}; data from {formatTime(item.evidenceAt)})</span></span>
            <span><StateBadge state={item.state} /> {item.latencyMs !== null ? <span className="text-secondary small">{item.latencyMs} ms</span> : null}</span>
          </div>
        ))}
      </Card.Body>
    </Card>
  );
}
SourceChecks.propTypes = { items: PropTypes.arrayOf(itemShape).isRequired };

const loadFailure = (key, label) => ({
  key, label, state: OVERVIEW_STATES.UNKNOWN, attention: true, evidenceAt: null, links: [], facts: [],
  summary: "Could not load; these checks are unknown, not healthy.",
  reasons: [{ category: "load_failed", state: OVERVIEW_STATES.UNKNOWN, message: "Could not load; these checks are unknown, not healthy." }],
});

/** Admin operational starting point: problems first, then each job and live source separately. */
export default function OperationalOverview() {
  const { data: session } = useSession();
  const isAdmin = Boolean(session?.user?.isAdmin);
  // Live source checks keep their previous on-demand behaviour; only the cheap record read refreshes itself.
  const health = useFetch(isAdmin ? "/api/admin/operational-health" : null);
  const overview = useFetch(isAdmin ? "/api/admin/operational-overview" : null, { refreshInterval: REFRESH_MS });
  if (!isAdmin) return null;

  if (health.isPending && overview.isPending) {
    return <Card bg="dark" text="light" border="secondary"><Card.Body><Spinner size="sm" /> Checking operational state…</Card.Body></Card>;
  }

  const sourceItems = health.data?.sources?.map((source) => classifySourceCheck(source)) ?? [];
  const jobItems = overview.data?.components ?? [];
  const failures = [
    ...(health.error ? [loadFailure("load:operational-health", "Live source checks")] : []),
    ...(overview.error ? [loadFailure("load:operational-overview", "Scheduled job records")] : []),
  ];
  const everything = [...failures, ...jobItems, ...sourceItems];
  const needsAttention = buildNeedsAttention(everything);
  const notChecked = everything.filter((item) => !item.attention && item.state !== OVERVIEW_STATES.HEALTHY);

  return (
    <div className="d-grid gap-4">
      <NeedsAttention items={needsAttention} notChecked={notChecked} checkedAt={overview.data?.checkedAt ?? health.data?.checkedAt} pending={health.isPending || overview.isPending} />
      <section aria-labelledby="operational-jobs-heading">
        <h2 id="operational-jobs-heading" className="h5 text-light">Scheduled jobs and the inputs they recorded</h2>
        <p className="small text-secondary">Last-known state from existing operational records; nothing here runs a job.</p>
        {overview.isPending ? <Spinner size="sm" /> : (
          <Row className="g-3">
            {jobItems.map((item) => <Col md={6} xl={4} key={item.key}><ComponentCard item={item} /></Col>)}
          </Row>
        )}
      </section>
      {health.isPending || health.error ? null : <SourceChecks items={sourceItems} />}
    </div>
  );
}
