import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Document, Filter } from 'mongodb';
import { getMongoDb } from '../mongoClient.js';
import { AppError } from '../../types/index.js';
import { validateRecord } from '../schemaValidation.js';
import { logger } from '../../utils/logger.js';

/** Request identity is populated only after Supabase Auth verifies the bearer token. */
export const ownerContext = new AsyncLocalStorage<string>();

const names = new Set([
  'profiles', 'projects', 'transcripts', 'creator_profiles', 'content_outputs',
  'clip_candidates', 'clips', 'render_jobs', 'reframe_tracks',
  'social_account_connections', 'oauth_states',
  'published_posts', 'publish_jobs',
  'billing_customers', 'subscriptions', 'billing_events', 'billing_invoices',
  'content_analytics', 'content_memories',
  'video_analyses', 'video_analysis_jobs',
  'producer_plans',
  'editor_projects',
  'media_assets',
  'broll_plans',
  'audio_assets',
  'voiceovers',
  'voice_profiles',
  'translation_projects',
  'dub_projects',
  'translation_memory',
  'glossaries',
  'brand_brain_profiles',
  'brand_evidence',
  'brand_brain_versions',
  'content_packs',
  'content_pack_items',
  'content_pack_versions',
  'hook_lab_sessions',
  'hook_candidates',
  'thumbnail_lab_sessions',
  'thumbnail_concepts',
  'thumbnail_versions',
  'autopilot_runs',
]);
type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null };
type Action = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

function normalizeRecord(input: Record<string, any>, owner: string, forInsert: boolean): Record<string, any> {
  const now = new Date();
  const output: Record<string, any> = { ...input, user_id: owner };
  if (forInsert) {
    output.id ??= crypto.randomUUID();
    output.created_at ??= now;
  }
  output.updated_at ??= now;
  for (const key of ['created_at', 'updated_at', 'started_at', 'completed_at', 'locked_at', 'next_retry_at', 'failed_at', 'cancelled_at', 'captured_at', 'synced_at', 'first_seen', 'last_updated']) {
    if (output[key] && !(output[key] instanceof Date)) {
      const date = new Date(output[key]);
      if (Number.isNaN(date.getTime())) throw new AppError('Invalid timestamp.', 400, 'INVALID_TIMESTAMP');
      output[key] = date;
    }
  }
  return output;
}

/** A small owner-bound query façade while feature services move to named repositories. */
class TableQuery implements PromiseLike<Result> {
  private action: Action = 'select';
  private filter: Filter<Document>;
  private payload: any;
  private sort: Record<string, 1 | -1> = {};
  private offset = 0;
  private maxRows?: number;
  private projection?: Record<string, 0 | 1>;
  private wantCount = false;
  private returnRows = false;
  private one = false;
  private optional = false;
  private conflictKey = 'id';

  constructor(private readonly name: string, private readonly owner: string) {
    this.filter = { user_id: owner };
  }

  select(columns = '*', options?: { count?: string }): this {
    if (this.action === 'select') this.wantCount = options?.count === 'exact';
    else this.returnRows = true;
    if (columns !== '*') {
      this.projection = { _id: 0, ...Object.fromEntries(columns.split(',').map((s) => [s.trim(), 1])) };
      this.projection.id = 1;
      this.projection.user_id = 1;
    }
    return this;
  }
  insert(value: any): this { this.action = 'insert'; this.payload = value; return this; }
  update(value: any): this { this.action = 'update'; this.payload = value; return this; }
  upsert(value: any, options?: { onConflict?: string }): this {
    this.action = 'upsert'; this.payload = value; this.conflictKey = options?.onConflict || 'id'; return this;
  }
  delete(): this { this.action = 'delete'; return this; }
  eq(field: string, value: any): this {
    if (field === 'user_id' && value !== this.owner) throw new AppError('Resource not found.', 404, 'NOT_FOUND');
    this.filter[field] = value; return this;
  }
  in(field: string, values: any[]): this {
    if (field === 'user_id') throw new AppError('Owner filter cannot be changed.', 403, 'ACCESS_DENIED');
    this.filter[field] = { $in: values }; return this;
  }
  match(values: Record<string, any>): this { for (const [key, value] of Object.entries(values)) this.eq(key, value); return this; }
  order(field: string, options?: { ascending?: boolean }): this {
    this.sort = { ...this.sort, [field]: options?.ascending === false ? -1 : 1 }; return this;
  }
  range(start: number, end: number): this { this.offset = start; this.maxRows = end - start + 1; return this; }
  limit(value: number): this { this.maxRows = value; return this; }
  single(): Promise<Result> { this.one = true; return this.execute(); }
  maybeSingle(): Promise<Result> { this.one = true; this.optional = true; return this.execute(); }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> { return this.execute().then(onfulfilled, onrejected); }

