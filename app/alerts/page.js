"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Stack from "react-bootstrap/Stack";
import AlertManagementAccess from "../../components/functional/alertManagementAccess";
import {
  AlertsManagementContent,
  AlertsManagementFeedback,
} from "../../components/functional/alertsManager";
import { fetcher } from "../../libs/fetcher";
import useFetch from "../../libs/useFetch";

function AlertsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";
  const [requestToken] = useState(token);
  const [currentToken, setCurrentToken] = useState(token);
  const [busyAlertKey, setBusyAlertKey] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const managePath = useMemo(
    () => (requestToken ? `/api/alerts/manage?token=${encodeURIComponent(requestToken)}` : null),
    [requestToken]
  );
  const { data, error, isPending, mutate } = useFetch(managePath);

  useEffect(() => {
    const nextToken = data?.manageToken;

    if (!nextToken || nextToken === currentToken) {
      return;
    }

    setCurrentToken(nextToken);
    router.replace(`/alerts?token=${encodeURIComponent(nextToken)}`);
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
            <h1>Manage Colwick Alerts</h1>
            <Link href="/trentweirs" className="text-info">← Back to Trent Dashboard</Link>
          </Col>
        </Row>

        <Row className="justify-content-center mb-4">
          <Col lg={8}>
            <Card bg="dark" text="light" border="secondary" className="shadow-sm">
              <Card.Body>
                <Card.Title className="mb-3">Email me a management link</Card.Title>
                <AlertManagementAccess />
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {currentToken ? (
          <Row className="justify-content-center">
            <Col lg={8}>
              <Card bg="dark" text="light" border="secondary" className="shadow-sm">
                <Card.Body>
                  <Stack direction="horizontal" className="justify-content-between align-items-center mb-3">
                    <div>
                      <Card.Title className="mb-1">Your current Colwick alerts</Card.Title>
                      <Card.Text className="text-secondary mb-0">
                        {data?.email ? `Signed in as ${data.email}` : "Use the link from your email to manage alerts."}
                      </Card.Text>
                    </div>
                  </Stack>

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
            <h1>Manage Colwick Alerts</h1>
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