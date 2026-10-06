import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { expensiveLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listProjects,
  getProject,
  updateProject,
  createProject,
  ingestProjectUrl,
  createProjectUploadUrl,
  confirmProjectUpload,
  getProjectSourcePreviewUrl,
  deleteProject,
  processProject,
  getProjectTranscript,
  generateProjectContent,
  getProjectContent,
  updateProjectContent,
} from '../controllers/projectController.js';
import {
  analyzeProjectClips,
  getProjectClipCandidates,
  updateProjectClipCandidate,
  createProjectClip,
  getProjectClips,
  getClip,
  renderClip,
  deleteClip,
  getClipPreviewUrl,
  getClipDownloadUrl,
  getClipEditorData,
  updateClipEditor,
  resetClipEditor,
  getClipCaptions,
  analyzeClipReframe,
  getClipReframe,
} from '../controllers/clipController.js';


const router = Router();

// All project routes require authentication
router.get('/projects', requireAuth, asyncHandler(listProjects));
router.post('/projects', requireAuth, asyncHandler(createProject));
router.post('/projects/ingest-url', requireAuth, expensiveLimiter, asyncHandler(ingestProjectUrl));
router.post('/projects/:id/upload-url', requireAuth, asyncHandler(createProjectUploadUrl));
router.post('/projects/:id/confirm-upload', requireAuth, asyncHandler(confirmProjectUpload));
router.get('/projects/:id/source-preview-url', requireAuth, asyncHandler(getProjectSourcePreviewUrl));
router.get('/projects/:id', requireAuth, asyncHandler(getProject));
router.patch('/projects/:id', requireAuth, asyncHandler(updateProject));
router.delete('/projects/:id', requireAuth, asyncHandler(deleteProject));
router.post('/projects/:id/process', requireAuth, expensiveLimiter, asyncHandler(processProject));
router.get('/projects/:id/transcript', requireAuth, asyncHandler(getProjectTranscript));

// Phase 10: AI Auto Clip Finder Routes
router.post('/projects/:id/analyze-clips', requireAuth, expensiveLimiter, asyncHandler(analyzeProjectClips));
router.get('/projects/:id/clip-candidates', requireAuth, asyncHandler(getProjectClipCandidates));
router.patch('/projects/:id/clip-candidates/:candidateId', requireAuth, asyncHandler(updateProjectClipCandidate));

// Phase 11: Clip Rendering Engine Routes
router.post('/projects/:id/clips', requireAuth, expensiveLimiter, asyncHandler(createProjectClip));
router.get('/projects/:id/clips', requireAuth, asyncHandler(getProjectClips));
router.get('/clips/:clipId', requireAuth, asyncHandler(getClip));
router.post('/clips/:clipId/render', requireAuth, expensiveLimiter, asyncHandler(renderClip));
router.delete('/clips/:clipId', requireAuth, asyncHandler(deleteClip));
router.get('/clips/:clipId/preview-url', requireAuth, asyncHandler(getClipPreviewUrl));
router.get('/clips/:clipId/download-url', requireAuth, asyncHandler(getClipDownloadUrl));

// Phase 12: Focused Clip Editor & Caption Engine Routes
router.get('/clips/:clipId/editor', requireAuth, asyncHandler(getClipEditorData));
router.patch('/clips/:clipId/editor', requireAuth, asyncHandler(updateClipEditor));
router.post('/clips/:clipId/editor/reset', requireAuth, asyncHandler(resetClipEditor));
router.get('/clips/:clipId/captions', requireAuth, asyncHandler(getClipCaptions));

// Phase 13: Smart Auto-Reframe Routes
router.post('/clips/:clipId/reframe/analyze', requireAuth, expensiveLimiter, asyncHandler(analyzeClipReframe));
router.get('/clips/:clipId/reframe', requireAuth, asyncHandler(getClipReframe));


// Content Generation Routes
router.post('/projects/:id/generate-content', requireAuth, expensiveLimiter, asyncHandler(generateProjectContent));
router.get('/projects/:id/content', requireAuth, asyncHandler(getProjectContent));
router.patch('/projects/:id/content/:outputId', requireAuth, asyncHandler(updateProjectContent));

export default router;
