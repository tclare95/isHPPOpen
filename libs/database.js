import { MongoClient } from 'mongodb'

const { MONGODB_URI, MONGODB_DB } = process.env

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  )
}

if (!MONGODB_DB) {
  throw new Error(
    'Please define the MONGODB_DB environment variable inside .env.local'
  )
}

let cached = globalThis.mongo

if (!cached) {
  cached = globalThis.mongo = { conn: null, promise: null }
}

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    const client = new MongoClient(MONGODB_URI)
    cached.promise = client
      .connect()
      .then((connectedClient) => ({
        client: connectedClient,
        db: connectedClient.db(MONGODB_DB),
      }))
      .catch((error) => {
        cached.promise = null
        cached.conn = null
        throw error
      })
  }

  cached.conn = await cached.promise
  return cached.conn
}
