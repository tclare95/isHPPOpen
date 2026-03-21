jest.mock("../../libs/services/colwickAlertsService");

const { runColwickAlerts } = require("../../libs/services/colwickAlertsService");
const { GET } = require("../../app/api/internal/alerts/run/route");

describe("Alerts cron API route handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "secret-123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("returns 401 when the cron secret is missing or invalid", async () => {
    const res = await GET({ headers: { authorization: "Bearer wrong" } });
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload.error.message).toBe("Unauthorized");
  });

  test("runs Colwick alerts when authorized", async () => {
    runColwickAlerts.mockResolvedValue({ scanned: 2, sent: 1, rearmed: 0, skipped: 0, suppressed: 0 });

    const res = await GET({ headers: { authorization: "Bearer secret-123" } });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.sent).toBe(1);
  });
});