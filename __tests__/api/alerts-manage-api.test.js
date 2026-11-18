jest.mock("../../libs/services/colwickAlertsService");

const {
  requestColwickAlertManagementLink,
  listColwickAlertsForManagement,
  deleteManagedColwickAlert,
  editManagedColwickAlert,
  pauseManagedColwickAlert,
  resumeManagedColwickAlert,
} = require("../../libs/services/colwickAlertsService");
const { HttpError } = jest.requireActual("../../libs/api/http");
const { POST: manageLinkPOST } = require("../../app/api/alerts/manage-link/route");
const { GET: manageGET, PATCH: managePATCH, DELETE: manageDELETE } = require("../../app/api/alerts/manage/route");

const jsonRequest = (body) => ({
  async json() {
    return body;
  },
});

describe("Alerts management API route handlers", () => {
  beforeEach(() => jest.clearAllMocks());

  test("POST sends a management link", async () => {
    requestColwickAlertManagementLink.mockResolvedValue({
      message: "Check your email for a link to manage your Colwick alerts.",
    });

    const res = await manageLinkPOST(jsonRequest({ email: "user@example.com" }));
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

    const res = await manageDELETE(jsonRequest({ token: "manage-123", alertKey: "alert-a" }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.message).toBe("Alert removed.");
    expect(deleteManagedColwickAlert).toHaveBeenCalledWith({
      token: "manage-123",
      alertKey: "alert-a",
    });
  });

  test("PATCH delegates edit, pause and resume with only the token, alert and changes", async () => {
    editManagedColwickAlert.mockResolvedValue({ message: "Alert updated.", alertKey: "b", changed: true });
    pauseManagedColwickAlert.mockResolvedValue({ message: "Alert paused." });
    resumeManagedColwickAlert.mockResolvedValue({ message: "Alert resumed." });

    const edited = await managePATCH(jsonRequest({ token: "t", alertKey: "a", action: "edit", changes: { threshold: 1.6 }, email: "x@example.com" }));
    expect(edited.status).toBe(200);
    expect((await edited.json()).data).toEqual({ message: "Alert updated.", alertKey: "b", changed: true });
    expect(editManagedColwickAlert).toHaveBeenCalledWith({ token: "t", alertKey: "a", changes: { threshold: 1.6 } });

    expect((await managePATCH(jsonRequest({ token: "t", alertKey: "a", action: "pause" }))).status).toBe(200);
    expect(pauseManagedColwickAlert).toHaveBeenCalledWith({ token: "t", alertKey: "a" });
    expect((await managePATCH(jsonRequest({ token: "t", alertKey: "a", action: "resume" }))).status).toBe(200);
    expect(resumeManagedColwickAlert).toHaveBeenCalledWith({ token: "t", alertKey: "a" });
  });

  test("PATCH rejects an unknown action without calling the service", async () => {
    for (const action of [undefined, "activate", "constructor", "__proto__"]) {
      const res = await managePATCH(jsonRequest({ token: "t", alertKey: "a", action }));
      expect(res.status).toBe(400);
    }
    expect(editManagedColwickAlert).not.toHaveBeenCalled();
    expect(pauseManagedColwickAlert).not.toHaveBeenCalled();
    expect(resumeManagedColwickAlert).not.toHaveBeenCalled();
  });

  test("PATCH maps refusals to their status with the service's fixed message only", async () => {
    pauseManagedColwickAlert.mockRejectedValueOnce(new HttpError(404, "This management link has expired or has already been used. Request a new link below."));
    const expired = await managePATCH(jsonRequest({ token: "old", alertKey: "a", action: "pause" }));
    expect(expired.status).toBe(404);
    expect(await expired.json()).toEqual({ ok: false, error: { message: "This management link has expired or has already been used. Request a new link below." } });

    resumeManagedColwickAlert.mockRejectedValueOnce(new HttpError(409, "Confirm this alert from your email before changing it."));
    expect((await managePATCH(jsonRequest({ token: "t", alertKey: "a", action: "resume" }))).status).toBe(409);

    editManagedColwickAlert.mockRejectedValueOnce(new Error("connection string mongodb://secret"));
    const failed = await managePATCH(jsonRequest({ token: "t", alertKey: "a", action: "edit", changes: {} }));
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("secret");
  });
});
