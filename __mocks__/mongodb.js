// Mock for mongodb
module.exports = {
  ObjectID: jest.fn(id => id)
};

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.test');
}