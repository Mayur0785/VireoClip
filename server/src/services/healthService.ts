import { HealthStatus } from '../types/index.js';
import { config } from '../config/index.js';
import { isServerSupabaseConfigured } from '../utils/supabase.js';
import { isMongoConfigured, isMongoHealthy } from '../db/mongoClient.js';

export interface DetailedHealthStatus extends HealthStatus {
  timestamp: string;
  version: string;
  uptimeSeconds: number;
  environment: string;
  services: {
    supabaseConfigured: boolean;
    mongoConfigured?: boolean;
    mongoConnected?: boolean;
    storageConfigured?: boolean;
    openRouterConfigured: boolean;
  };
}

export const getHealthStatus = (): DetailedHealthStatus => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.nodeEnv,
    services: {
      supabaseConfigured: isServerSupabaseConfigured,
      mongoConfigured: isMongoConfigured,
      storageConfigured: Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey),
      openRouterConfigured: Boolean(config.openrouterApiKey),
    },
  };
};

export async function getDetailedHealthStatus(): Promise<DetailedHealthStatus> {
  const health = getHealthStatus();
  const connected = await isMongoHealthy();
  return { ...health, status: connected ? 'ok' : 'error', services: { ...health.services, mongoConnected: connected } };
}

export interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    mongodb: boolean;
    supabase: boolean;
    storage: boolean;
    aiProvider: boolean;
  };
}

export async function getReadinessStatus(): Promise<ReadinessStatus> {
  const mongoConnected = await isMongoHealthy();
  const supabaseOk = isServerSupabaseConfigured;
  const storageOk = Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey);
  const aiOk = Boolean(config.openrouterApiKey || config.groqApiKey);

  const isReady = mongoConnected && supabaseOk && storageOk && aiOk;

  return {
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      mongodb: mongoConnected,
      supabase: supabaseOk,
      storage: storageOk,
      aiProvider: aiOk,
    },
  };
}
