import { getMongoDb } from '../mongoClient.js';

/** Compare-and-set the processing state so two API instances cannot launch the same project. */
export async function claimProjectProcessing(userId: string, projectId: string,
  expectedStatus: string, expectedUpdatedAt: Date): Promise<boolean> {
  const db = await getMongoDb();
  const result = await db.collection('projects').updateOne({
    id: projectId, user_id: userId, video_status: expectedStatus, updated_at: expectedUpdatedAt,
  }, { $set: { video_status: 'processing', updated_at: new Date() } });
  return result.modifiedCount === 1;
}
