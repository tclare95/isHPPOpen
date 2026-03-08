jest.mock("../../libs/services/colwickAlertsService");

const {
  requestColwickAlertManagementLink,
  listColwickAlertsForManagement,
  deleteManagedColwickAlert,
} = require("../../libs/services/colwickAlertsService");
const { POST: manageLinkPOST } = require("../../app/api/alerts/manage-link/route");
const { GET: manageGET, DELETE: manageDELETE } = require("../../app/api/alerts/manage/route");

describe("Alerts management API route handlers", () => {
  beforeEach(() => jest.clearAllMocks());

  test("POST sends a management link", async () => {
    requestColwickAlertManagementLink.mockResolvedValue({
      message: "Check your email for a link to manage your Colwick alerts.",
    });

    const res = await manageLinkPOST({
      async json() {
        return { email: "user@example.com" };
      },
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.message).toContain("manage your Colwick alerts");
    expect(requestColwickAlertManagementLink).toHaveBeenCalledWith("user@example.com");
  });

  test("GET returns the alerts for a management token", async () => {
    listColwickAlertsForManagement.mockResolvedValue({
      email: "user@example.com",
      alerts: [{ alertKey: "a", gaugeName: "Colwick", status: "active" }],
      manageToken: "rotated-token",
    });

    const res = await manageGET({
      nextUrl: new URL("http://localhost/api/alerts/manage?token=manage-123"),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.email).toBe("user@example.com");
    expect(payload.data.manageToken).toBe("rotated-token");
    expect(listColwickAlertsForManagement).toHaveBeenCalledWith("manage-123");
  });

  test("DELETE removes a managed alert", async () => {
    deleteManagedColwickAlert.mockResolvedValue({ message: "Alert removed." });

    const res = await manageDELETE({
      async json() {
        return { token: "manage-123", alertKey: "alert-a" };
      },
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.message).toBe("Alert removed.");
    expect(deleteManagedColwickAlert).toHaveBeenCalledWith({
      token: "manage-123",
      alertKey: "alert-a",
    });
  });
});