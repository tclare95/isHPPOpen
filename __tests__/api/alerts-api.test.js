jest.mock("../../libs/services/colwickAlertsService");

const {
  createColwickAlertSubscription,
  confirmColwickAlertSubscription,
  unsubscribeColwickAlertSubscription,
} = require("../../libs/services/colwickAlertsService");
const { POST } = require("../../app/api/alerts/route");
const { GET: confirmGET } = require("../../app/api/alerts/confirm/route");
const { GET: unsubscribeGET } = require("../../app/api/alerts/unsubscribe/route");

const makePostRequest = (body) => ({
  async json() {
    return body;
  },
});

describe("Alerts API route handlers", () => {
  beforeEach(() => jest.clearAllMocks());

  test("POST creates a Colwick alert subscription", async () => {
    createColwickAlertSubscription.mockResolvedValue({
      message: "Check your email to confirm this Colwick alert.",
    });

    const res = await POST(makePostRequest({
      email: "user@example.com",
      gaugeKey: "4009-level",
      source: "live",
      direction: "above",
      threshold: 1.6,
    }));
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(createColwickAlertSubscription).toHaveBeenCalledWith({
      email: "user@example.com",
      gaugeKey: "4009-level",
      source: "live",
      direction: "above",
      threshold: 1.6,
    });
  });

  test("POST returns 400 for invalid request body", async () => {
    const res = await POST({
      async json() {
        return null;
      },
    });
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error.message).toBe("Invalid request body");
  });

  test("confirm route activates an alert token", async () => {
    confirmColwickAlertSubscription.mockResolvedValue({ status: "confirmed", message: "Alert confirmed." });

    const res = await confirmGET({
      nextUrl: new URL("http://localhost/api/alerts/confirm?token=abc123"),
    });

    expect(res.status).toBe(307);
    expect(new URL(res.headers.Location).pathname).toBe("/alerts");
    expect(new URL(res.headers.Location).searchParams.get("result")).toBe("confirmed");
    expect(confirmColwickAlertSubscription).toHaveBeenCalledWith("abc123");
  });

  test("unsubscribe route deactivates an alert token", async () => {
    unsubscribeColwickAlertSubscription.mockResolvedValue({ message: "Alert stopped." });

    const res = await unsubscribeGET({
      nextUrl: new URL("http://localhost/api/alerts/unsubscribe?token=bye123"),
    });

    expect(res.status).toBe(307);
    expect(new URL(res.headers.Location).pathname).toBe("/alerts");
    expect(new URL(res.headers.Location).searchParams.get("result")).toBe("unsubscribed");
    expect(unsubscribeColwickAlertSubscription).toHaveBeenCalledWith("bye123");
  });

  const resultOf = (res) => new URL(res.headers.Location).searchParams.get("result");
  const confirm = () => confirmGET({ nextUrl: new URL("http://localhost/api/alerts/confirm?token=abc123") });
  const unsubscribe = () => unsubscribeGET({ nextUrl: new URL("http://localhost/api/alerts/unsubscribe?token=bye123") });

  test("confirm route reports an already-active alert without claiming a new activation", async () => {
    confirmColwickAlertSubscription.mockResolvedValue({ status: "already_active", message: "This alert is already active." });
    expect(resultOf(await confirm())).toBe("already_active");
  });

  test("confirm route reports a paused alert as paused, not as newly confirmed", async () => {
    confirmColwickAlertSubscription.mockResolvedValue({ status: "already_paused", message: "This alert is paused." });
    expect(resultOf(await confirm())).toBe("already_paused");
  });

  test("confirm and unsubscribe failures never redirect as success, and carry no free text", async () => {
    const { HttpError } = jest.requireActual("../../libs/api/http");
    confirmColwickAlertSubscription.mockRejectedValue(new HttpError(404, "invalid"));
    unsubscribeColwickAlertSubscription.mockRejectedValue(new HttpError(404, "invalid"));
    const [invalidConfirm, invalidUnsubscribe] = [await confirm(), await unsubscribe()];
    expect(resultOf(invalidConfirm)).toBe("confirm_invalid");
    expect(resultOf(invalidUnsubscribe)).toBe("unsubscribe_invalid");
    expect(invalidConfirm.headers.Location).not.toContain("invalid%20");

    confirmColwickAlertSubscription.mockRejectedValue(new Error("database down"));
    unsubscribeColwickAlertSubscription.mockRejectedValue(new Error("database down"));
    expect(resultOf(await confirm())).toBe("confirm_error");
    expect(resultOf(await unsubscribe())).toBe("unsubscribe_error");
  });
});
