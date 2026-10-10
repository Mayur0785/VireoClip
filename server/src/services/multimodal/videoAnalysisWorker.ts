import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { getMongoDb } from '../../db/mongoClient.js';
import { downloadObjectToFile } from '../objectStorageService.js';
import { logger } from '../../utils/logger.js';
import {
  VideoAnalysisJobRecord,
  VideoAnalysisRecord,
  TranscriptSegment,
  VideoAnalysisStatus,
  VideoAnalysisJobStage,
} from '../../types/index.js';
import { VideoSceneService } from './videoSceneService.js';
import { AudioFeatureService } from './audioFeatureService.js';
import { OcrFeatureService } from './ocrFeatureService.js';
import { FaceFeatureService } from './faceFeatureService.js';
import { MultimodalTimelineService } from './multimodalTimelineService.js';
import { JobReliabilityService } from '../queue/jobReliabilityService.js';

export class VideoAnalysisWorker {
  private static workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

  /**
   * Enqueues an analysis job or returns existing pending/running job.
   */
  public static async enqueueJob(projectId: string, userId: string): Promise<VideoAnalysisJobRecord> {
    const db = await getMongoDb();
    const col = db.collection<VideoAnalysisJobRecord>('video_analysis_jobs');

    const existing = await col.findOne({
      project_id: projectId,
      status: { $in: ['queued', 'processing'] },
    });

    if (existing) {
      return existing;
    }

    const now = new Date();
    const newJob: VideoAnalysisJobRecord = {
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      attempts: 0,
      max_attempts: 3,
      worker_id: null,
      locked_at: null,
      next_retry_at: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    };

    await col.insertOne(newJob as any);
    return newJob;
  }

  /**
   * Atomically claims the next queued or expired job from MongoDB.
   * Lock lease timeout: 5 minutes (300,000 ms).
   */
  public static async claimNextJob(): Promise<VideoAnalysisJobRecord | null> {
    const db = await getMongoDb();
    const col = db.collection<VideoAnalysisJobRecord>('video_analysis_jobs');
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() - 5 * 60 * 1000);
    const retryDue = { $or: [{ next_retry_at: null }, { next_retry_at: { $lte: now } }] };

    const claimed = await col.findOneAndUpdate(
      {
        $and: [
          retryDue,
          {
            $or: [
              { status: 'queued', attempts: { $lt: 3 } },
              { status: 'processing', locked_at: { $lt: leaseExpiry }, attempts: { $lt: 3 } },
            ],
          },
        ],
      },
      {
        $set: {
          status: 'processing',
          worker_id: this.workerId,
          locked_at: now,
          updated_at: now,
        },
        $inc: { attempts: 1 },
      },
      {
        sort: { created_at: 1 },
        returnDocument: 'after',
      }
    );

