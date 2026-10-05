import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command,
  PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { AppError, isValidUUID } from '../types/index.js';

export type ObjectBucket = 'source' | 'clips';

/** Extension point for videos larger than the initial signed single PUT workflow. */
export interface MultipartUploadCapability {
  createMultipartUpload(bucket: ObjectBucket, key: string, contentType: string): Promise<{ uploadId: string }>;
  signPart(bucket: ObjectBucket, key: string, uploadId: string, partNumber: number): Promise<string>;
  completeMultipartUpload(bucket: ObjectBucket, key: string, uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>): Promise<void>;
  abortMultipartUpload(bucket: ObjectBucket, key: string, uploadId: string): Promise<void>;
}

let client: S3Client | undefined;

function storageClient(): S3Client {
  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    throw new AppError('Storage is unavailable.', 503, 'STORAGE_UNAVAILABLE');
  }
  client ??= new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint || `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: config.r2AccessKeyId, secretAccessKey: config.r2SecretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return client;
}

function bucketName(bucket: ObjectBucket): string {
  return bucket === 'source' ? config.r2SourceBucket : config.r2ClipsBucket;
}

function assertUUID(value: string): void {
  if (!isValidUUID(value)) throw new AppError('Invalid resource ID.', 400, 'INVALID_UUID');
}

export function safeFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new AppError('Unsafe filename.', 400, 'INVALID_FILENAME');
  }
  const safe = filename.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120);
  if (!safe || safe === '.' || safe === '..') throw new AppError('Unsafe filename.', 400, 'INVALID_FILENAME');
  return safe;
}

export function sourceObjectKey(userId: string, projectId: string, filename: string): string {
  assertUUID(userId); assertUUID(projectId);
  return `users/${userId}/projects/${projectId}/source/${crypto.randomUUID()}-${safeFilename(filename)}`;
}

export function renderObjectKey(userId: string, projectId: string, clipId: string, version: number): string {
  assertUUID(userId); assertUUID(projectId); assertUUID(clipId);
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError('Invalid render version.', 400, 'INVALID_RENDER_VERSION');
  return `users/${userId}/projects/${projectId}/clips/${clipId}/v${version}/render.mp4`;
}

export function projectObjectPrefix(userId: string, projectId: string): string {
  assertUUID(userId); assertUUID(projectId);
  return `users/${userId}/projects/${projectId}/`;
}

export function clipObjectPrefix(userId: string, projectId: string, clipId: string): string {
  assertUUID(clipId);
  return `${projectObjectPrefix(userId, projectId)}clips/${clipId}/`;
}

export async function signSourceUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(storageClient(), new PutObjectCommand({
    Bucket: bucketName('source'), Key: key, ContentType: contentType,
  }), { expiresIn: 900 });
}

export async function headObject(bucket: ObjectBucket, key: string): Promise<{ size: number; contentType: string }> {
  try {
    const result = await storageClient().send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? '' };
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
      throw new AppError('Uploaded object was not found.', 404, 'UPLOAD_NOT_FOUND');
    }
    throw new AppError('Storage is unavailable.', 503, 'STORAGE_UNAVAILABLE');
  }
}

export async function signObjectGet(bucket: ObjectBucket, key: string, filename?: string): Promise<string> {
  return getSignedUrl(storageClient(), new GetObjectCommand({
    Bucket: bucketName(bucket), Key: key,
    ...(filename ? { ResponseContentDisposition: `attachment; filename="${safeFilename(filename)}"` } : {}),
  }), { expiresIn: 300 });
}

/** Stream to a unique caller-owned temp path. The caller removes the file. */
export async function downloadObjectToFile(bucket: ObjectBucket, key: string, path: string): Promise<void> {
  try {
    const result = await storageClient().send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    if (!result.Body) throw new Error('Empty object body');
    await pipeline(result.Body as Readable, createWriteStream(path, { flags: 'wx' }));
  } catch {
    throw new AppError('Source object is unavailable.', 503, 'STORAGE_UNAVAILABLE');
  }
}

export async function uploadFile(bucket: ObjectBucket, key: string, path: string, size: number, contentType: string): Promise<void> {
  const { createReadStream } = await import('node:fs');
  try {
    await storageClient().send(new PutObjectCommand({
      Bucket: bucketName(bucket), Key: key, Body: createReadStream(path), ContentLength: size, ContentType: contentType,
    }));
  } catch {
    throw new AppError('Rendered object upload failed.', 503, 'STORAGE_UNAVAILABLE');
  }
}

export async function deleteObject(bucket: ObjectBucket, key: string): Promise<void> {
  await storageClient().send(new DeleteObjectsCommand({
    Bucket: bucketName(bucket), Delete: { Objects: [{ Key: key }], Quiet: true },
  }));
}

export async function deletePrefix(bucket: ObjectBucket, prefix: string): Promise<void> {
  let continuationToken: string | undefined;
  const keys: string[] = [];
  do {
    const listed = await storageClient().send(new ListObjectsV2Command({
      Bucket: bucketName(bucket), Prefix: prefix, ContinuationToken: continuationToken,
    }));
    keys.push(...(listed.Contents || []).flatMap((item) => item.Key ? [item.Key] : []));
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
  for (let i = 0; i < keys.length; i += 1000) {
    await storageClient().send(new DeleteObjectsCommand({
      Bucket: bucketName(bucket), Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
    }));
  }
}
