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
    confirmColwickAlertSubscription.mockResolvedValue({ message: "Colwick alert confirmed." });

    const res = await confirmGET({
      nextUrl: new URL("http://localhost/api/alerts/confirm?token=abc123"),
    });

    expect(res.status).toBe(307);
    expect(res.headers.Location).toContain("/trentweirs");
    expect(res.headers.Location).toContain("alertStatus=confirmed");
    expect(confirmColwickAlertSubscription).toHaveBeenCalledWith("abc123");
  });

  test("unsubscribe route deactivates an alert token", async () => {
    unsubscribeColwickAlertSubscription.mockResolvedValue({ message: "Colwick alert unsubscribed." });

    const res = await unsubscribeGET({
      nextUrl: new URL("http://localhost/api/alerts/unsubscribe?token=bye123"),
    });

    expect(res.status).toBe(307);
    expect(res.headers.Location).toContain("/trentweirs");
    expect(res.headers.Location).toContain("alertStatus=unsubscribed");
    expect(unsubscribeColwickAlertSubscription).toHaveBeenCalledWith("bye123");
  });
});