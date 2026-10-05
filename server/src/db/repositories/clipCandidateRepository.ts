import crypto from 'node:crypto';
import { AppError } from '../../types/index.js';
import { getMongoClient, getMongoDb } from '../mongoClient.js';
import { validateRecord } from '../schemaValidation.js';

/** Replace suggestions atomically while preserving candidates the user selected. */
export async function replaceSuggestedCandidates(userId: string, projectId: string,
  candidates: Array<Record<string, unknown>>) {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { session });
      if (!project) throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      const collection = db.collection('clip_candidates');
      const selected = await collection.find({ project_id: projectId, user_id: userId, status: 'selected' }, { session }).toArray();
      const selectedKeys = new Set(selected.map((row) => `${row.start_segment_index}-${row.end_segment_index}`));
      const now = new Date();
      const rows = candidates.filter((candidate) => !selectedKeys.has(
        `${candidate.start_segment_index}-${candidate.end_segment_index}`)).map((candidate) => ({
        ...candidate, id: crypto.randomUUID(), project_id: projectId, user_id: userId,
        status: 'suggested', metadata: candidate.metadata || {}, created_at: now, updated_at: now,
      }));
      for (const row of rows) validateRecord('clip_candidates', row);
      await collection.deleteMany({ project_id: projectId, user_id: userId,
        status: { $in: ['suggested', 'dismissed'] } }, { session });
      if (rows.length) await collection.insertMany(rows, { session });
      return collection.find({ project_id: projectId, user_id: userId }, { session, projection: { _id: 0 } })
        .sort({ engagement_score: -1 }).toArray();
    });
  } finally {
    await session.endSession();
  }
}
