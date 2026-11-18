// In-memory stand-in for the `eventschemas` collection, covering only the operators eventsService uses.
const { ObjectId } = jest.requireActual('mongodb');

const get = (doc, key) => doc[key];
const compare = (a, b) => (a instanceof Date ? a.getTime() : a) - (b instanceof Date ? b.getTime() : b);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') return condition.every((clause) => matches(doc, clause));
    if (key === '$or') return condition.some((clause) => matches(doc, clause));
    const value = get(doc, key);
    if (key === '_id') return value.equals(condition);
    return Object.entries(condition).every(([op, operand]) => {
      if (op === '$gte') return compare(value, operand) >= 0;
      if (op === '$lt') return compare(value, operand) < 0;
      if (op === '$regex') return new RegExp(operand, condition.$options).test(value ?? '');
      if (op === '$options') return true;
      throw new Error(`unsupported ${op}`);
    });
  });
}

function createEventsCollection(docs) {
  const calls = [];
  return {
    docs,
    calls,
    countDocuments: jest.fn(async (filter) => docs.filter((doc) => matches(doc, filter)).length),
    find: jest.fn((filter) => {
      const cursor = { sortSpec: {}, skipCount: 0, limitCount: Infinity };
      const chain = {
        sort(spec) { cursor.sortSpec = spec; return chain; },
        skip(count) { cursor.skipCount = count; calls.push({ skip: count }); return chain; },
        limit(count) { cursor.limitCount = count; calls.push({ limit: count }); return chain; },
        async toArray() {
          const [[field, direction]] = Object.entries(cursor.sortSpec);
          return docs.filter((doc) => matches(doc, filter))
            .sort((a, b) => direction * compare(a[field], b[field]))
            .slice(cursor.skipCount, cursor.skipCount + cursor.limitCount);
        },
      };
      return chain;
    }),
    insertOne: jest.fn(async (doc) => {
      const _id = new ObjectId();
      docs.push({ _id, ...doc });
      return { acknowledged: true, insertedId: _id };
    }),
    updateOne: jest.fn(async (filter, update, options) => {
      const doc = docs.find((candidate) => matches(candidate, filter));
      if (!doc) {
        if (options?.upsert) throw new Error('upsert must never be used for event updates');
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      const changed = Object.entries(update.$set).some(([key, value]) => compare(doc[key], value) !== 0 && doc[key] !== value);
      Object.assign(doc, update.$set);
      return { acknowledged: true, matchedCount: 1, modifiedCount: changed ? 1 : 0 };
    }),
    deleteOne: jest.fn(async (filter) => {
      const index = docs.findIndex((doc) => matches(doc, filter));
      if (index >= 0) docs.splice(index, 1);
      return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
    }),
  };
}

module.exports = { createEventsCollection, compare, matches };
