// Subscriber experience (Wave A, A3): signup states what triggers an alert and what can delay it, failures never
// read as active subscriptions, management links show only their own alerts, and emails carry the safety note.
// The email provider (`fetch`) and database are doubles; nothing is sent.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeDb } from "../testUtils/fakeMongo";
import AlertsSignup from "../components/functional/alertsSignup";
import AlertResultNotice, { ALERT_RESULT_COPY } from "../components/functional/alertResultNotice";
import { AlertsManagementContent } from "../components/functional/alertsManager";
import { alertDescriptionOf, alertRepeatOf } from "../libs/alerts/alertDescriptions";

jest.mock("server-only", () => ({}));
jest.mock("../libs/database");
jest.mock("../libs/services/alertMailerService", () => ({
  ...jest.requireActual("../libs/services/alertMailerService"),
  sendAlertConfirmationEmail: jest.fn(),
  sendManageAlertsAccessEmail: jest.fn(),
}));

const { connectToDatabase } = require("../libs/database");
const { sendManageAlertsAccessEmail } = require("../libs/services/alertMailerService");
const mailer = jest.requireActual("../libs/services/alertMailerService");
const { createColwickAlertSubscription, requestColwickAlertManagementLink, listColwickAlertsForManagement, deleteManagedColwickAlert } = require("../libs/services/colwickAlertsService");

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
});

describe("rule descriptions", () => {
  test("state the location, threshold and unit, and how the alert repeats", () => {
    expect(alertDescriptionOf({ gaugeKey: "4009-level", gaugeName: "Colwick", source: "live", direction: "above", threshold: 1.5 }))
      .toBe("We will email you when the Colwick reading rises to or above 1.50 m.");
    expect(alertDescriptionOf({ gaugeKey: "4009-level", gaugeName: "Colwick", source: "forecast", direction: "above", threshold: 1.5 }))
      .toBe("We will email you when the Colwick forecast predicts 1.50 m or higher.");
    expect(alertDescriptionOf({ gaugeKey: "4007-flow", measureType: "flow", gaugeName: "Shardlow (Flow)", source: "live", direction: "below", threshold: 40 }))
      .toContain("drops to or below 40.00 cumecs");
    expect(alertDescriptionOf({ alertType: "water_quality", riskLevel: "amber" })).toBe("We will email you when CSO risk reaches amber or red.");
    expect(alertRepeatOf({ gaugeKey: "4009-level", source: "live" })).toContain("3 cm");
    expect(alertRepeatOf({ alertType: "hpp_status", desiredStatus: "open" })).toContain("reported closed");
  });
});

describe("signup form", () => {
  test("explains the trigger and the limits before subscribing", async () => {
    const user = userEvent.setup();
    render(<AlertsSignup />);

    expect(screen.getByText("We will email you when the Colwick reading rises to or above 1.50 m.")).toBeInTheDocument();
    expect(screen.getByText(/stale or unavailable source data can delay or prevent an alert/)).toBeInTheDocument();
    expect(screen.getByText(/not a guarantee of river access or water safety/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("What should we watch?"), "hpp_status");
    expect(screen.getByText("We will email you when HPP is reported open.")).toBeInTheDocument();
  });

  test("a failed request says that no alert was activated", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: { message: "Too many alert requests. Please try again later." } }) });
    const user = userEvent.setup();
    render(<AlertsSignup />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Save email alert" }));

    expect(await screen.findByText("Too many alert requests. Please try again later. No new alert has been activated.")).toBeInTheDocument();
  });

  test("a non-Colwick gauge never submits a forecast rule", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { message: "Almost done." } }) });
    const user = userEvent.setup();
    render(<AlertsSignup />);

    await user.selectOptions(screen.getByLabelText("Rule"), "forecast");
    await user.selectOptions(screen.getByLabelText("Gauge"), "4007-flow");
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Save email alert" }));

    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({ gaugeKey: "4007-flow", source: "live" });
    expect(await screen.findByText("Almost done.")).toBeInTheDocument();
  });
});

describe("result notices", () => {
  test("only known result codes render, with fixed copy", () => {
    const { rerender, container } = render(<AlertResultNotice result="confirmed" />);
    expect(screen.getByRole("status")).toHaveTextContent("Alert confirmed. It is now active");

    rerender(<AlertResultNotice result="confirm_invalid" />);
    expect(screen.getByRole("status")).toHaveTextContent("nothing was activated");

    rerender(<AlertResultNotice result="Your alert is active" />);
    expect(container).toBeEmptyDOMElement();
    expect(Object.keys(ALERT_RESULT_COPY).sort()).toEqual([...mailer.ALERT_RESULTS].sort());
  });
});

