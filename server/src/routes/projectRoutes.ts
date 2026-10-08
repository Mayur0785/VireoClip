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
  generateClipProducerPlan,
  getClipProducerPlans,
  getClipProducerPlan,
  reviseClipProducerPlan,
  previewClipProducerPlan,
  applyClipProducerPlan,
  deleteClipProducerPlan,
} from '../controllers/clipController.js';
import {
  findProjectMoments,
  getProjectMultimodalTimeline,
  startMultimodalAnalysis,
  getMultimodalJobStatus,
} from '../controllers/multimodalController.js';
import {
  getOrCreateClipEditorProject,
  getEditorProject,
  updateEditorProject,
  splitEditorItem,
  rippleDeleteEditorItem,
  duplicateEditorItem,
  freezeEditorItem,
  captureEditorSnapshot,
} from '../controllers/proEditorController.js';
import {
  getMediaCapabilities,
  searchMedia,
  listMediaAssets,
  getMediaAsset,
  getSimilarMediaAssets,
  importRemoteMedia,
  detectClipBrollOpportunities,
  createClipBrollPlan,
  getClipBrollPlan,
  applyBrollPlan,
  insertDirectBroll,
} from '../controllers/mediaController.js';
import { AudioStudioController } from '../controllers/audioStudioController.js';
import { TranslationController } from '../controllers/translationController.js';

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

// Phase 16: Multimodal Video Intelligence Routes
router.post('/projects/:id/find-moments', requireAuth, expensiveLimiter, asyncHandler(findProjectMoments));
router.get('/projects/:id/multimodal-timeline', requireAuth, asyncHandler(getProjectMultimodalTimeline));
router.post('/projects/:id/analyze-multimodal', requireAuth, expensiveLimiter, asyncHandler(startMultimodalAnalysis));
router.get('/projects/:id/multimodal-job', requireAuth, asyncHandler(getMultimodalJobStatus));

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

// Phase 17: Vireo Producer (AI Editing Agent) Routes
router.post('/clips/:clipId/producer/plan', requireAuth, expensiveLimiter, asyncHandler(generateClipProducerPlan));
router.get('/clips/:clipId/producer/plans', requireAuth, asyncHandler(getClipProducerPlans));
router.get('/clips/:clipId/producer/plans/:planId', requireAuth, asyncHandler(getClipProducerPlan));
router.post('/clips/:clipId/producer/plans/:planId/revise', requireAuth, expensiveLimiter, asyncHandler(reviseClipProducerPlan));
router.post('/clips/:clipId/producer/plans/:planId/preview', requireAuth, expensiveLimiter, asyncHandler(previewClipProducerPlan));
router.post('/clips/:clipId/producer/plans/:planId/apply', requireAuth, expensiveLimiter, asyncHandler(applyClipProducerPlan));
router.delete('/clips/:clipId/producer/plans/:planId', requireAuth, asyncHandler(deleteClipProducerPlan));

// Phase 18: Vireo Pro Video Editor (Multi-Track Timeline) Routes
router.post('/clips/:clipId/editor-project', requireAuth, asyncHandler(getOrCreateClipEditorProject));
router.get('/editor-projects/:id', requireAuth, asyncHandler(getEditorProject));
router.patch('/editor-projects/:id', requireAuth, asyncHandler(updateEditorProject));
router.post('/editor-projects/:id/split', requireAuth, asyncHandler(splitEditorItem));
router.post('/editor-projects/:id/ripple-delete', requireAuth, asyncHandler(rippleDeleteEditorItem));
router.post('/editor-projects/:id/duplicate', requireAuth, asyncHandler(duplicateEditorItem));
router.post('/editor-projects/:id/freeze', requireAuth, asyncHandler(freezeEditorItem));
router.post('/editor-projects/:id/snapshot', requireAuth, asyncHandler(captureEditorSnapshot));
router.post('/editor-projects/:id/insert-broll', requireAuth, asyncHandler(insertDirectBroll));

// Phase 19: Vireo AI B-Roll & Media Intelligence Routes
router.get('/media/capabilities', requireAuth, asyncHandler(getMediaCapabilities));
router.post('/media/search', requireAuth, asyncHandler(searchMedia));
router.get('/media/assets', requireAuth, asyncHandler(listMediaAssets));
router.get('/media/assets/:id', requireAuth, asyncHandler(getMediaAsset));
router.get('/media/assets/:id/similar', requireAuth, asyncHandler(getSimilarMediaAssets));
router.post('/media/import', requireAuth, expensiveLimiter, asyncHandler(importRemoteMedia));

