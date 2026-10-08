import { Db } from 'mongodb';
import { getMongoDb } from './mongoClient.js';

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

const collections = [
  'profiles', 'projects', 'transcripts', 'creator_profiles', 'content_outputs',
  'usage_events', 'subscription_limits', 'clip_candidates', 'clips',
  'render_jobs', 'reframe_tracks', 'social_account_connections', 'oauth_states',
  'published_posts', 'publish_jobs',
  'billing_customers', 'subscriptions', 'billing_events', 'billing_invoices',
  'content_analytics', 'content_memories',
  'video_analyses', 'video_analysis_jobs',
  'producer_plans',
  'editor_projects',
  'hook_lab_sessions',
  'hook_candidates',
] as const;


/** Idempotent index/bootstrap setup. Run with an app DB user allowed to create indexes. */
export async function bootstrapMongo(db?: Db): Promise<void> {
  const database = db ?? await getMongoDb();
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  for (const name of collections) {
    if (!existing.has(name)) {
      const requiredFields = name === 'subscription_limits'
        ? ['user_id', 'billing_period']
        : name === 'billing_events'
        ? ['id', 'provider', 'provider_event_id']
        : ['id', 'user_id'];

      await database.createCollection(name, {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: requiredFields,
            properties: {
              id: { bsonType: 'string', pattern: UUID_PATTERN },
              user_id: { bsonType: 'string', pattern: UUID_PATTERN },
              project_id: { bsonType: 'string', pattern: UUID_PATTERN },
              clip_id: { bsonType: 'string', pattern: UUID_PATTERN },
              created_at: { bsonType: 'date' },
              updated_at: { bsonType: 'date' },
            },
          },
        },
        validationLevel: 'strict',
      });
    }
  }

  await Promise.all([
    database.collection('profiles').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('projects').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('transcripts').createIndex({ id: 1 }, { unique: true }),
    database.collection('transcripts').createIndex({ project_id: 1 }, { unique: true }),
    database.collection('transcripts').createIndex({ user_id: 1, project_id: 1 }),
    database.collection('creator_profiles').createIndex({ user_id: 1 }, { unique: true }),
    database.collection('content_outputs').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_outputs').createIndex({ project_id: 1, user_id: 1, created_at: -1 }),
    database.collection('usage_events').createIndex({ id: 1 }, { unique: true }),
    database.collection('usage_events').createIndex({ processing_attempt_id: 1 }, { unique: true }),
    database.collection('usage_events').createIndex({ user_id: 1, billing_period: 1 }),
    database.collection('subscription_limits').createIndex({ user_id: 1, billing_period: 1 }, { unique: true }),
    database.collection('clip_candidates').createIndex({ id: 1 }, { unique: true }),
    database.collection('clip_candidates').createIndex({ project_id: 1, engagement_score: -1 }),
    database.collection('clip_candidates').createIndex({ project_id: 1, start_segment_index: 1, end_segment_index: 1 }, { unique: true }),
    database.collection('clips').createIndex({ id: 1 }, { unique: true }),
    database.collection('clips').createIndex({ project_id: 1, user_id: 1, render_status: 1 }),
    database.collection('render_jobs').createIndex({ id: 1 }, { unique: true }),
    database.collection('render_jobs').createIndex({ clip_id: 1, user_id: 1, status: 1, created_at: -1 }),
    database.collection('reframe_tracks').createIndex({ id: 1 }, { unique: true }),
    database.collection('reframe_tracks').createIndex({ clip_id: 1, user_id: 1, status: 1 }),
    database.collection('reframe_tracks').createIndex({ clip_id: 1, analysis_version: 1 }, { unique: true }),
    // Phase 9: Social connections & OAuth state indexes
    database.collection('social_account_connections').createIndex({ id: 1 }, { unique: true }),
    database.collection('social_account_connections').createIndex({ user_id: 1, provider: 1 }),
    database.collection('social_account_connections').createIndex({ provider: 1, provider_account_id: 1 }, { unique: true }),
    database.collection('oauth_states').createIndex({ id: 1 }, { unique: true }),
    database.collection('oauth_states').createIndex({ state_hash: 1 }, { unique: true }),
    database.collection('oauth_states').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    // Phase 10: Publishing & Scheduling indexes
    database.collection('published_posts').createIndex({ id: 1 }, { unique: true }),
    database.collection('published_posts').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('published_posts').createIndex({ user_id: 1, status: 1 }),
    database.collection('published_posts').createIndex({ request_fingerprint: 1 }, { unique: true }),
    database.collection('published_posts').createIndex({ scheduled_for: 1 }),
    database.collection('publish_jobs').createIndex({ id: 1 }, { unique: true }),
    database.collection('publish_jobs').createIndex({ published_post_id: 1 }, { unique: true }),
    database.collection('publish_jobs').createIndex({ status: 1, scheduled_for: 1 }),
    database.collection('publish_jobs').createIndex({ user_id: 1, scheduled_for: 1 }),
    // Phase 11: Billing, Customers, Subscriptions & Invoices indexes
    database.collection('billing_customers').createIndex({ id: 1 }, { unique: true }),
    database.collection('billing_customers').createIndex({ user_id: 1, provider: 1 }, { unique: true }),
    database.collection('billing_customers').createIndex({ provider: 1, provider_customer_id: 1 }, { unique: true }),
    database.collection('subscriptions').createIndex({ id: 1 }, { unique: true }),
    database.collection('subscriptions').createIndex({ user_id: 1 }),
    database.collection('subscriptions').createIndex({ user_id: 1, provider: 1 }),
    database.collection('subscriptions').createIndex({ provider: 1, provider_subscription_id: 1 }, { unique: true }),
    database.collection('subscriptions').createIndex({ provider: 1, provider_customer_id: 1 }),
    database.collection('subscriptions').createIndex({ last_provider_event_id: 1 }),
    database.collection('subscriptions').createIndex({ status: 1, current_period_end: 1 }),
    database.collection('billing_events').createIndex({ id: 1 }, { unique: true }),
    database.collection('billing_events').createIndex({ provider: 1, provider_event_id: 1 }, { unique: true }),
    database.collection('billing_events').createIndex({ processed_at: 1 }),
    database.collection('billing_invoices').createIndex({ id: 1 }, { unique: true }),
    database.collection('billing_invoices').createIndex({ provider: 1, provider_invoice_id: 1 }, { unique: true }),
    database.collection('billing_invoices').createIndex({ user_id: 1, created_at: -1 }),
    // Phase 12 & 13: Admin Console & Distributed Render Job processing indexes
    database.collection('profiles').createIndex({ created_at: -1 }),
    database.collection('profiles').createIndex({ email: 1 }),
    database.collection('projects').createIndex({ status: 1, created_at: -1 }),
    database.collection('subscriptions').createIndex({ plan_id: 1, status: 1 }),
    database.collection('render_jobs').createIndex({ status: 1, created_at: -1 }),
    database.collection('render_jobs').createIndex({ status: 1, locked_at: 1 }),
    database.collection('render_jobs').createIndex({ status: 1, next_retry_at: 1 }),
    database.collection('usage_events').createIndex({ created_at: -1 }),
    // Phase 15: Analytics & Content Memory indexes
    database.collection('content_analytics').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_analytics').createIndex({ user_id: 1, captured_at: -1 }),
    database.collection('content_analytics').createIndex({ published_post_id: 1, captured_at: -1 }),
    database.collection('content_analytics').createIndex({ clip_id: 1, captured_at: -1 }),
    database.collection('content_analytics').createIndex({ project_id: 1 }),
    database.collection('content_analytics').createIndex({ provider: 1, provider_post_id: 1 }),
    database.collection('content_memories').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_memories').createIndex({ user_id: 1, category: 1 }),
    database.collection('content_memories').createIndex({ user_id: 1, confidence: 1 }),
    // Phase 16: Video Multimodal Intelligence indexes
    database.collection('video_analyses').createIndex({ id: 1 }, { unique: true }),
    database.collection('video_analyses').createIndex({ project_id: 1 }, { unique: true }),
    database.collection('video_analyses').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('video_analysis_jobs').createIndex({ id: 1 }, { unique: true }),
    database.collection('video_analysis_jobs').createIndex({ project_id: 1 }),
    database.collection('video_analysis_jobs').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('video_analysis_jobs').createIndex({ status: 1, created_at: 1 }),
    database.collection('video_analysis_jobs').createIndex({ status: 1, locked_at: 1 }),
    // Phase 17: Vireo Producer Plan indexes
    database.collection('producer_plans').createIndex({ id: 1 }, { unique: true }),
    database.collection('producer_plans').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('producer_plans').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('producer_plans').createIndex({ clip_id: 1, status: 1 }),
    // Phase 18: Vireo Pro Video Editor indexes
    database.collection('editor_projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('editor_projects').createIndex({ clip_id: 1, user_id: 1 }),
    database.collection('editor_projects').createIndex({ project_id: 1 }),
    database.collection('editor_projects').createIndex({ user_id: 1, updated_at: -1 }),
    // Phase 19: Vireo AI B-Roll & Media Intelligence indexes
    database.collection('media_assets').createIndex({ id: 1 }, { unique: true }),
    database.collection('media_assets').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('media_assets').createIndex({ project_id: 1 }),
    database.collection('media_assets').createIndex({ provider: 1, provider_asset_id: 1 }),
    database.collection('media_assets').createIndex({ source_type: 1 }),
    database.collection('broll_plans').createIndex({ id: 1 }, { unique: true }),
    database.collection('broll_plans').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('broll_plans').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('broll_plans').createIndex({ status: 1 }),
    // Phase 20: Vireo Audio + Voice Studio indexes
    database.collection('audio_assets').createIndex({ id: 1 }, { unique: true }),
    database.collection('audio_assets').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('audio_assets').createIndex({ project_id: 1 }),
    database.collection('audio_assets').createIndex({ clip_id: 1 }),
    database.collection('audio_assets').createIndex({ source_type: 1 }),
    database.collection('voiceovers').createIndex({ id: 1 }, { unique: true }),
    database.collection('voiceovers').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('voiceovers').createIndex({ project_id: 1 }),
    database.collection('voiceovers').createIndex({ status: 1 }),
    database.collection('voice_profiles').createIndex({ id: 1 }, { unique: true }),
    database.collection('voice_profiles').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('voice_profiles').createIndex({ provider: 1, provider_voice_id: 1 }),
    // Phase 21: Vireo Translate + Multilingual Dubbing indexes
    database.collection('translation_projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('translation_projects').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('translation_projects').createIndex({ project_id: 1, target_language: 1 }),
    database.collection('translation_projects').createIndex({ clip_id: 1, target_language: 1 }),
    database.collection('translation_projects').createIndex({ status: 1 }),
    database.collection('dub_projects').createIndex({ id: 1 }, { unique: true }),
    database.collection('dub_projects').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('dub_projects').createIndex({ translation_project_id: 1 }),
    database.collection('dub_projects').createIndex({ clip_id: 1 }),
    database.collection('translation_memory').createIndex({ id: 1 }, { unique: true }),
    database.collection('translation_memory').createIndex({ user_id: 1, source_hash: 1, source_language: 1, target_language: 1 }),
    database.collection('glossaries').createIndex({ id: 1 }, { unique: true }),
    database.collection('glossaries').createIndex({ user_id: 1, project_id: 1 }),
    // Phase 22: Vireo Brand Brain indexes
    database.collection('brand_brain_profiles').createIndex({ id: 1 }, { unique: true }),
    database.collection('brand_brain_profiles').createIndex({ user_id: 1, version: -1 }),
    database.collection('brand_brain_profiles').createIndex({ user_id: 1, status: 1 }),
    database.collection('brand_evidence').createIndex({ id: 1 }, { unique: true }),
    database.collection('brand_evidence').createIndex({ user_id: 1, brand_brain_id: 1, dimension: 1 }),
    database.collection('brand_evidence').createIndex({ idempotency_key: 1 }, { unique: true }),
    database.collection('brand_evidence').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('brand_brain_versions').createIndex({ id: 1 }, { unique: true }),
    database.collection('brand_brain_versions').createIndex({ user_id: 1, brand_brain_id: 1, version: -1 }),
    // Phase 23: Vireo Content Pack indexes
    database.collection('content_packs').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_packs').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('content_packs').createIndex({ project_id: 1, clip_id: 1 }),
    database.collection('content_packs').createIndex({ clip_id: 1, status: 1 }),
    database.collection('content_pack_items').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_pack_items').createIndex({ content_pack_id: 1, type: 1 }),
    database.collection('content_pack_items').createIndex({ content_pack_id: 1, platform: 1 }),
    database.collection('content_pack_items').createIndex({ user_id: 1 }),
    database.collection('content_pack_versions').createIndex({ id: 1 }, { unique: true }),
    database.collection('content_pack_versions').createIndex({ user_id: 1, content_pack_id: 1, version: -1 }),
    // Phase 24: Vireo Hook Lab indexes
    database.collection('hook_lab_sessions').createIndex({ id: 1 }, { unique: true }),
    database.collection('hook_lab_sessions').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('hook_lab_sessions').createIndex({ clip_id: 1, created_at: -1 }),
    database.collection('hook_lab_sessions').createIndex({ project_id: 1 }),
    database.collection('hook_lab_sessions').createIndex({ status: 1 }),
    database.collection('hook_candidates').createIndex({ id: 1 }, { unique: true }),
    database.collection('hook_candidates').createIndex({ hook_lab_session_id: 1, variant_index: 1 }),
    database.collection('hook_candidates').createIndex({ user_id: 1 }),
    database.collection('hook_candidates').createIndex({ hook_type: 1 }),
    database.collection('hook_candidates').createIndex({ locked: 1 }),
    database.collection('hook_candidates').createIndex({ status: 1 }),
  ]);
}


