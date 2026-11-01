// Minimal in-memory MongoDB double for deterministic alert-evaluation tests.
// Supports the operators the evaluator relies on; every operation is atomic and async,
// so tests can interleave invocations and inject failures before or after a write applies.

// Documents hold plain JSON values (timestamps are ISO strings), so a JSON copy is exact.
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isOperatorObject = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).some((key) => key.startsWith("$"));

function matchesValue(actual, expected) {
  if (isOperatorObject(expected)) {
    return Object.entries(expected).every(([operator, operand]) => {
      switch (operator) {
        case "$ne": return !matchesValue(actual, operand);
        case "$exists": return operand ? actual !== undefined : actual === undefined;
        case "$in": return operand.some((candidate) => matchesValue(actual, candidate));
        case "$lt": return actual !== undefined && actual !== null && actual < operand;
        default: throw new Error(`fakeMongo: unsupported operator ${operator}`);
      }
    });
  }
  if (expected === null) return actual === null || actual === undefined;
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export const matches = (doc, filter = {}) => Object.entries(filter).every(([key, expected]) => matchesValue(doc[key], expected));

function applyUpdate(doc, update, inserting) {
  for (const [key, value] of Object.entries(update.$set || {})) doc[key] = clone(value);
  if (inserting) for (const [key, value] of Object.entries(update.$setOnInsert || {})) doc[key] = clone(value);
  for (const key of Object.keys(update.$unset || {})) delete doc[key];
  for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
}

const equalityFields = (filter) => Object.fromEntries(Object.entries(filter).filter(([, value]) => !isOperatorObject(value) && value !== null));

export function createFakeDb({ uniqueIndexes = {} } = {}) {
  const data = {};
  const faults = [];
  const calls = [];
  const collections = {};

  async function intercept(collection, op, args, apply) {
    calls.push({ collection, op, args: clone(args) });
    await Promise.resolve();
    const index = faults.findIndex((fault) => fault.collection === collection && fault.op === op && (!fault.when || fault.when(...args)));
    const fault = index >= 0 ? faults.splice(index, 1)[0] : null;
    if (fault && !fault.afterApply) throw fault.error;
    const result = apply();
    if (fault) throw fault.error;
    return result;
  }

  function enforceUnique(name, candidate, ignore) {
    for (const key of uniqueIndexes[name] || []) {
      const fields = Object.keys(key);
      const clash = data[name].find((doc) => doc !== ignore && fields.every((field) => JSON.stringify(doc[field]) === JSON.stringify(candidate[field])));
      if (clash) throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
    }
  }

  function collection(name) {
    if (collections[name]) return collections[name];
    data[name] = data[name] || [];
    const docs = () => data[name];
    collections[name] = {
      findOne: (filter) => intercept(name, "findOne", [filter], () => clone(docs().find((doc) => matches(doc, filter)) || null)),
      find: (filter) => ({ toArray: () => intercept(name, "find", [filter], () => docs().filter((doc) => matches(doc, filter)).map(clone)) }),
      countDocuments: (filter) => intercept(name, "countDocuments", [filter], () => docs().filter((doc) => matches(doc, filter)).length),
      insertOne: (doc) => intercept(name, "insertOne", [doc], () => {
        const stored = clone(doc);
        enforceUnique(name, stored);
        docs().push(stored);
        return { acknowledged: true, insertedId: docs().length };
      }),
      updateOne: (filter, update, options = {}) => intercept(name, "updateOne", [filter, update, options], () => {
        const existing = docs().find((doc) => matches(doc, filter));
        if (existing) {
          const next = clone(existing);
          applyUpdate(next, update, false);
          enforceUnique(name, next, existing);
          Object.keys(existing).forEach((key) => delete existing[key]);
          Object.assign(existing, next);
          return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        const inserted = clone(equalityFields(filter));
        applyUpdate(inserted, update, true);
        enforceUnique(name, inserted);
        docs().push(inserted);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }),
      updateMany: (filter, update) => intercept(name, "updateMany", [filter, update], () => {
        const matched = docs().filter((doc) => matches(doc, filter));
        matched.forEach((doc) => applyUpdate(doc, update, false));
        return { acknowledged: true, matchedCount: matched.length, modifiedCount: matched.length };
      }),
      listIndexes: () => ({ toArray: () => intercept(name, "listIndexes", [], () => [{ key: { _id: 1 }, name: "_id_" }, ...(uniqueIndexes[name] || []).map((key) => ({ key, unique: true, name: Object.keys(key).map((field) => `${field}_1`).join("_") }))]) }),
      createIndex: (...args) => intercept(name, "createIndex", args, () => "created"),
    };
    return collections[name];
  }

  return {
    db: { collection },
    /** Seed or inspect raw documents. */
    docs: (name) => { data[name] = data[name] || []; return data[name]; },
    calls,
    /**
     * Fail the next matching operation once. With `afterApply` the write is applied and then the
     * call throws, simulating a committed write whose acknowledgement is lost.
     */
    failNext: (name, op, { when, error = Object.assign(new Error("simulated database failure"), { name: "MongoNetworkError" }), afterApply = false } = {}) => faults.push({ collection: name, op, when, error, afterApply }),
  };
}
