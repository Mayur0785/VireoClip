import { Db, MongoClient } from 'mongodb';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';

let client: MongoClient | null = null;
let connecting: Promise<Db> | null = null;

export const isMongoConfigured = Boolean(config.mongodbUri && config.mongodbDbName);

/** One lazy connection pool for the process. A failed attempt may be retried. */
export async function getMongoDb(): Promise<Db> {
  if (!isMongoConfigured) {
    throw new AppError('Database is not configured.', 503, 'DATABASE_UNAVAILABLE');
  }
  if (client) return client.db(config.mongodbDbName);
  if (!connecting) {
    const candidate = new MongoClient(config.mongodbUri, {
      appName: 'vireo-api',
      maxPoolSize: 20,
      connectTimeoutMS: 8_000,
      serverSelectionTimeoutMS: 8_000,
    });
    connecting = candidate.connect()
      .then(async () => {
        const db = candidate.db(config.mongodbDbName);
        await db.command({ ping: 1 });
        client = candidate;
        return db;
      })
      .catch(async () => {
        await candidate.close().catch(() => undefined);
        connecting = null;
        throw new AppError('Database is unavailable.', 503, 'DATABASE_UNAVAILABLE');
      });
  }
  return connecting;
}

export async function getMongoClient(): Promise<MongoClient> {
  await getMongoDb();
  if (!client) throw new AppError('Database is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  return client;
}

export async function closeMongo(): Promise<void> {
  const current = client;
  client = null;
  connecting = null;
  await current?.close();
}

export async function isMongoHealthy(): Promise<boolean> {
  if (!isMongoConfigured) return false;
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1, maxTimeMS: 2_000 });
    return true;
  } catch {
    return false;
  }
}
