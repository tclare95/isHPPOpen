"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import AlertManagementAccess from "../../components/functional/alertManagementAccess";
import AlertResultNotice from "../../components/functional/alertResultNotice";
import AlertsSignup from "../../components/functional/alertsSignup";
import {
  AlertsManagementContent,
  AlertsManagementFeedback,
} from "../../components/functional/alertsManager";
import { fetcher } from "../../libs/fetcher";
import useFetch from "../../libs/useFetch";

// Each management read replaces the link's token, so the first token must be read exactly once:
// a focus/reconnect revalidation with it would fail and hide a working session behind an error.
const MANAGE_FETCH_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false, shouldRetryOnError: false };

function AlertsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";
  const result = searchParams?.get("result") || "";
  const [requestToken] = useState(token);
  const [currentToken, setCurrentToken] = useState(token);
  const [busyAlertKey, setBusyAlertKey] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const managePath = useMemo(
    () => (requestToken ? `/api/alerts/manage?token=${encodeURIComponent(requestToken)}` : null),
    [requestToken]
  );
  const { data, error, isPending, mutate } = useFetch(managePath, MANAGE_FETCH_OPTIONS);

  useEffect(() => {
    const nextToken = data?.manageToken;

    if (!nextToken || nextToken === currentToken) {
      return;
    }

    setCurrentToken(nextToken);
    router.replace(`/alerts?token=${encodeURIComponent(nextToken)}`, { scroll: false });
  }, [currentToken, data?.manageToken, router]);

  async function handleRemoveAlert(alertKey) {
    setBusyAlertKey(alertKey);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/alerts/manage", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: currentToken, alertKey }),
      });
      const payload = await response.json();

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || "Unable to remove that alert right now.");
      }

      setSuccessMessage(payload?.data?.message || "Alert removed.");
      const refreshedData = await fetcher(`/api/alerts/manage?token=${encodeURIComponent(currentToken)}`);
      await mutate(refreshedData, { revalidate: false });
    } catch (removeError) {
      setErrorMessage(removeError.message || "Unable to remove that alert right now.");
    } finally {
      setBusyAlertKey("");
    }
  }

  return (
    <Container fluid className="bg-dark min-vh-100">
      <Container className="text-white py-4">
        <Row className="mb-4">
          <Col className="text-center">
            <h1>Alerts Centre</h1>
            <Link href="/trentweirs" className="text-info">← Back to Trent Dashboard</Link>
          </Col>
        </Row>

        {result ? (
          <Row className="justify-content-center">
            <Col lg={8}>
              <AlertResultNotice result={result} />
            </Col>
          </Row>
        ) : null}

        {currentToken ? (
          <Row className="justify-content-center mb-4">
            <Col lg={8}>
              <Card bg="dark" text="light" border="secondary" className="shadow-sm">
                <Card.Body>
                  <Card.Title className="mb-1">Your alerts</Card.Title>
                  <Card.Text className="text-secondary">
                    {data?.email ? `Alerts for ${data.email}. This link works for 30 minutes.` : error ? "This link could not be used." : "Loading the alerts for this link…"}
                  </Card.Text>

                  <AlertsManagementFeedback successMessage={successMessage} errorMessage={errorMessage} />
                  <AlertsManagementContent
                    data={data}
                    error={error}
                    isPending={isPending}
                    busyAlertKey={busyAlertKey}
                    onRemove={handleRemoveAlert}
                  />
                </Card.Body>
              </Card>
            </Col>
          </Row>
        ) : null}

        <Row className="justify-content-center mb-4">
          <Col lg={8}>
            <Card bg="dark" text="light" border="secondary" className="shadow-sm">
              <Card.Body>
                <Card.Title className="mb-3">Create an alert</Card.Title>
                <Card.Text className="text-secondary">Get an email when a Trent gauge, the Colwick forecast, HPP status or CSO water-quality risk meets a condition you choose.</Card.Text>
                <AlertsSignup />
              </Card.Body>
            </Card>
          </Col>
        </Row>
        <Row className="justify-content-center mb-4">
          <Col lg={8}>
            <Card bg="dark" text="light" border="secondary" className="shadow-sm">
              <Card.Body>
                <Card.Title className="mb-3">Review or stop your alerts</Card.Title>
                <AlertManagementAccess />
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

function AlertsPageFallback() {
  return (
    <Container fluid className="bg-dark min-vh-100">
      <Container className="text-white py-4">
        <Row className="mb-4">
          <Col className="text-center">
            <h1>Alerts Centre</h1>
            <Link href="/trentweirs" className="text-info">← Back to Trent Dashboard</Link>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<AlertsPageFallback />}>
      <AlertsPageContent />
    </Suspense>
  );
}
