/** @jest-environment node */
jest.mock("../libs/database", () => ({ connectToDatabase: jest.fn() }));

import { connectToDatabase } from "../libs/database";
import { createHppShadowService } from "../libs/hpp/hppShadowService";
import { LEGACY_COLLECTION, SHADOW_COLLECTIONS } from "../libs/hpp/hppShadowStore";
import { getHppShadowReport, getHppStatusSource, runHppShadowCron } from "../libs/services/hppShadowCronService";
import { createFakeDb } from "../testUtils/fakeMongo";
import vercelConfig from "../vercel.json";

const NOW = new Date("2026-11-03T13:07:00.000Z");
const PRODUCTION = { HPP_STATUS_SOURCE: "shadow", VERCEL_ENV: "production" };
const row = (value, observedAt) => ({
  measurementId: "ea-colwick-level", unit: "mASD", datum: "ASD",
  providerMeasureId: "4009-level-stage-i-15_min-mASD", sourceId: "ea-flood-monitoring", value, observedAt,
});

function fakeService(rows = [row(1.1, "2026-11-03T13:00:00.000Z")]) {
  const fake = createFakeDb({ uniqueIndexes: { [SHADOW_COLLECTIONS.state]: [{ _id: 1 }], [SHADOW_COLLECTIONS.transitions]: [{ _id: 1 }] } });
  fake.docs(LEGACY_COLLECTION).push({ _id: "l1", timestamp: "2026-03-13T10:52:23.617Z", value: true });
  const getObservations = jest.fn(async () => ({ meta: { measurementId: "ea-colwick-level", pageIntegrity: "verified" }, data: rows }));
  const create = jest.fn(async () => createHppShadowService({ db: fake.db, getClient: async () => ({ getObservations }) }));
  return { fake, create, getObservations };
}

describe("HPP status source mode", () => {
  it("defaults to legacy and rejects unknown modes", () => {
    expect(getHppStatusSource({})).toBe("legacy");
    expect(getHppStatusSource({ HPP_STATUS_SOURCE: "shadow" })).toBe("shadow");
    expect(() => getHppStatusSource({ HPP_STATUS_SOURCE: "authoritative" })).toThrow(expect.objectContaining({ statusCode: 500 }));
  });

  it("does nothing in legacy mode", async () => {
    const { create } = fakeService();
    expect(await runHppShadowCron({ env: { VERCEL_ENV: "production" }, now: NOW, create })).toEqual({ mode: "legacy", ran: false, reason: "disabled" });
    expect(await getHppShadowReport({ env: {}, now: NOW, create })).toEqual({ mode: "legacy", status: "disabled" });
    expect(create).not.toHaveBeenCalled();
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it.each(["preview", "development", undefined])("never writes outside Production (VERCEL_ENV=%s)", async (VERCEL_ENV) => {
    const { create } = fakeService();
    expect(await runHppShadowCron({ env: { HPP_STATUS_SOURCE: "shadow", VERCEL_ENV }, now: NOW, create }))
      .toEqual({ mode: "shadow", ran: false, reason: "non_production" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("HPP shadow cron in Production", () => {
  it("evaluates, writes only shadow collections and returns a compact summary", async () => {
    const { fake, create } = fakeService();
    const summary = await runHppShadowCron({ env: PRODUCTION, now: NOW, runId: "run-1", create });
    expect(summary).toEqual({
      mode: "shadow", ran: true, action: "none", reason: "unchanged", persisted: true, sourceError: null,
      transitionId: null, state: expect.objectContaining({ open: true, sequence: 0 }),
      observedAt: "2026-11-03T13:00:00.000Z", observationAgeMs: 7 * 60 * 1000,
    });
    const writes = fake.calls.filter((call) => !["find", "findOne"].includes(call.op));
    expect(new Set(writes.map((call) => call.collection))).toEqual(new Set([SHADOW_COLLECTIONS.state]));
  });

  it("surfaces an RDP failure as a hold with its code", async () => {
    const { create, getObservations } = fakeService();
    getObservations.mockRejectedValue(Object.assign(new Error("x"), { code: "AUTHORIZATION_FAILED" }));
    expect(await runHppShadowCron({ env: PRODUCTION, now: NOW, create })).toMatchObject({
      ran: true, action: "hold", reason: "source_unavailable", sourceError: "AUTHORIZATION_FAILED", persisted: true,
    });
  });

  it("reports shadow evidence read-only", async () => {
    const { fake, create } = fakeService();
    await runHppShadowCron({ env: PRODUCTION, now: NOW, create });
    const callsBefore = fake.calls.length;
    const report = await getHppShadowReport({ env: PRODUCTION, now: NOW, create });
    expect(report).toMatchObject({ mode: "shadow", status: "ok", authoritative: false, comparison: { matches: true } });
    expect(fake.calls.slice(callsBefore).every((call) => ["find", "findOne"].includes(call.op))).toBe(true);
  });
});

describe("Cron schedule", () => {
  it("runs HPP every 15 minutes, offset from the alert evaluator", () => {
    expect(vercelConfig.crons).toEqual(expect.arrayContaining([
      { path: "/api/internal/alerts/run", schedule: "*/15 * * * *" },
      { path: "/api/internal/hpp/run", schedule: "7,22,37,52 * * * *" },
    ]));
  });
});
