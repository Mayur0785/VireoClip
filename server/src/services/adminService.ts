import { getMongoDb } from '../db/mongoClient.js';
import { isMongoHealthy } from '../db/mongoClient.js';
import { isServerSupabaseConfigured } from '../utils/supabase.js';
import { config } from '../config/index.js';
import { BillingRegistry } from './billing/billingRegistry.js';
import { SubscriptionService } from './subscriptionService.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

export interface AdminOverviewStats {
  users: {
    total: number;
    createdToday: number;
    createdThisWeek: number;
    createdThisMonth: number;
  };
  projects: {
    total: number;
    today: number;
    processing: number;
    completed: number;
    failed: number;
  };
  usage: {
    sourceMinutesCurrentMonth: number;
    clipRendersCurrentMonth: number;
    totalUsageEvents: number;
  };
  subscriptions: {
    freeUsers: number;
    creatorSubscribers: number;
    proSubscribers: number;
    studioSubscribers: number;
    activeSubscriptions: number;
    canceledSubscriptions: number;
    pastDueSubscriptions: number;
  };
  publishing: {
    queued: number;
    processing: number;
    published: number;
    failed: number;
  };
  renders: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  system: {
    mongoConnected: boolean;
    r2Configured: boolean;
    supabaseConfigured: boolean;
    openRouterConfigured: boolean;
    groqConfigured: boolean;
    ffmpegAvailable: boolean;
    paddleConfigured: boolean;
    razorpayConfigured: boolean;
    stripeConfigured: boolean;
  };
}

