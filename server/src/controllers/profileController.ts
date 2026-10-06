import { Response } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { dataRepository } from '../db/repositories/dataRepository.js';

export const creatorFields = [
  'brand_name',
  'niche',
  'target_audience',
  'brand_description',
  'language',
  'tone',
  'custom_tone',
  'content_goals',
  'website_url',
  'newsletter_url',
  'podcast_url',
  'youtube_cta',
  'instagram_cta',
  'linkedin_cta',
  'twitter_cta',
  'tiktok_cta',
  'preferred_hook_style',
  'brand_rules',
  'forbidden_phrases',
];

/**
 * Normalizes forbidden phrases: trims, splits by comma/semicolon/newline,
 * deduplicates case-insensitively, and joins as comma-separated list.
 */
export function normalizeForbiddenPhrases(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const seen = new Set<string>();
  const list: string[] = [];

  for (const part of raw.split(/[,;\n]/)) {
    const trimmed = part.trim().replace(/\s+/g, ' ');
    if (trimmed.length > 1) {
      const lower = trimmed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(trimmed);
      }
    }
  }

  return list.join(', ');
}

/**
 * Validates and sanitizes creator profile fields.
 */
export function validateAndSanitizeCreatorProfile(raw: Record<string, unknown>): {
  sanitized: Record<string, string>;
  error?: string;
} {
  const sanitized: Record<string, string> = {};

  for (const field of creatorFields) {
    const value = raw[field];
    if (value === undefined || value === null) continue;

    if (typeof value !== 'string') {
      return { sanitized: {}, error: `Field "${field}" must be a string.` };
    }

    if (value.length > 2000) {
      return { sanitized: {}, error: `Field "${field}" exceeds maximum length of 2000 characters.` };
    }

    if (field === 'forbidden_phrases') {
      sanitized[field] = normalizeForbiddenPhrases(value);
    } else {
      sanitized[field] = value.trim();
    }
  }

  return { sanitized };
}

export const getProfiles = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  let { data: profile, error } = await dataRepository.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error('Profile database unavailable.');
  if (!profile) {
    const created = await dataRepository.from('profiles').insert({
      id: user.id,
      email: user.email || '',
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator',
    }).select().single();
    if (created.error) throw new Error('Profile database unavailable.');
    profile = created.data;
  }
  let { data: creatorProfile, error: creatorError } = await dataRepository.from('creator_profiles')
    .select('*').eq('user_id', user.id).maybeSingle();
  if (creatorError) throw new Error('Profile database unavailable.');
  if (!creatorProfile) {
    const created = await dataRepository.from('creator_profiles').insert({
      niche: '',
      target_audience: '',
      language: 'English',
      tone: 'Friendly',
    }).select().single();
    if (created.error) throw new Error('Profile database unavailable.');
    creatorProfile = created.data;
  }
  res.status(200).json({ status: 'ok', profile, creatorProfile });
};

export const saveProfiles = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const fullName = req.body?.full_name;
  if (typeof fullName !== 'string' || fullName.trim().length > 120) {
    res.status(400).json({ status: 'error', code: 'INVALID_NAME', message: 'Valid name required (max 120 chars).' });
    return;
  }

  const rawCreator = req.body?.creatorProfile;
  let creatorUpdates: Record<string, string> = {};
  if (rawCreator && typeof rawCreator === 'object') {
    const validation = validateAndSanitizeCreatorProfile(rawCreator as Record<string, unknown>);
    if (validation.error) {
      res.status(400).json({ status: 'error', code: 'INVALID_PROFILE', message: validation.error });
      return;
    }
    creatorUpdates = validation.sanitized;
  }

  const profileResult = await dataRepository.from('profiles').update({ full_name: fullName.trim() })
    .eq('id', user.id).select().maybeSingle();
  if (profileResult.error || !profileResult.data) throw new Error('Profile database unavailable.');

  const creatorResult = await dataRepository.from('creator_profiles').upsert(
    { user_id: user.id, ...creatorUpdates },
    { onConflict: 'user_id' }
  ).select().single();
  if (creatorResult.error) throw new Error('Profile database unavailable.');

  res.status(200).json({ status: 'ok', profile: profileResult.data, creatorProfile: creatorResult.data });
};

/**
 * GET /api/creator-profile
 * Direct endpoint for fetching the authenticated user's creator profile.
 */
export const getCreatorProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  let { data: creatorProfile, error } = await dataRepository.from('creator_profiles')
    .select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw new Error('Profile database unavailable.');

  if (!creatorProfile) {
    const created = await dataRepository.from('creator_profiles').insert({
      niche: '',
      target_audience: '',
      language: 'English',
      tone: 'Friendly',
    }).select().single();
    if (created.error) throw new Error('Profile database unavailable.');
    creatorProfile = created.data;
  }

  res.status(200).json({ status: 'ok', creatorProfile });
};

/**
 * PUT/PATCH /api/creator-profile
 * Direct endpoint for updating the authenticated user's creator profile.
 */
export const updateCreatorProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const rawCreator = req.body?.creatorProfile || req.body;

  if (!rawCreator || typeof rawCreator !== 'object') {
    res.status(400).json({ status: 'error', code: 'INVALID_BODY', message: 'Creator profile payload required.' });
    return;
  }

  const validation = validateAndSanitizeCreatorProfile(rawCreator as Record<string, unknown>);
  if (validation.error) {
    res.status(400).json({ status: 'error', code: 'INVALID_PROFILE', message: validation.error });
    return;
  }

  const creatorResult = await dataRepository.from('creator_profiles').upsert(
    { user_id: user.id, ...validation.sanitized },
    { onConflict: 'user_id' }
  ).select().single();
  if (creatorResult.error) throw new Error('Profile database unavailable.');

  res.status(200).json({ status: 'ok', creatorProfile: creatorResult.data });
};