    return (claimed as VideoAnalysisJobRecord) || null;
  }

  /**
   * Updates job stage and progress in MongoDB.
   */
  public static async updateJobStage(
    jobId: string,
    stage: VideoAnalysisJobStage,
    progress: number,
    status: VideoAnalysisStatus = 'processing',
    errorMessage?: string
  ): Promise<void> {
    const db = await getMongoDb();
    const col = db.collection<VideoAnalysisJobRecord>('video_analysis_jobs');
    await col.updateOne(
      { id: jobId },
      {
        $set: {
          stage,
          progress: Math.min(100, Math.max(0, progress)),
          status,
          ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
          updated_at: new Date(),
        },
      }
    );
  }

  /**
   * Processes a single claimed job to completion.
   */
  public static async processJob(job: VideoAnalysisJobRecord): Promise<VideoAnalysisRecord> {
    const db = await getMongoDb();
    const projectsCol = db.collection('projects');
    const transcriptsCol = db.collection('transcripts');

    const project = await projectsCol.findOne({ id: job.project_id });
    if (!project) {
      await this.updateJobStage(job.id, 'failed', 0, 'failed', 'Project not found');
      throw new Error(`Project ${job.project_id} not found.`);
    }

    const transcript = await transcriptsCol.findOne({ project_id: job.project_id });
    if (!transcript || !transcript.transcript_text) {
      await this.updateJobStage(job.id, 'failed', 0, 'failed', 'Transcript not found');
      throw new Error(`Transcript not found for project ${job.project_id}.`);
    }

    const rawSegments = transcript.segments || [];
    const segments: TranscriptSegment[] = rawSegments.map((s: any) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text || ''),
      words: s.words,
    }));

    const durationSeconds = Number(transcript.duration_seconds || project.duration_seconds || 60);

    const tag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const rawTempDir = path.join(os.tmpdir(), `vireo-analysis-${job.id}-${tag}`);
    fs.mkdirSync(rawTempDir, { recursive: true });
    const tempDir = fs.realpathSync(rawTempDir);
    const videoPath = path.join(tempDir, 'source.mp4');

    let keyframeCleanup: (() => void) | null = null;

    try {
      // Step 0: Obtain source video
      if (project.storage_path) {
        await downloadObjectToFile('source', project.storage_path, videoPath);
      } else if (project.source_url && fs.existsSync(project.source_url)) {
        fs.copyFileSync(project.source_url, videoPath);
      } else {
        throw new Error('Project has no accessible source video file or storage path.');
      }

      // Step 1: Detect Visual Scene Cuts (20%)
      await this.updateJobStage(job.id, 'extracting_scenes', 20);
      const sceneCuts = await VideoSceneService.detectSceneCuts(videoPath, 0.25);

      // Step 2: Extract Audio Silence & Loudness (40%)
      await this.updateJobStage(job.id, 'analyzing_audio', 40);
      const [silenceIntervals, volumeStats] = await Promise.all([
        AudioFeatureService.detectSilenceIntervals(videoPath, -30, 0.3),
        AudioFeatureService.detectAudioVolume(videoPath),
      ]);

      // Step 3: Extract Keyframes (60%)
      await this.updateJobStage(job.id, 'extracting_keyframes', 60);
      const cutTimestamps = sceneCuts.map((c) => c.timestamp);
      const { keyframes, cleanup } = await VideoSceneService.extractKeyframes({
        videoPath,
        timestamps: cutTimestamps,
        maxKeyframes: 20,
        videoDuration: durationSeconds,
      });
      keyframeCleanup = cleanup;

      // Step 4: Run Real Local OCR (75%)
      await this.updateJobStage(job.id, 'running_ocr', 75);
      const ocrSummary = await OcrFeatureService.processKeyframes(keyframes, 16);

      // Step 5: Detect Faces with CV (90%)
      await this.updateJobStage(job.id, 'detecting_faces', 90);
      const faceResult = await FaceFeatureService.analyzeFacePresence(
        videoPath,
        durationSeconds,
        1.5
      );

      // Step 6: Fuse Multimodal Timeline (100%)
      await this.updateJobStage(job.id, 'fusing_timeline', 95);
      const fusedTimeline = MultimodalTimelineService.fuseTimeline({
        projectId: job.project_id,
        durationSeconds,
        segments,
        sceneCuts,
        keyframes,
        silenceIntervals,
        faceIntervals: faceResult.intervals,
        audioEnergyDb: volumeStats.mean_volume_db,
        facePresenceRatio: faceResult.face_presence_ratio,
        ocrStatus: ocrSummary.ocr_status,
      });

      const savedRecord = await MultimodalTimelineService.persistAnalysis({
        projectId: job.project_id,
        userId: job.user_id,
        timeline: fusedTimeline,
      });

      if (!savedRecord || !savedRecord.id) {
        throw new Error('Deliverable verification failed: video analysis record was not saved');
      }

      await this.updateJobStage(job.id, 'completed', 100, 'completed');
      logger.info(`[VideoAnalysisWorker] Multimodal analysis completed for project ${job.project_id}`);

      return savedRecord;
    } catch (err: any) {
      logger.error(`[VideoAnalysisWorker] Analysis job ${job.id} failed: ${err.message}`);
      const sanitized = JobReliabilityService.sanitizeErrorMessage(err);
      const isTransient = JobReliabilityService.isTransientError(err);
      const currentAttempts = (job.attempts || 1);
      const maxAttempts = job.max_attempts || 3;

      if (isTransient && currentAttempts < maxAttempts) {
        const delayMs = JobReliabilityService.computeBackoffDelayMs(currentAttempts, { baseDelayMs: 5000, maxDelayMs: 60000 });
        const nextRetryAt = new Date(Date.now() + delayMs);
        const db = await getMongoDb();
        const col = db.collection<VideoAnalysisJobRecord>('video_analysis_jobs');
        await col.updateOne(
          { id: job.id },
          {
            $set: {
              status: 'queued',
              stage: 'queued',
              error_message: sanitized,
              next_retry_at: nextRetryAt,
              updated_at: new Date(),
            },
          }
        );
      } else {
        await this.updateJobStage(job.id, 'failed', 0, 'failed', sanitized);
      }
      throw err;
    } finally {
      if (keyframeCleanup) {
        keyframeCleanup();
      }
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr: any) {
        logger.warn(`[VideoAnalysisWorker] Temp clean warning: ${rmErr.message}`);
      }
    }
  }

  /**
   * Convenience runner: checks for next job and processes it.
   */
  public static async processNext(): Promise<boolean> {
    const job = await this.claimNextJob();
    if (!job) return false;
    try {
      await this.processJob(job);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets job status for a project and user.
   */
  public static async getJobStatus(projectId: string, userId: string): Promise<VideoAnalysisJobRecord | null> {
    const db = await getMongoDb();
    const col = db.collection<VideoAnalysisJobRecord>('video_analysis_jobs');
    return col.findOne({ project_id: projectId, user_id: userId }, { sort: { created_at: -1 } });
  }
}