  private async execute(): Promise<Result> {
    try {
      const db = await getMongoDb();
      const collection = db.collection(this.name);
      if (this.action === 'select') {
        const count = this.wantCount ? await collection.countDocuments(this.filter) : null;
        const cursor = collection.find(this.filter, { projection: this.projection || { _id: 0 } })
          .sort(this.sort).skip(this.offset);
        const rows = await (this.maxRows ? cursor.limit(this.maxRows) : cursor).toArray();
        const data = this.one ? (rows[0] ?? null) : rows;
        if (this.one && !data && !this.optional) return { data: null, error: { message: 'Row not found.', code: 'PGRST116' }, count };
        return { data, error: null, count };
      }
      if (this.action === 'insert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload])
          .map((row) => normalizeRecord(row, this.owner, true));
        for (const row of rows) validateRecord(this.name, row);
        await collection.insertMany(rows);
        return { data: this.returnRows ? (this.one ? rows[0] : rows) : null, error: null };
      }
      if (this.action === 'upsert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload])
          .map((row) => normalizeRecord(row, this.owner, true));
        for (const row of rows) validateRecord(this.name, row);
        const saved = [];
        for (const row of rows) {
          const conflictFields = this.conflictKey.split(',').map((key) => key.trim());
          const keyFilter = Object.fromEntries(conflictFields.map((key) => [key, row[key]]));
          if (Object.values(keyFilter).some((value) => value === undefined || value === null)) {
            throw new AppError('Upsert key is required.', 400, 'INVALID_UPSERT');
          }
          const { created_at, id, user_id, ...updates } = row;
          await collection.updateOne({ user_id: this.owner, ...keyFilter },
            { $set: updates, $setOnInsert: { id, user_id, created_at } }, { upsert: true });
          saved.push(await collection.findOne({ user_id: this.owner, ...keyFilter }, { projection: { _id: 0 } }));
        }
        return { data: this.returnRows ? (this.one ? saved[0] : saved) : null, error: null };
      }
      if (this.action === 'update') {
        const patch = normalizeRecord(this.payload, this.owner, false);
        validateRecord(this.name, patch);
        await collection.updateMany(this.filter, { $set: patch });
        const rows = this.returnRows ? await collection.find(this.filter, { projection: { _id: 0 } }).sort(this.sort).toArray() : null;
        return { data: this.returnRows ? (this.one ? rows?.[0] ?? null : rows) : null, error: null };
      }
      await collection.deleteMany(this.filter);
      return { data: null, error: null };
    } catch (error) {
      if (error instanceof AppError) return { data: null, error: { message: error.message, code: error.code } };
      logger.error('Application data operation failed', { collection: this.name,
        error: error instanceof Error ? error.message : String(error) });
      return { data: null, error: { message: 'Database operation failed.', code: 'DATABASE_UNAVAILABLE' } };
    }
  }
}

export const dataRepository = {
  from(name: string): TableQuery {
    const owner = ownerContext.getStore();
    if (!owner) throw new AppError('Authenticated owner context is required.', 401, 'AUTH_REQUIRED');
    if (!names.has(name)) throw new AppError('Unknown data collection.', 500, 'DATABASE_ERROR');
    return new TableQuery(name, owner);
  },
};
