import { getMongoClient, getMongoDb } from '../mongoClient.js';

/** Remove related records after private object cleanup succeeds. */
export async function deleteProjectRecords(userId: string, projectId: string): Promise<void> {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { session });
      if (!project) return;
      const clips = await db.collection('clips').find({ user_id: userId, project_id: projectId }, { session })
        .project({ id: 1 }).toArray();
      const clipIds = clips.map((clip) => clip.id);
      for (const name of ['transcripts', 'content_outputs', 'clip_candidates', 'clips', 'reframe_tracks']) {
        await db.collection(name).deleteMany({ user_id: userId, project_id: projectId }, { session });
      }
      if (clipIds.length) await db.collection('render_jobs').deleteMany({ user_id: userId, clip_id: { $in: clipIds } }, { session });
      await db.collection('projects').deleteOne({ id: projectId, user_id: userId }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function deleteClipRecords(userId: string, clipId: string): Promise<void> {
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const clip = await db.collection('clips').findOne({ id: clipId, user_id: userId }, { session });
      if (!clip) return;
      await db.collection('render_jobs').deleteMany({ clip_id: clipId, user_id: userId }, { session });
      await db.collection('reframe_tracks').deleteMany({ clip_id: clipId, user_id: userId }, { session });
      await db.collection('clips').deleteOne({ id: clipId, user_id: userId }, { session });
    });
  } finally {
    await session.endSession();
  }
}
