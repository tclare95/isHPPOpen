/** @jest-environment node */
import { RdpError } from "../libs/rdp/errors";
import { HISTORY_MAX_PAGES, HISTORY_PAGE_LIMIT, readObservationWindow } from "../libs/history/source";

jest.mock("server-only", () => ({}));

const FROM = Date.parse("2024-11-01T00:00:00Z");
const TO = Date.parse("2024-11-02T00:00:00Z");
const row = (minutes) => ({ observedAt: new Date(FROM + minutes * 60000).toISOString(), value: 1, quality: null });
const page = (data, nextCursor = null, coverage = { status: "unknown", gaps: [] }) =>
  ({ data, meta: { nextCursor, coverage, requestAsOf: "2026-11-05T00:00:00Z", pageIntegrity: "verified" } });

test("follows cursors across pages with bounded limit and keeps coverage evidence", async () => {
  const reader = { getObservations: jest.fn()
    .mockResolvedValueOnce(page([row(0), row(15)], "c1"))
    .mockResolvedValueOnce(page([row(30)])) };
  const result = await readObservationWindow(reader, "ea-colwick-level", FROM, TO);
  expect(result.rows).toHaveLength(3);
  expect(result.coverage.status).toBe("unknown");
  expect(reader.getObservations).toHaveBeenNthCalledWith(1, "ea-colwick-level",
    { from: "2024-11-01T00:00:00.000Z", to: "2024-11-02T00:00:00.000Z", limit: HISTORY_PAGE_LIMIT, cursor: undefined });
  expect(reader.getObservations.mock.calls[1][1].cursor).toBe("c1");
});

test("fails rather than truncating when the page bound is exceeded", async () => {
  let n = 0;
  const reader = { getObservations: jest.fn(async () => page([row(n++)], `c${n}`)) };
  await expect(readObservationWindow(reader, "ea-colwick-level", FROM, TO)).rejects.toMatchObject({ code: "PAGINATION_LIMIT" });
  expect(reader.getObservations).toHaveBeenCalledTimes(HISTORY_MAX_PAGES);
});

test.each(["CURSOR_EXPIRED", "CURSOR_STALE"])("restarts once from the beginning after %s", async (code) => {
  const reader = { getObservations: jest.fn()
    .mockResolvedValueOnce(page([row(0)], "c1"))
    .mockRejectedValueOnce(new RdpError(code, 409))
    .mockResolvedValueOnce(page([row(0), row(15)])) };
  const result = await readObservationWindow(reader, "ea-colwick-level", FROM, TO);
  expect(result.rows).toHaveLength(2);
  expect(reader.getObservations.mock.calls[2][1].cursor).toBeUndefined();
});

test("a second cursor failure is not retried", async () => {
  const reader = { getObservations: jest.fn().mockRejectedValue(new RdpError("CURSOR_EXPIRED", 409)) };
  await expect(readObservationWindow(reader, "ea-colwick-level", FROM, TO)).rejects.toMatchObject({ code: "CURSOR_EXPIRED" });
  expect(reader.getObservations).toHaveBeenCalledTimes(2);
});

test("archive integrity failures propagate without retry", async () => {
  const reader = { getObservations: jest.fn().mockRejectedValue(new RdpError("ARCHIVE_INTEGRITY", 503)) };
  await expect(readObservationWindow(reader, "ea-colwick-level", FROM, TO)).rejects.toMatchObject({ code: "ARCHIVE_INTEGRITY" });
  expect(reader.getObservations).toHaveBeenCalledTimes(1);
});

test.each([
  ["duplicate instants", [row(0), row(0)]],
  ["out-of-order pages", [row(15), row(0)]],
  ["rows outside the window", [row(-15)]],
  ["rows at the exclusive end", [{ ...row(0), observedAt: new Date(TO).toISOString() }]],
])("rejects %s as a contract error", async (_, data) => {
  const reader = { getObservations: jest.fn().mockResolvedValue(page(data)) };
  await expect(readObservationWindow(reader, "ea-colwick-level", FROM, TO)).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
});
