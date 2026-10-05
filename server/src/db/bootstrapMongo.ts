import { Db } from 'mongodb';
import { getMongoDb } from './mongoClient.js';

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

const collections = [
  'profiles', 'projects', 'transcripts', 'creator_profiles', 'content_outputs',
  'usage_events', 'subscription_limits', 'clip_candidates', 'clips',
  'render_jobs', 'reframe_tracks',
] as const;

/** Idempotent index/bootstrap setup. Run with an app DB user allowed to create indexes. */
export async function bootstrapMongo(db?: Db): Promise<void> {
  const database = db ?? await getMongoDb();
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  for (const name of collections) {
    if (!existing.has(name)) {
      await database.createCollection(name, {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: name === 'subscription_limits' ? ['user_id', 'billing_period'] : ['id', 'user_id'],
            properties: {
              id: { bsonType: 'string', pattern: UUID_PATTERN },
              user_id: { bsonType: 'string', pattern: UUID_PATTERN },
              project_id: { bsonType: 'string', pattern: UUID_PATTERN },
              clip_id: { bsonType: 'string', pattern: UUID_PATTERN },
              created_at: { bsonType: 'date' },
              updated_at: { bsonType: 'date' },
            },
          },
        },
        validationLevel: 'strict',
      });
    }
  }

  await Promise.all([
    database.collection('profiles').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('projects').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('transcripts').createIndex({ id: 1 }, { unique: true }),
    database.collection('transcripts').createIndex({ project_id: 1 }, { unique: true }),
    database.collection('transcripts').createIndex({ user_id: 1, project_id: 1 }),
    database.collection('creator_profiles').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('content_outputs').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_outputs').createIndex({ project_id: 1, user_id: 1, created_at: -1 }),
    database.collection('usage_events').createIndex({ id: 1 }, { unique: true }),
    database.collection('usage_events').createIndex({ processing_attempt_id: 1 }, { unique: true }),
    database.collection('usage_events').createIndex({ user_id: 1, billing_period: 1 }),
    database.collection('subscription_limits').createIndex({ user_id: 1, billing_period: 1 }, { unique: true }),
    database.collection('clip_candidates').createIndex({ id: 1 }, { unique: true }),
    database.collection('clip_candidates').createIndex({ project_id: 1, engagement_score: -1 }),
    database.collection('clip_candidates').createIndex({ project_id: 1, start_segment_index: 1, end_segment_index: 1 }, { unique: true }),
    database.collection('clips').createIndex({ id: 1 }, { unique: true }),
    database.collection('clips').createIndex({ project_id: 1, user_id: 1, render_status: 1 }),
    database.collection('render_jobs').createIndex({ id: 1 }, { unique: true }),
    database.collection('render_jobs').createIndex({ clip_id: 1, user_id: 1, status: 1, created_at: -1 }),
    database.collection('reframe_tracks').createIndex({ id: 1 }, { unique: true }),
    database.collection('reframe_tracks').createIndex({ clip_id: 1, user_id: 1, status: 1 }),
    database.collection('reframe_tracks').createIndex({ clip_id: 1, analysis_version: 1 }, { unique: true }),
  ]);
}
