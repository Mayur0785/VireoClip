import { Request, Response } from 'express';
import { getDetailedHealthStatus, getReadinessStatus } from '../services/healthService.js';

export const checkHealth = async (_req: Request, res: Response): Promise<void> => {
  const health = await getDetailedHealthStatus();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
};

export const checkReadiness = async (_req: Request, res: Response): Promise<void> => {
  const readiness = await getReadinessStatus();
  res.status(readiness.status === 'ready' ? 200 : 503).json(readiness);
};
