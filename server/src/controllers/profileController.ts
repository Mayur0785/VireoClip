import { Response } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { dataRepository } from '../db/repositories/dataRepository.js';

const creatorFields = [
  'niche', 'target_audience', 'language', 'tone', 'custom_tone', 'website_url',
  'newsletter_url', 'podcast_url', 'youtube_cta', 'instagram_cta', 'linkedin_cta',
  'twitter_cta', 'tiktok_cta', 'preferred_hook_style', 'brand_rules', 'forbidden_phrases',
];

export const getProfiles = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  let { data: profile, error } = await dataRepository.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error('Profile database unavailable.');
  if (!profile) {
    const created = await dataRepository.from('profiles').insert({ id: user.id,
      email: user.email || '', full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator',
    }).select().single();
    if (created.error) throw new Error('Profile database unavailable.');
    profile = created.data;
  }
  let { data: creatorProfile, error: creatorError } = await dataRepository.from('creator_profiles')
    .select('*').eq('user_id', user.id).maybeSingle();
  if (creatorError) throw new Error('Profile database unavailable.');
  if (!creatorProfile) {
    const created = await dataRepository.from('creator_profiles').insert({
      niche: '', target_audience: '', language: 'English', tone: 'Friendly',
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
    res.status(400).json({ status: 'error', code: 'INVALID_NAME', message: 'Valid name required.' }); return;
  }
  const creator: Record<string, string> = {};
  for (const field of creatorFields) {
    const value = req.body?.creatorProfile?.[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 2000) {
      res.status(400).json({ status: 'error', code: 'INVALID_PROFILE', message: 'Invalid creator profile field.' }); return;
    }
    creator[field] = value.trim();
  }
  const profileResult = await dataRepository.from('profiles').update({ full_name: fullName.trim() })
    .eq('id', user.id).select().maybeSingle();
  if (profileResult.error || !profileResult.data) throw new Error('Profile database unavailable.');
  const creatorResult = await dataRepository.from('creator_profiles').upsert({ user_id: user.id, ...creator },
    { onConflict: 'user_id' }).select().single();
  if (creatorResult.error) throw new Error('Profile database unavailable.');
  res.status(200).json({ status: 'ok', profile: profileResult.data, creatorProfile: creatorResult.data });
};
