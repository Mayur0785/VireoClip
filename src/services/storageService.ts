import { backendRequest } from './backendClient';

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
export const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  'video/x-matroska', 'video/avi', 'video/mkv',
];
const extensionMime: Record<string, string> = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
};
const videoMime = (file: File): string => file.type || extensionMime[file.name.match(/\.[^.]+$/)?.[0].toLowerCase() || ''] || '';

export interface ValidationResult { valid: boolean; error?: string }
export interface UploadOptions {
  file: File;
  projectId: string;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
}
export interface UploadResult { fileName: string; fileSize: number; mimeType: string }

export function validateVideoFile(file: File | null | undefined): ValidationResult {
  if (!file) return { valid: false, error: 'No video file provided.' };
  if (file.size <= 0) return { valid: false, error: 'Selected file is empty.' };
  if (file.size > MAX_VIDEO_BYTES) return { valid: false, error: 'Maximum video size is 2 GiB.' };
  if (file.name.includes('/') || file.name.includes('\\') || file.name.includes('..')) {
    return { valid: false, error: 'Filename contains unsupported path characters.' };
  }
  const extension = file.name.match(/\.[^.]+$/)?.[0].toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.includes(extension) || !ALLOWED_MIME_TYPES.includes(videoMime(file).toLowerCase())) {
    return { valid: false, error: 'Supported formats are MP4, MOV, WEBM, AVI, and MKV.' };
  }
  return { valid: true };
}

export async function uploadVideoFile({ file, projectId, onProgress, signal }: UploadOptions): Promise<UploadResult> {
  const validation = validateVideoFile(file);
  if (!validation.valid) throw new Error(validation.error);
  if (signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError');

  const mimeType = videoMime(file);
  const grant = await backendRequest<{ uploadUrl: string; headers: Record<string, string> }>(
    `/projects/${projectId}/upload-url`, {
      method: 'POST', signal, body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: mimeType }),
    });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    xhr.open('PUT', grant.uploadUrl);
    for (const [name, value] of Object.entries(grant.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100)));
      }
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', cancel);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        const diagCode = xhr.status === 403
          ? 'UPLOAD_CORS_FAILED'
          : xhr.status === 400
            ? 'UPLOAD_MISMATCH'
            : 'UPLOAD_FAILED';
        if (import.meta.env.DEV) {
          console.warn(`[StorageUpload] Direct upload failed with status ${xhr.status}`, { code: diagCode });
        }
        reject(new Error('Upload failed. Please try again.'));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', cancel);
      if (import.meta.env.DEV) {
        console.warn('[StorageUpload] Network or CORS error during direct upload', { code: 'UPLOAD_NETWORK_FAILED' });
      }
      reject(new Error('Upload failed due to a network error. Please check your connection and try again.'));
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', cancel);
      reject(new DOMException('Upload cancelled.', 'AbortError'));
    };
    xhr.send(file);
  });

  try {
    await backendRequest(`/projects/${projectId}/confirm-upload`, { method: 'POST', signal });
  } catch (err: any) {
    if (import.meta.env.DEV) {
      console.warn('[StorageUpload] Upload confirmation failed', { code: 'UPLOAD_CONFIRM_FAILED' });
    }
    throw new Error(err.message || 'Upload confirmation failed. Please try again.');
  }
  onProgress?.(100);
  return { fileName: file.name, fileSize: file.size, mimeType };
}
