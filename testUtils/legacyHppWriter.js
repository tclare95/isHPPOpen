// Test double of the legacy scraper's openIndicator writer (#89).
//
// Mirrors ishppopenScraper `updateOpenIndicator` (insert `{ timestamp: now,
// value }` whenever the latest record's value differs from `level < 2.2`)
// plus its writer-control gate: write only while legacyMayWrite(control),
// and acknowledge the control epoch on every run. Keep in step with the
// scraper implementation.
import { WRITER_CONTROL_COLLECTION, WRITER_CONTROL_ID, legacyMayWrite } from "../libs/hpp/hppWriterControl";

export async function runLegacyWriter(db, { level, now, runStartedAt = now }) {
  const control = await db.collection(WRITER_CONTROL_COLLECTION).findOne({ _id: WRITER_CONTROL_ID });
  let wrote = false;
  if (legacyMayWrite(control, now)) {
    const latest = await db.collection("openIndicator").findOne({}, { sort: { timestamp: -1 } });
    const shouldBeOpen = level < 2.2;
    if (!latest || latest.value !== shouldBeOpen) {
      await db.collection("openIndicator").insertOne({ _id: `legacy-${now.toISOString()}`, timestamp: now.toISOString(), value: shouldBeOpen });
      wrote = true;
    }
  }
  if (control) {
    await db.collection(WRITER_CONTROL_COLLECTION).updateOne(
      { _id: WRITER_CONTROL_ID, epoch: control.epoch },
      { $set: { legacyAck: { epoch: control.epoch, observedOwner: control.owner, runStartedAt: runStartedAt.toISOString(), at: now.toISOString(), wrote } } },
    );
  }
  return { wrote, skipped: !legacyMayWrite(control, now) };
}
