"use client";

import { useSession } from "next-auth/react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import useFetch from "../../libs/useFetch";

export default function OperationalHealthSummary() {
  const { data: session } = useSession();
  const { data, error, isPending } = useFetch(session ? "/api/admin/operational-health" : null);
  if (!session) return null;
  if (isPending) return <Card bg="dark" text="light" border="secondary"><Card.Body><Spinner size="sm" /> Checking operational sources…</Card.Body></Card>;
  if (error) return <Alert variant="warning">Operational health is unavailable right now.</Alert>;
  return <Card bg="dark" text="light" border="secondary"><Card.Body><Card.Title>Operational data health</Card.Title>{data?.sources?.map((source) => <div className="d-flex justify-content-between border-top border-secondary pt-2 mt-2" key={source.name}><span>{source.name}</span><span><Badge bg={source.health?.state === "fresh" ? "success" : "warning"}>{source.health?.state || "unavailable"}</Badge> <span className="text-secondary small">{source.latencyMs} ms</span></span></div>)}</Card.Body></Card>;
}