router.post('/clips/:clipId/broll/opportunities', requireAuth, asyncHandler(detectClipBrollOpportunities));
router.post('/clips/:clipId/broll/plan', requireAuth, expensiveLimiter, asyncHandler(createClipBrollPlan));
router.get('/clips/:clipId/broll/plan', requireAuth, asyncHandler(getClipBrollPlan));
router.post('/broll-plans/:planId/apply', requireAuth, asyncHandler(applyBrollPlan));

// Phase 20: Vireo Audio + Voice Studio Routes
router.post('/audio/analyze', requireAuth, asyncHandler(AudioStudioController.analyzeAudio));
router.post('/audio/enhance-preview', requireAuth, expensiveLimiter, asyncHandler(AudioStudioController.enhancePreview));
router.post('/audio/filler-words', requireAuth, asyncHandler(AudioStudioController.detectFillerWords));
router.post('/audio/repeated-phrases', requireAuth, asyncHandler(AudioStudioController.detectRepeatedPhrases));
router.post('/audio/silence-tighten', requireAuth, asyncHandler(AudioStudioController.calculateSilenceTightening));
router.get('/audio/capabilities', requireAuth, asyncHandler(AudioStudioController.getCapabilities));
router.get('/audio/voices', requireAuth, asyncHandler(AudioStudioController.listVoices));
router.post('/audio/voiceover/preview', requireAuth, expensiveLimiter, asyncHandler(AudioStudioController.generateVoiceover));
router.post('/audio/voice-clone', requireAuth, expensiveLimiter, asyncHandler(AudioStudioController.cloneVoice));
router.post('/editor-projects/:id/audio-studio', requireAuth, asyncHandler(AudioStudioController.applyAudioStudio));

// Phase 21: Vireo Translate + Multilingual Dubbing Routes
router.get('/translation/languages', requireAuth, asyncHandler(TranslationController.getLanguages));
router.post('/translation/detect', requireAuth, asyncHandler(TranslationController.detectLanguage));
router.post('/translation/projects', requireAuth, asyncHandler(TranslationController.createProject));
router.get('/translation/projects/:id', requireAuth, asyncHandler(TranslationController.getProject));
router.get('/translation/clips/:clipId/projects', requireAuth, asyncHandler(TranslationController.listProjectsForClip));
router.post('/translation/projects/:id/translate', requireAuth, expensiveLimiter, asyncHandler(TranslationController.translateProject));
router.put('/translation/projects/:id/segments/:segmentId', requireAuth, asyncHandler(TranslationController.updateSegmentText));
router.post('/translation/projects/:id/approve-all', requireAuth, asyncHandler(TranslationController.approveAllSegments));
router.post('/translation/projects/:id/export-subtitles', requireAuth, asyncHandler(TranslationController.exportSubtitles));
router.post('/translation/dub-projects', requireAuth, asyncHandler(TranslationController.createDubProject));
router.get('/translation/capabilities', requireAuth, asyncHandler(TranslationController.getCapabilities));

import { ContentPackController } from '../controllers/contentPackController.js';

// Content Generation Routes
router.post('/projects/:id/generate-content', requireAuth, expensiveLimiter, asyncHandler(generateProjectContent));
router.get('/projects/:id/content', requireAuth, asyncHandler(getProjectContent));
router.patch('/projects/:id/content/:outputId', requireAuth, asyncHandler(updateProjectContent));

// Phase 23: Content Pack Clip Routes
router.post('/projects/:projectId/clips/:clipId/content-pack', requireAuth, expensiveLimiter, asyncHandler(ContentPackController.generateContentPack));
router.get('/projects/:projectId/clips/:clipId/content-packs', requireAuth, asyncHandler(ContentPackController.listPacksForClip));

import { HookLabController } from '../controllers/hookLabController.js';

// Phase 24: Vireo Hook Lab Clip Routes
router.post('/projects/:projectId/clips/:clipId/hook-lab', requireAuth, expensiveLimiter, asyncHandler(HookLabController.createOrGetSession));
router.get('/projects/:projectId/clips/:clipId/hook-lab', requireAuth, asyncHandler(HookLabController.createOrGetSession));

export default router;
