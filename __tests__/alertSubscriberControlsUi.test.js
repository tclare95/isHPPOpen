// Wave B subscriber controls in the management view: clear status, edit/pause/resume only where allowed,
// cautious evidence notes and visible feedback. Rendering only; no network or database.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ALERT_EVIDENCE_NOTES, ALERT_RESTARTING_NOTE, AlertsManagementContent, AlertsManagementFeedback } from "../components/functional/alertsManager";
import AlertResultNotice from "../components/functional/alertResultNotice";

const gauge = { alertKey: "g", alertType: "gauge", gaugeName: "Colwick", source: "live", direction: "above", threshold: 1.5, unit: "m",
  description: "We will email you when the Colwick reading rises to or above 1.50 m.", status: "active", createdAt: "2026-11-01T00:00:00.000Z", evidence: "current" };
const hpp = { alertKey: "h", alertType: "hpp_status", gaugeName: "HPP opens", desiredStatus: "open", description: "We will email you when HPP is reported open.", status: "paused",
  pausedAt: "2026-11-10T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z", evidence: null };
const pending = { ...gauge, alertKey: "p", gaugeName: "Shardlow", status: "pending_confirmation", confirmationExpired: false, evidence: null };

const renderContent = (alerts, props = {}) => render(
  <AlertsManagementContent data={{ alerts }} isPending={false} busyAlertKey="" onRemove={jest.fn()} onChange={jest.fn().mockResolvedValue(true)} {...props} />
);
const tile = (name) => screen.getByText(name).closest(".history-tile");

describe("status", () => {
  test("distinguishes active, paused and pending, and offers changes only for confirmed alerts", () => {
    renderContent([gauge, hpp, pending]);

    expect(within(tile("Colwick")).getByText("Active")).toBeInTheDocument();
    expect(within(tile("HPP opens")).getByText("Paused")).toBeInTheDocument();
    expect(within(tile("HPP opens")).getByText("No emails until you resume it.")).toBeInTheDocument();
    expect(within(tile("HPP opens")).getByText(/Paused: /)).toBeInTheDocument();
    expect(screen.getByText("Not active: awaiting confirmation")).toBeInTheDocument();

    expect(within(tile("Colwick")).getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(within(tile("HPP opens")).getByRole("button", { name: "Resume" })).toBeInTheDocument();
    const pendingTile = screen.getByText("Not active: awaiting confirmation").closest(".history-tile");
    expect(within(pendingTile).queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    expect(within(pendingTile).queryByRole("button", { name: /Pause|Resume/ })).not.toBeInTheDocument();
    expect(within(pendingTile).getByRole("button", { name: "Stop this alert" })).toBeInTheDocument();
  });

  test("never implies assured delivery: late or unknown evidence is a caution, and current evidence adds no promise", () => {
    renderContent([{ ...gauge, alertKey: "d", gaugeName: "Delayed", evidence: "delayed" }, { ...gauge, alertKey: "u", gaugeName: "Unknown", evidence: "unknown" }, gauge]);

    expect(within(tile("Delayed")).getByText(ALERT_EVIDENCE_NOTES.delayed)).toBeInTheDocument();
    expect(within(tile("Unknown")).getByText(ALERT_EVIDENCE_NOTES.unknown)).toBeInTheDocument();
    expect(within(tile("Colwick")).queryByText(/may be delayed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/guarantee|will arrive|working normally/i)).not.toBeInTheDocument();
  });

  test("an edited or resumed alert says it restarts without sending for earlier conditions", () => {
    renderContent([{ ...gauge, restarting: true }]);
    expect(screen.getByText(ALERT_RESTARTING_NOTE)).toBeInTheDocument();
  });
});

describe("controls", () => {
  test("editing shows the new conditions before saving and sends only the supported fields", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn().mockResolvedValue(true);
    renderContent([gauge], { onChange });

    await user.click(screen.getByRole("button", { name: "Change" }));
    const threshold = screen.getByLabelText("Threshold (m)");
    await user.clear(threshold);
    await user.type(threshold, "1.62");
    await user.selectOptions(screen.getByLabelText("Trigger"), "below");
    expect(screen.getByText("We will email you when the Colwick reading drops to or below 1.62 m.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onChange).toHaveBeenCalledWith("g", { action: "edit", changes: { direction: "below", threshold: 1.62 } });
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  test("a refused edit keeps the form open so the subscriber can correct it", async () => {
    const user = userEvent.setup();
    renderContent([hpp], { onChange: jest.fn().mockResolvedValue(false) });

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.selectOptions(screen.getByLabelText("Notify me when HPP"), "closed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  test("pause and resume send their action; buttons are disabled while a change is in progress", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn().mockResolvedValue(true);
    const { rerender } = renderContent([gauge, hpp], { onChange });

    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(onChange).toHaveBeenNthCalledWith(1, "g", { action: "pause" });
    expect(onChange).toHaveBeenNthCalledWith(2, "h", { action: "resume" });

    rerender(<AlertsManagementContent data={{ alerts: [gauge, hpp] }} isPending={false} busyAlertKey="g" busyAction="pause" onRemove={jest.fn()} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Pausing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resume" })).toBeDisabled();
  });
});

describe("feedback", () => {
  test("success and failure are announced", () => {
    const { rerender } = render(<AlertsManagementFeedback successMessage="Alert paused. You will not get emails for it until you resume it." errorMessage="" />);
    expect(screen.getByRole("status")).toHaveTextContent("Alert paused.");
    rerender(<AlertsManagementFeedback successMessage="" errorMessage="You already have an alert with these conditions." />);
    expect(screen.getByRole("alert")).toHaveTextContent("You already have an alert with these conditions.");
  });

  test("confirming a re-request for a paused alert says it is still paused", () => {
    render(<AlertResultNotice result="already_paused" />);
    expect(screen.getByRole("status")).toHaveTextContent("This alert is paused. Nothing has changed.");
  });
});
