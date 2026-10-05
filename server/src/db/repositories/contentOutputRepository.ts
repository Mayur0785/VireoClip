import crypto from 'node:crypto';
import { AppError, OutputPlatform } from '../../types/index.js';
import { getMongoClient, getMongoDb } from '../mongoClient.js';
import { validateRecord } from '../schemaValidation.js';

/** Replace generated content atomically so a failed insert cannot erase prior output. */
export async function replaceContentOutputs(userId: string, projectId: string,
  rows: Array<Record<string, unknown>>, platform?: OutputPlatform) {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { session });
      if (!project) throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      const now = new Date();
      const documents: Array<Record<string, unknown>> = rows.map((row) => ({ ...row, id: crypto.randomUUID(), user_id: userId,
        project_id: projectId, created_at: now, updated_at: now }));
      for (const document of documents) {
        validateRecord('content_outputs', document);
        if ((platform && document.platform !== platform) ||
            typeof document.content !== 'string' || typeof document.content_type !== 'string' ||
            !Number.isSafeInteger(document.position) || Number(document.position) < 0) {
          throw new AppError('Generated content row is invalid.', 400, 'INVALID_CONTENT_OUTPUT');
        }
      }
      await db.collection('content_outputs').deleteMany({ project_id: projectId, user_id: userId,
        ...(platform ? { platform } : {}) }, { session });
      if (documents.length) await db.collection('content_outputs').insertMany(documents, { session });
      return documents.map((document) => ({ ...document,
        created_at: now.toISOString(), updated_at: now.toISOString() }));
    });
  } finally {
    await session.endSession();
  }
}
