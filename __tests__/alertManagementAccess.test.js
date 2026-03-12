/* eslint-disable react/prop-types */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AlertManagementAccess from "../components/functional/alertManagementAccess";

describe("AlertManagementAccess", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: { message: "Check your email for a link to manage your Colwick alerts." },
      }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test("requests a management link by email", async () => {
    const user = userEvent.setup();

    render(<AlertManagementAccess />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a management link" }));

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/alerts/manage-link", expect.objectContaining({
      method: "POST",
    }));
    expect(await screen.findByText("Check your email for a link to manage your Colwick alerts.")).toBeInTheDocument();
  });
});