export class AdminService {
  /**
   * Aggregates real system-wide metrics across all collections.
   */
  static async getOverview(): Promise<AdminOverviewStats> {
    const db = await getMongoDb();
    const now = new Date();

    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    // 1. Users Counts
    const profilesCol = db.collection('profiles');
    const [totalUsers, usersToday, usersWeek, usersMonth] = await Promise.all([
      profilesCol.countDocuments(),
      profilesCol.countDocuments({ created_at: { $gte: startOfToday } }),
      profilesCol.countDocuments({ created_at: { $gte: startOfWeek } }),
      profilesCol.countDocuments({ created_at: { $gte: startOfMonth } }),
    ]);

    // 2. Projects Counts
    const projectsCol = db.collection('projects');
    const [totalProjects, projectsToday, projectsProcessing, projectsCompleted, projectsFailed] = await Promise.all([
      projectsCol.countDocuments(),
      projectsCol.countDocuments({ created_at: { $gte: startOfToday } }),
      projectsCol.countDocuments({ video_status: { $in: ['processing', 'transcribing'] } }),
      projectsCol.countDocuments({ video_status: 'ready' }),
      projectsCol.countDocuments({ video_status: 'failed' }),
    ]);

    // 3. Usage Aggregates
    const usageCol = db.collection('usage_events');
    const currentMonthUsage = await usageCol.aggregate([
      { $match: { billing_period: currentPeriod, status: 'settled' } },
      { $group: { _id: null, totalMinutes: { $sum: '$measured_duration_minutes' } } },
    ]).toArray();
    const sourceMinutesCurrentMonth = currentMonthUsage[0]?.totalMinutes || 0;
    const totalUsageEvents = await usageCol.countDocuments();

    // 4. Clip Renders current month
    const clipsCol = db.collection('clips');
    const clipRendersCurrentMonth = await clipsCol.countDocuments({
      created_at: { $gte: startOfMonth },
      render_status: 'ready',
    });

    // 5. Subscriptions Distribution
    const subsCol = db.collection('subscriptions');
    const [
      creatorSubs,
      proSubs,
      studioSubs,
      activeSubs,
      canceledSubs,
      pastDueSubs,
    ] = await Promise.all([
      subsCol.countDocuments({ plan_id: 'creator', status: { $in: ['active', 'trialing'] } }),
      subsCol.countDocuments({ plan_id: 'pro', status: { $in: ['active', 'trialing'] } }),
      subsCol.countDocuments({ plan_id: 'studio', status: { $in: ['active', 'trialing'] } }),
      subsCol.countDocuments({ status: { $in: ['active', 'trialing'] } }),
      subsCol.countDocuments({ status: 'canceled' }),
      subsCol.countDocuments({ status: 'past_due' }),
    ]);
    const paidTotal = creatorSubs + proSubs + studioSubs;
    const freeUsers = Math.max(0, totalUsers - paidTotal);

    // 6. Publishing Jobs
    const publishJobsCol = db.collection('publish_jobs');
    const [pubQueued, pubProcessing, pubCompleted, pubFailed] = await Promise.all([
      publishJobsCol.countDocuments({ status: 'scheduled' }),
      publishJobsCol.countDocuments({ status: 'publishing' }),
      publishJobsCol.countDocuments({ status: 'completed' }),
      publishJobsCol.countDocuments({ status: 'failed' }),
    ]);

    // 7. Render Jobs
    const renderJobsCol = db.collection('render_jobs');
    const [renderQueued, renderProcessing, renderCompleted, renderFailed] = await Promise.all([
      renderJobsCol.countDocuments({ status: 'queued' }),
      renderJobsCol.countDocuments({ status: { $in: ['processing', 'uploading'] } }),
      renderJobsCol.countDocuments({ status: 'completed' }),
      renderJobsCol.countDocuments({ status: 'failed' }),
    ]);

    // 8. System Status
    const mongoConnected = await isMongoHealthy();
    let ffmpegAvailable = false;
    const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
    try {
      await execFileAsync(ffmpegBin, ['-version'], { timeout: 5000 });
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
    }

    const paddleProvider = BillingRegistry.getProvider('paddle');
    const razorpayProvider = BillingRegistry.getProvider('razorpay');
    const stripeProvider = BillingRegistry.getProvider('stripe');

    return {
      users: {
        total: totalUsers,
        createdToday: usersToday,
        createdThisWeek: usersWeek,
        createdThisMonth: usersMonth,
      },
      projects: {
        total: totalProjects,
        today: projectsToday,
        processing: projectsProcessing,
        completed: projectsCompleted,
        failed: projectsFailed,
      },
      usage: {
        sourceMinutesCurrentMonth: Number(sourceMinutesCurrentMonth.toFixed(2)),
        clipRendersCurrentMonth,
        totalUsageEvents,
      },
      subscriptions: {
        freeUsers,
        creatorSubscribers: creatorSubs,
        proSubscribers: proSubs,
        studioSubscribers: studioSubs,
        activeSubscriptions: activeSubs,
        canceledSubscriptions: canceledSubs,
        pastDueSubscriptions: pastDueSubs,
      },
      publishing: {
        queued: pubQueued,
        processing: pubProcessing,
        published: pubCompleted,
        failed: pubFailed,
      },
      renders: {
        queued: renderQueued,
        processing: renderProcessing,
        completed: renderCompleted,
        failed: renderFailed,
      },
      system: {
        mongoConnected,
        r2Configured: Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey),
        supabaseConfigured: isServerSupabaseConfigured,
        openRouterConfigured: Boolean(config.openrouterApiKey),
        groqConfigured: Boolean(config.groqApiKey),
        ffmpegAvailable,
        paddleConfigured: paddleProvider.isConfigured(),
        razorpayConfigured: razorpayProvider.isConfigured(),
        stripeConfigured: stripeProvider.isConfigured(),
      },
    };
  }

  /**
   * Retrieves paginated, searchable user operational summaries.
   */
  static async getUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
    plan?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ users: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const allowedSortFields = ['created_at', 'email', 'full_name'];
    const sortField = allowedSortFields.includes(options.sortBy || '') ? options.sortBy! : 'created_at';
    const sortDirection = options.sortOrder === 'asc' ? 1 : -1;

    const query: Record<string, any> = {};
    if (options.search) {
      const sanitized = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { email: { $regex: sanitized, $options: 'i' } },
        { full_name: { $regex: sanitized, $options: 'i' } },
        { user_id: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const db = await getMongoDb();
    const profilesCol = db.collection('profiles');
    const total = await profilesCol.countDocuments(query);
    const profiles = await profilesCol
      .find(query)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limit)
      .toArray();

    const now = new Date();
    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    // Enrich profiles with project count, usage, and subscription
    const userIds = profiles.map((p) => p.user_id || p.id);

    const [projectCounts, clipCounts, socialCounts, subs] = await Promise.all([
      db.collection('projects').aggregate([
        { $match: { user_id: { $in: userIds } } },
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
      ]).toArray(),
      db.collection('clips').aggregate([
        { $match: { user_id: { $in: userIds } } },
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
      ]).toArray(),
      db.collection('social_account_connections').aggregate([
        { $match: { user_id: { $in: userIds } } },
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
      ]).toArray(),
      db.collection('subscriptions').find({ user_id: { $in: userIds } }).toArray(),
    ]);

    const projectMap = new Map(projectCounts.map((r) => [r._id, r.count]));
    const clipMap = new Map(clipCounts.map((r) => [r._id, r.count]));
    const socialMap = new Map(socialCounts.map((r) => [r._id, r.count]));
    const subMap = new Map(subs.map((s) => [s.user_id, s]));

    const enrichedUsers = profiles.map((p) => {
      const uid = p.user_id || p.id;
      const sub = subMap.get(uid);
      return {
        id: uid,
        email: p.email,
        full_name: p.full_name || '',
        created_at: p.created_at,
        plan_id: sub?.plan_id || 'free',
        subscription_status: sub?.status || 'none',
        provider: sub?.provider || null,
        project_count: projectMap.get(uid) || 0,
        clip_count: clipMap.get(uid) || 0,
        social_connection_count: socialMap.get(uid) || 0,
      };
    });

    let filteredUsers = enrichedUsers;
    if (options.plan) {
      filteredUsers = filteredUsers.filter((u) => u.plan_id === options.plan);
    }

    return {
      users: filteredUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Detailed safe operational profile for a single user.
   */
  static async getUserDetail(userId: string): Promise<any> {
    const db = await getMongoDb();
    const profile = await db.collection('profiles').findOne({ $or: [{ user_id: userId }, { id: userId }] });
    if (!profile) return null;

    const [entitlement, recentProjects, clipsCount, socialAccounts, invoices] = await Promise.all([
      SubscriptionService.resolveUserEntitlement(userId, profile.email),
      db.collection('projects').find({ user_id: userId }).sort({ created_at: -1 }).limit(10).toArray(),
      db.collection('clips').countDocuments({ user_id: userId }),
      db.collection('social_account_connections').find({ user_id: userId }).project({
        id: 1,
        provider: 1,
        provider_account_name: 1,
        status: 1,
        created_at: 1,
      }).toArray(),
      db.collection('billing_invoices').find({ user_id: userId }).sort({ created_at: -1 }).limit(10).toArray(),
    ]);

    return {
      user: {
        id: userId,
        email: profile.email,
        full_name: profile.full_name || '',
        created_at: profile.created_at,
      },
      entitlement,
      recentProjects: recentProjects.map((p) => ({
        id: p.id,
        title: p.title,
        source_type: p.source_type,
        video_status: p.video_status,
        duration_seconds: p.duration_seconds,
        created_at: p.created_at,
      })),
      totalClips: clipsCount,
      socialConnections: socialAccounts,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        provider: inv.provider,
        provider_invoice_id: inv.provider_invoice_id,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        created_at: inv.created_at,
      })),
    };
  }

  /**
   * Paginated projects query with filters.
   */
  static async getProjects(options: {
    page?: number;
    limit?: number;
    status?: string;
    sourceType?: string;
    userId?: string;
    search?: string;
  }): Promise<{ projects: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};
    if (options.status) query.video_status = options.status;
    if (options.sourceType) query.source_type = options.sourceType;
    if (options.userId) query.user_id = options.userId;
    if (options.search) {
      const sanitized = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: sanitized, $options: 'i' };
    }

    const db = await getMongoDb();
    const projectsCol = db.collection('projects');
    const total = await projectsCol.countDocuments(query);
    const rawProjects = await projectsCol
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const safeProjects = rawProjects.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      title: p.title,
      source_type: p.source_type,
      duration_seconds: p.duration_seconds,
      video_status: p.video_status,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return {
      projects: safeProjects,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Paginated render jobs monitoring.
   */
  static async getRenderJobs(options: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ renderJobs: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};
    if (options.status) query.status = options.status;

    const db = await getMongoDb();
    const jobsCol = db.collection('render_jobs');
    const total = await jobsCol.countDocuments(query);
    const jobs = await jobsCol
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const safeJobs = jobs.map((j) => ({
      id: j.id,
      clip_id: j.clip_id,
      user_id: j.user_id,
      status: j.status,
      progress: j.progress,
      attempts: j.attempts,
      error_message: j.error_message || null,
      created_at: j.created_at,
      updated_at: j.updated_at,
    }));

    return {
      renderJobs: safeJobs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Subscriptions and billing monitoring.
   */
  static async getSubscriptions(options: {
    page?: number;
    limit?: number;
    provider?: string;
    status?: string;
  }): Promise<{ subscriptions: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};
    if (options.provider) query.provider = options.provider;
    if (options.status) query.status = options.status;

    const db = await getMongoDb();
    const subsCol = db.collection('subscriptions');
    const total = await subsCol.countDocuments(query);
    const subs = await subsCol
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const safeSubs = subs.map((s) => ({
      id: s.id,
      user_id: s.user_id,
      plan_id: s.plan_id,
      provider: s.provider,
      provider_subscription_id: s.provider_subscription_id,
      status: s.status,
      billing_interval: s.billing_interval,
      current_period_start: s.current_period_start,
      current_period_end: s.current_period_end,
      cancel_at_period_end: s.cancel_at_period_end,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));

    return {
      subscriptions: safeSubs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Publishing monitoring.
   */
  static async getPublishing(options: {
    page?: number;
    limit?: number;
    provider?: string;
    status?: string;
  }): Promise<{ jobs: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};
    if (options.status) query.status = options.status;

    const db = await getMongoDb();
    const jobsCol = db.collection('publish_jobs');
    const total = await jobsCol.countDocuments(query);
    const rawJobs = await jobsCol
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Map associated posts
    const postIds = rawJobs.map((j) => j.published_post_id);
    const posts = await db.collection('published_posts').find({ id: { $in: postIds } }).toArray();
    const postMap = new Map(posts.map((p) => [p.id, p]));

    const safeJobs = rawJobs.map((j) => {
      const post = postMap.get(j.published_post_id);
      return {
        id: j.id,
        user_id: j.user_id,
        status: j.status,
        provider: post?.provider || 'unknown',
        clip_id: post?.clip_id || null,
        scheduled_for: j.scheduled_for,
        attempts: j.attempts,
        last_error: j.last_error || null,
        created_at: j.created_at,
        updated_at: j.updated_at,
      };
    });

    let filtered = safeJobs;
    if (options.provider) {
      filtered = filtered.filter((j) => j.provider === options.provider);
    }

    return {
      jobs: filtered,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Social Accounts Monitoring (SAFE PROJECTION ONLY, NO TOKENS).
   */
  static async getSocialAccounts(options: {
    page?: number;
    limit?: number;
    provider?: string;
  }): Promise<{ accounts: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};
    if (options.provider) query.provider = options.provider;

    const db = await getMongoDb();
    const col = db.collection('social_account_connections');
    const total = await col.countDocuments(query);
    const accounts = await col
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const safeAccounts = accounts.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      provider: a.provider,
      account_name: a.provider_account_name || 'Connected Account',
      provider_account_id: a.provider_account_id,
      status: a.status,
      connected_at: a.created_at,
      last_verified_at: a.last_verified_at || null,
    }));

    return {
      accounts: safeAccounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Usage aggregates over a period.
   */
  static async getUsageAnalytics(): Promise<any> {
    const db = await getMongoDb();
    const now = new Date();
    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const usageCol = db.collection('usage_events');
    const topUsers = await usageCol.aggregate([
      { $match: { billing_period: currentPeriod, status: 'settled' } },
      { $group: { _id: '$user_id', totalMinutes: { $sum: '$measured_duration_minutes' }, count: { $sum: 1 } } },
      { $sort: { totalMinutes: -1 } },
      { $limit: 10 },
    ]).toArray();

    const totalUsage = await usageCol.aggregate([
      { $match: { billing_period: currentPeriod, status: 'settled' } },
      { $group: { _id: '$billing_period', totalMinutes: { $sum: '$measured_duration_minutes' } } },
    ]).toArray();

    return {
      currentPeriod,
      totalMinutesUsed: totalUsage[0]?.totalMinutes || 0,
      topUsers: topUsers.map((u) => ({
        userId: u._id,
        totalMinutes: Number(u.totalMinutes.toFixed(2)),
        attemptsCount: u.count,
      })),
    };
  }

  /**
   * Real System Health & Diagnostic verification.
   */
  static async getHealthDiagnostics(): Promise<any> {
    const startTime = Date.now();
    const mongoConnected = await isMongoHealthy();
    const mongoLatencyMs = Date.now() - startTime;

    let ffmpegAvailable = false;
    let ffmpegVersion = '';
    const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
    try {
      const { stdout } = await execFileAsync(ffmpegBin, ['-version'], { timeout: 5000 });
      ffmpegAvailable = true;
      ffmpegVersion = stdout.split('\n')[0] || '';
    } catch {
      ffmpegAvailable = false;
    }

    const paddle = BillingRegistry.getProvider('paddle');
    const razorpay = BillingRegistry.getProvider('razorpay');
    const stripe = BillingRegistry.getProvider('stripe');

    return {
      status: mongoConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        mongo: {
          connected: mongoConnected,
          latencyMs: mongoLatencyMs,
          configured: Boolean(config.mongodbUri),
        },
        r2: {
          configured: Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey),
          sourceBucket: config.r2SourceBucket,
          clipsBucket: config.r2ClipsBucket,
        },
        supabase: {
          configured: isServerSupabaseConfigured,
        },
        ai: {
          openRouterConfigured: Boolean(config.openrouterApiKey),
          groqConfigured: Boolean(config.groqApiKey),
          transcriptionProvider: config.transcriptionProvider,
        },
        ffmpeg: {
          available: ffmpegAvailable,
          version: ffmpegVersion.slice(0, 50),
        },
        billing: {
          paddle: {
            configured: paddle.isConfigured(),
            environment: config.paddleEnv,
          },
          razorpay: {
            configured: razorpay.isConfigured(),
            mode: config.razorpayKeyId.startsWith('rzp_test_') ? 'test' : 'live',
          },
          stripe: {
            configured: stripe.isConfigured(),
          },
        },
      },
    };
  }
}
