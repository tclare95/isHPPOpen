/** @jest-environment node */
// Provider outcome classification for alert emails. `fetch` is mocked; nothing is sent.
import { ALERT_EMAIL_TIMEOUT_MS, AlertEmailError, sendThresholdAlertEmail } from "../libs/services/alertMailerService";

const alert = { email: "user@example.com", gaugeName: "Colwick", source: "live", direction: "above", threshold: 1.5, observedValue: 1.72, observedAt: "2026-11-01T12:00:00.000Z", unsubscribeToken: "unsubscribe-token", idempotencyKey: "transition-key" };
const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function outcomeOf(promise) {
  try {
    await promise;
    return "sent";
  } catch (error) {
    expect(error).toBeInstanceOf(AlertEmailError);
    return `${error.deliveryOutcome}:${error.reason}`;
  }
}

describe("alertMailerService delivery outcomes", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, RESEND_API_KEY: "test-key", ALERTS_FROM_EMAIL: "alerts@example.com" };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test("sends with the idempotency key and a bounded provider timeout", async () => {
    global.fetch.mockResolvedValue(response(200, { id: "email-id" }));

    await expect(outcomeOf(sendThresholdAlertEmail(alert))).resolves.toBe("sent");

    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("transition-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(ALERT_EMAIL_TIMEOUT_MS).toBe(10000);
  });

  test.each([
    [422, "rejected:http_422"],
    [400, "rejected:http_400"],
    [429, "rejected:http_429"],
    [409, "uncertain:http_409"],
    [500, "uncertain:http_500"],
    [503, "uncertain:http_503"],
  ])("classifies HTTP %i", async (status, expected) => {
    global.fetch.mockResolvedValue(response(status, { message: "provider said no" }));

    await expect(outcomeOf(sendThresholdAlertEmail(alert))).resolves.toBe(expected);
  });

  test("a provider timeout is uncertain", async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));

    await expect(outcomeOf(sendThresholdAlertEmail(alert))).resolves.toBe("uncertain:timeout");
  });

  test("a network failure is uncertain", async () => {
    global.fetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(outcomeOf(sendThresholdAlertEmail(alert))).resolves.toBe("uncertain:network");
  });

  test("missing provider configuration is a definite rejection and makes no request", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(outcomeOf(sendThresholdAlertEmail(alert))).resolves.toBe("rejected:config");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("errors keep the existing HTTP status mapping for API routes", async () => {
    global.fetch.mockResolvedValue(response(422, { message: "Invalid recipient" }));

    await expect(sendThresholdAlertEmail(alert)).rejects.toMatchObject({ statusCode: 502, message: "Invalid recipient" });
  });
});
