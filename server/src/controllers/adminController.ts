import { Response } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { AdminService } from '../services/adminService.js';
import { AppError } from '../types/index.js';

export async function getAdminOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
  const overview = await AdminService.getOverview();
  res.status(200).json({ status: 'ok', data: overview });
}

export async function getAdminUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 25;
  const search = (req.query.search as string) || '';
  const plan = (req.query.plan as string) || '';
  const sortBy = (req.query.sortBy as string) || 'created_at';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

  const result = await AdminService.getUsers({ page, limit, search, plan, sortBy, sortOrder });
  res.status(200).json({ status: 'ok', data: result });
}

export async function getAdminUserDetail(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  if (!userId) {
    throw new AppError('userId parameter is required.', 400, 'PARAM_REQUIRED');
  }

  const detail = await AdminService.getUserDetail(userId);
  if (!detail) {
    throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  }

  res.status(200).json({ status: 'ok', data: detail });
}

export async function getAdminProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 25;
  const status = (req.query.status as string) || '';
  const sourceType = (req.query.sourceType as string) || '';
  const userId = (req.query.userId as string) || '';
  const search = (req.query.search as string) || '';

  const result = await AdminService.getProjects({ page, limit, status, sourceType, userId, search });
  res.status(200).json({ status: 'ok', data: result });
}

export async function getAdminRenderJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 25;
  const status = (req.query.status as string) || '';

  const result = await AdminService.getRenderJobs({ page, limit, status });
  res.status(200).json({ status: 'ok', data: result });
}

export async function getAdminSubscriptions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 25;
  const provider = (req.query.provider as string) || '';
  const status = (req.query.status as string) || '';

  const result = await AdminService.getSubscriptions({ page, limit, provider, status });
  res.status(200).json({ status: 'ok', data: result });
}

export async function getAdminPublishing(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 25;
  const provider = (req.query.provider as string) || '';
  const status = (req.query.status as string) || '';

  const result = await AdminService.getPublishing({ page, limit, provider, status });
  res.status(200).json({ status: 'ok', data: result });
}

export async function getAdminSocialAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 25;
  const provider = (req.query.provider as string) || '';

  const result = await AdminService.getSocialAccounts({ page, limit, provider });
  res.status(200).json({ status: 'ok', data: result });
}

export async function getAdminUsage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const analytics = await AdminService.getUsageAnalytics();
  res.status(200).json({ status: 'ok', data: analytics });
}

export async function getAdminHealth(req: AuthenticatedRequest, res: Response): Promise<void> {
  const diagnostics = await AdminService.getHealthDiagnostics();
  res.status(200).json({ status: 'ok', data: diagnostics });
}
