jest.mock("../libs/database");
jest.mock("../libs/services/alertMailerService", () => ({
  sendAlertConfirmationEmail: jest.fn(),
  sendManageAlertsAccessEmail: jest.fn(),
  sendThresholdAlertEmail: jest.fn(),
}));
jest.mock("../libs/services/trentWeirsService", () => ({
  getTrentWeirsSnapshot: jest.fn(),
}));
jest.mock("../libs/services/forecastService", () => ({
  getLatestForecastSnapshot: jest.fn(),
}));

const { connectToDatabase } = require("../libs/database");
const {
  sendAlertConfirmationEmail,
  sendManageAlertsAccessEmail,
  sendThresholdAlertEmail,
} = require("../libs/services/alertMailerService");
const { getTrentWeirsSnapshot } = require("../libs/services/trentWeirsService");
const { getLatestForecastSnapshot } = require("../libs/services/forecastService");
const {
  createColwickAlertSubscription,
  confirmColwickAlertSubscription,
  requestColwickAlertManagementLink,
  listColwickAlertsForManagement,
  deleteManagedColwickAlert,
  runColwickAlerts,
} = require("../libs/services/colwickAlertsService");

describe("colwickAlertsService", () => {
  beforeEach(() => jest.clearAllMocks());

  test("createColwickAlertSubscription stores a pending Colwick alert and sends confirmation", async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({ updateOne }),
      },
    });

    await createColwickAlertSubscription({
      email: "User@Example.com",
      gaugeKey: "4009-level",
      source: "forecast",
      direction: "above",
      threshold: 1.6789,
    }, { now: new Date("2026-03-08T12:00:00.000Z") });

    expect(updateOne).toHaveBeenCalled();
    const [, update] = updateOne.mock.calls[0];
    expect(update.$set.email).toBe("user@example.com");
    expect(update.$set.gaugeName).toBe("Colwick");
    expect(update.$set.threshold).toBe(1.679);
    expect(update.$set.status).toBe("pending_confirmation");
    expect(sendAlertConfirmationEmail).toHaveBeenCalled();
  });

  test("confirmColwickAlertSubscription activates a pending alert", async () => {
    const findOne = jest.fn().mockResolvedValue({ alertKey: "user@example.com|4009-level|live|above|1.500" });
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({ findOne, updateOne }),
      },
    });

    const result = await confirmColwickAlertSubscription("abc123", {
      now: new Date("2026-03-08T13:00:00.000Z"),
    });

    expect(result.message).toBe("Colwick alert confirmed.");
    expect(updateOne).toHaveBeenCalledWith(
      { alertKey: "user@example.com|4009-level|live|above|1.500" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "active" }),
      })
    );
  });

  test("runColwickAlerts sends a live alert when the threshold is crossed", async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              {
                alertKey: "a",
                email: "user@example.com",
                gaugeKey: "4009-level",
                source: "live",
                direction: "above",
                threshold: 1.5,
                status: "active",
                lastConditionState: "armed",
                unsubscribeToken: "unsubscribe-token",
              },
            ]),
          }),
          updateOne,
        }),
      },
    });
    getTrentWeirsSnapshot.mockResolvedValue({
      fallback: false,
      partial: false,
      stations: [
        {
          stationId: 4009,
          measures: {
            level: {
              latestValue: 1.72,
              readings: [{ dateTime: "2026-03-08T12:15:00.000Z", value: 1.72 }],
            },
          },
        },
      ],
    });
    getLatestForecastSnapshot.mockResolvedValue({ forecast_data: [], metadata: null });

    const result = await runColwickAlerts({ now: new Date("2026-03-08T12:30:00.000Z") });

    expect(result.sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      source: "live",
      observedValue: 1.72,
    }));
  });

  test("runColwickAlerts rearms a triggered live alert after conditions clear", async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              {
                alertKey: "a",
                email: "user@example.com",
                gaugeKey: "4009-level",
                source: "live",
                direction: "above",
                threshold: 1.5,
                status: "active",
                lastConditionState: "triggered",
                unsubscribeToken: "unsubscribe-token",
              },
            ]),
          }),
          updateOne,
        }),
      },
    });
    getTrentWeirsSnapshot.mockResolvedValue({
      fallback: false,
      partial: false,
      stations: [
        {
          stationId: 4009,
          measures: {
            level: {
              latestValue: 1.4,
              readings: [{ dateTime: "2026-03-08T12:15:00.000Z", value: 1.4 }],
            },
          },
        },
      ],
    });
    getLatestForecastSnapshot.mockResolvedValue({ forecast_data: [], metadata: null });

    const result = await runColwickAlerts({ now: new Date("2026-03-08T12:30:00.000Z") });

    expect(result.rearmed).toBe(1);
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith(
      { alertKey: "a" },
      expect.objectContaining({
        $set: expect.objectContaining({ lastConditionState: "armed" }),
      })
    );
  });

  test("runColwickAlerts sends a forecast alert when the forecast crosses the threshold", async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              {
                alertKey: "forecast-a",
                email: "user@example.com",
                gaugeKey: "4009-level",
                source: "forecast",
                direction: "below",
                threshold: 1.5,
                status: "active",
                lastConditionState: "armed",
                unsubscribeToken: "unsubscribe-token",
              },
            ]),
          }),
          updateOne,
        }),
      },
    });
    getTrentWeirsSnapshot.mockResolvedValue({ fallback: true, partial: false, stations: [] });
    getLatestForecastSnapshot.mockResolvedValue({
      metadata: { forecast_time: "2026-03-08T12:00:00.000Z" },
      forecast_data: [
        { forecast_date: "2026-03-08T13:00:00.000Z", forecast_reading: 1.62 },
        { forecast_date: "2026-03-08T14:00:00.000Z", forecast_reading: 1.48 },
      ],
    });

    const result = await runColwickAlerts({ now: new Date("2026-03-08T12:30:00.000Z") });

    expect(result.sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      source: "forecast",
      observedAt: "2026-03-08T14:00:00.000Z",
      forecastRunAt: "2026-03-08T12:00:00.000Z",
    }));
  });

  test("requestColwickAlertManagementLink stores a session and emails a link", async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({ updateOne }),
      },
    });

    const result = await requestColwickAlertManagementLink("User@Example.com", {
      now: new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(result.message).toContain("manage your Colwick alerts");
    expect(updateOne).toHaveBeenCalled();
    const [, update] = updateOne.mock.calls[0];
    expect(update.$set.email).toBe("user@example.com");
    expect(update.$setOnInsert).toBeUndefined();
    expect(sendManageAlertsAccessEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: "user@example.com",
    }));
  });

  test("listColwickAlertsForManagement returns alerts for a valid token", async () => {
    const findOne = jest.fn().mockResolvedValue({
      email: "user@example.com",
      expiresAt: "2099-03-08T12:00:00.000Z",
    });
    const rotateUpdateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const toArray = jest.fn().mockResolvedValue([
      {
        alertKey: "a",
        gaugeName: "Colwick",
        source: "live",
        direction: "above",
        threshold: 1.5,
        status: "active",
        createdAt: "2026-03-08T10:00:00.000Z",
        updatedAt: "2026-03-08T11:00:00.000Z",
      },
    ]);
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn()
          .mockReturnValueOnce({ findOne, updateOne: rotateUpdateOne })
          .mockReturnValueOnce({ find: jest.fn().mockReturnValue({ toArray }) }),
      },
    });

    const result = await listColwickAlertsForManagement("manage-token", {
      now: new Date("2026-03-08T13:00:00.000Z"),
    });

    expect(result.email).toBe("user@example.com");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({ alertKey: "a", status: "active" });
    expect(result.manageToken).toBeTruthy();
    expect(rotateUpdateOne).toHaveBeenCalled();
  });

  test("deleteManagedColwickAlert unsubscribes a matching alert", async () => {
    const findOne = jest.fn().mockResolvedValue({
      email: "user@example.com",
      expiresAt: "2099-03-08T12:00:00.000Z",
    });
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn()
          .mockReturnValueOnce({ findOne })
          .mockReturnValueOnce({ updateOne }),
      },
    });

    const result = await deleteManagedColwickAlert({
      token: "manage-token",
      alertKey: "alert-a",
    }, {
      now: new Date("2026-03-08T13:00:00.000Z"),
    });

    expect(result.message).toBe("Alert removed.");
    expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({
      email: "user@example.com",
      alertKey: "alert-a",
    }), expect.objectContaining({
      $set: expect.objectContaining({ status: "unsubscribed" }),
    }));
  });
});