"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import PageHeader from "../../components/layout/site/PageHeader";

function AlertsPageHeader() {
  // Same centred column as the panels below, so the title lines up with the content.
  return (
    <Row className="justify-content-center">
      <Col lg={8}>
        <PageHeader title="Email alerts" lead="Set up an alert, or manage the alerts you already have." />
      </Col>
    </Row>
  );
}

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
  const [busyAction, setBusyAction] = useState("");
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

  // Re-reads the list after every change, successful or not, so the page shows what is actually stored.
  async function refreshAlerts() {
    try {
      const refreshedData = await fetcher(`/api/alerts/manage?token=${encodeURIComponent(currentToken)}`);
      await mutate(refreshedData, { revalidate: false });
    } catch {
      // The change's own result is already shown; a failed refresh leaves the previous list in place.
    }
  }

  /** Sends one management change. Returns true when it succeeded. */
  async function manageAlert(alertKey, { method, action, body, fallbackError, fallbackSuccess }) {
    setBusyAlertKey(alertKey);
    setBusyAction(action);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/alerts/manage", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: currentToken, alertKey, ...body }),
      });
      const payload = await response.json();

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || fallbackError);
      }

      setSuccessMessage(payload?.data?.message || fallbackSuccess);
      return true;
    } catch (changeError) {
      setErrorMessage(changeError.message || fallbackError);
      return false;
    } finally {
      await refreshAlerts();
      setBusyAlertKey("");
      setBusyAction("");
    }
  }

  function handleRemoveAlert(alertKey) {
    return manageAlert(alertKey, { method: "DELETE", action: "remove", body: {}, fallbackError: "Unable to remove that alert right now.", fallbackSuccess: "Alert removed." });
  }

  function handleChangeAlert(alertKey, change) {
    return manageAlert(alertKey, { method: "PATCH", action: change.action, body: change, fallbackError: "Unable to change that alert right now. Nothing was changed.", fallbackSuccess: "Alert updated." });
  }

  return (
    <Container fluid as="main" className="history-page text-white">
      <Container className="text-white py-4 py-lg-5">
        <AlertsPageHeader />

        {result ? (
          <Row className="justify-content-center">
            <Col lg={8}>
              <AlertResultNotice result={result} />
            </Col>
          </Row>
        ) : null}

        {currentToken ? (
          <Row className="justify-content-center">
            <Col lg={8}>
              <section className="history-panel" aria-labelledby="alerts-yours">
                  <h2 id="alerts-yours" className="h5 mb-1">Your alerts</h2>
                  <p className="history-muted">
                    {data?.email ? `Alerts for ${data.email}. This link works for 30 minutes.` : error ? "This link could not be used." : "Loading the alerts for this link…"}
                  </p>

                  <AlertsManagementFeedback successMessage={successMessage} errorMessage={errorMessage} />
                  <AlertsManagementContent
                    data={data}
                    error={error}
                    isPending={isPending}
                    busyAlertKey={busyAlertKey}
                    busyAction={busyAction}
                    onRemove={handleRemoveAlert}
                    onChange={handleChangeAlert}
                  />
              </section>
            </Col>
          </Row>
        ) : null}

        <Row className="justify-content-center">
          <Col lg={8}>
            <section className="history-panel" aria-labelledby="alerts-create">
                <h2 id="alerts-create" className="h5 mb-2">Create an alert</h2>
                <p className="history-muted">Get an email when a Trent gauge, the Colwick forecast, HPP status or CSO water-quality risk meets a condition you choose.</p>
                <AlertsSignup />
            </section>
          </Col>
        </Row>
        <Row className="justify-content-center">
          <Col lg={8}>
            <section className="history-panel" aria-labelledby="alerts-manage">
                <h2 id="alerts-manage" className="h5 mb-2">Change, pause or stop your alerts</h2>
                <AlertManagementAccess />
            </section>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

function AlertsPageFallback() {
  return (
    <Container fluid as="main" className="history-page text-white">
      <Container className="text-white py-4 py-lg-5">
        <AlertsPageHeader />
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