describe("management view", () => {
  const base = { alertKey: "a", gaugeName: "Colwick", description: "We will email you when the Colwick reading rises to or above 1.50 m.", createdAt: "2026-11-01T00:00:00.000Z" };
  const renderContent = (props) => render(<AlertsManagementContent isPending={false} busyAlertKey="" onRemove={jest.fn()} {...props} />);

  test("distinguishes active alerts from unconfirmed or expired ones", () => {
    renderContent({ data: { alerts: [
      { ...base, alertKey: "a", status: "active" },
      { ...base, alertKey: "b", status: "pending_confirmation", confirmationExpired: false },
      { ...base, alertKey: "c", status: "pending_confirmation", confirmationExpired: true },
    ] } });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Not active: awaiting confirmation")).toBeInTheDocument();
    expect(screen.getByText("Not active: confirmation expired")).toBeInTheDocument();
    expect(screen.getAllByText(/none yet/)).toHaveLength(3);
  });

  test("an unusable link gives a recovery step, not a raw error", () => {
    renderContent({ error: Object.assign(new Error("whatever the server said"), { status: 404 }) });
    expect(screen.getByText("This management link has expired or has already been used. Request a new link below.")).toBeInTheDocument();
    expect(screen.queryByText("whatever the server said")).not.toBeInTheDocument();
  });
});

describe("management links reveal only their own subscriber's alerts", () => {
  test("listing and stopping are scoped to the link's email address", async () => {
    const fake = createFakeDb();
    connectToDatabase.mockResolvedValue({ db: fake.db });
    const now = new Date("2026-11-17T12:00:00.000Z");
    const created = new Date("2026-11-16T10:00:00.000Z");
    for (const email of ["me@example.com", "someone@example.com"]) {
      await createColwickAlertSubscription({ email, gaugeKey: "4009-level", source: "live", direction: "above", threshold: 1.5 }, { now: created });
    }
    const other = fake.docs("alertSubscriptions").find((doc) => doc.email === "someone@example.com");

    await requestColwickAlertManagementLink("me@example.com", { now });
    const { manageToken } = sendManageAlertsAccessEmail.mock.calls[0][0];
    const view = await listColwickAlertsForManagement(manageToken, { now: new Date("2026-11-17T12:05:00.000Z") });

    expect(view.email).toBe("me@example.com");
    expect(view.alerts).toHaveLength(1);
    expect(view.alerts[0]).toMatchObject({ status: "pending_confirmation", confirmationExpired: true });
    expect(JSON.stringify(view)).not.toContain("someone@example.com");
    expect(JSON.stringify(view)).not.toMatch(/unsubscribeToken|confirmationTokenHash/);

    await expect(deleteManagedColwickAlert({ token: view.manageToken, alertKey: other.alertKey }, { now: new Date("2026-11-17T12:06:00.000Z") }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(fake.docs("alertSubscriptions").find((doc) => doc.email === "someone@example.com").status).toBe("pending_confirmation");
    // The emailed link was replaced when it was used.
    await expect(listColwickAlertsForManagement(manageToken, { now: new Date("2026-11-17T12:07:00.000Z") })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("alert emails", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, RESEND_API_KEY: "test-key", ALERTS_FROM_EMAIL: "alerts@example.com", SITE_URL: "https://example.test" };
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });
  afterEach(() => { process.env = originalEnv; });
  const sentText = () => JSON.parse(globalThis.fetch.mock.calls[0][1].body).text;

  test("a status alert shows its status, the safety note and how to manage alerts", async () => {
    await mailer.sendThresholdAlertEmail({ email: "user@example.com", alertType: "hpp_status", gaugeName: "HPP opens", source: "status", observedValue: null, observedLabel: "open",
      observedAt: "2026-11-17T12:00:00.000Z", unsubscribeToken: "u", ruleDescription: "We will email you when HPP is reported open.", idempotencyKey: "k" });

    const text = sentText();
    expect(text).toContain("Status: HPP reported open");
    expect(text).not.toContain("live level");
    expect(text).toContain(mailer.ALERT_SAFETY_NOTE);
    expect(text).toContain("Review your alerts: https://example.test/alerts");
  });

  test("a flow alert uses its unit; older stored payloads still render in metres", async () => {
    await mailer.sendThresholdAlertEmail({ email: "user@example.com", gaugeName: "Shardlow (Flow)", source: "live", unit: "cumecs", direction: "above", threshold: 40, observedValue: 41.2, observedAt: "t", unsubscribeToken: "u", idempotencyKey: "k" });
    expect(sentText()).toContain("Value: 41.20 cumecs");
    globalThis.fetch.mockClear();
    await mailer.sendThresholdAlertEmail({ email: "user@example.com", gaugeName: "Colwick", source: "live", direction: "above", threshold: 1.5, observedValue: 1.72, observedAt: "t", unsubscribeToken: "u", idempotencyKey: "k" });
    expect(sentText()).toContain("Value: 1.72 m");
  });

  test("result URLs only carry known codes", () => {
    expect(new URL(mailer.buildAlertsResultUrl("confirmed")).searchParams.get("result")).toBe("confirmed");
    expect(new URL(mailer.buildAlertsResultUrl("<script>")).searchParams.get("result")).toBe("confirm_error");
  });
});
