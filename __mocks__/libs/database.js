// Mock database implementation
const connectToDatabase = jest.fn().mockResolvedValue({
  db: {
    collection: jest.fn().mockReturnValue({
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      findOne: jest.fn().mockResolvedValue({}),
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
    })
  },
  client: {
    close: jest.fn()
  }
});

module.exports = { connectToDatabase };