import { Request, Response } from 'express';
import { ABStudioService } from '../services/abStudioService.js';
import { AppError } from '../types/index.js';

function getAuthUser(req: Request): string {
  const user = (req as any).user;
  if (!user || !user.id) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }
  return user.id;
}

export class ABStudioController {
  /**
   * GET /api/ab-studio/capabilities
   */
  public static async getCapabilities(_req: Request, res: Response): Promise<void> {
    const caps = ABStudioService.getCapabilities();
    res.json({ success: true, data: caps });
  }

  /**
   * POST /api/ab-studio/experiments
   */
  public static async createExperiment(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const experiment = await ABStudioService.createExperiment(userId, req.body);
    res.status(201).json({ success: true, data: experiment });
  }

  /**
   * GET /api/ab-studio/experiments
   */
  public static async listUserExperiments(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { status, search, limit, offset } = req.query;
    const result = await ABStudioService.listUserExperiments(userId, {
      status: status ? (status as any) : undefined,
      search: typeof search === 'string' ? search : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  }

  /**
   * GET /api/ab-studio/experiments/:id
   */
  public static async getExperiment(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const experiment = await ABStudioService.getExperiment(userId, id);
    res.json({ success: true, data: experiment });
  }

  /**
   * GET /api/ab-studio/experiments/:id/report
   */
  public static async getExperimentReport(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const report = await ABStudioService.getExperimentReport(userId, id);
    res.json({ success: true, data: report });
  }

  /**
   * GET /api/ab-studio/experiments/:id/export
   */
  public static async exportExperimentCsv(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const result = await ABStudioService.exportExperimentCsv(userId, id);

    if (req.query.format === 'json') {
      res.json({ success: true, data: result });
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.csvContent);
  }

  /**
   * GET /api/ab-studio/clips/:clipId
   */
  public static async getExperimentsForClip(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { clipId } = req.params;
    const experiments = await ABStudioService.listExperimentsForClip(userId, clipId);
    res.json({ success: true, data: experiments });
  }

  /**
   * POST /api/ab-studio/experiments/:id/start
   */
  public static async startExperiment(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const experiment = await ABStudioService.startExperiment(userId, id);
    res.json({ success: true, data: experiment });
  }

  /**
   * POST /api/ab-studio/experiments/:id/pause
   */
  public static async pauseExperiment(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const experiment = await ABStudioService.pauseExperiment(userId, id);
    res.json({ success: true, data: experiment });
  }

  /**
   * POST /api/ab-studio/experiments/:id/observations
   */
  public static async recordObservation(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const experiment = await ABStudioService.recordObservation(userId, id, req.body);
    res.json({ success: true, data: experiment });
  }

  /**
   * POST /api/ab-studio/experiments/:id/declare-winner
   */
  public static async declareWinner(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const experiment = await ABStudioService.declareWinner(userId, id, req.body);
    res.json({ success: true, data: experiment });
  }

  /**
   * POST /api/ab-studio/experiments/:id/promote-winner
   */
  public static async promoteWinner(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const result = await ABStudioService.promoteWinner(userId, id, req.body);
    res.json({ success: true, data: result });
  }

  /**
   * DELETE /api/ab-studio/experiments/:id
   */
  public static async deleteExperiment(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    await ABStudioService.deleteExperiment(userId, id);
    res.json({ success: true, message: 'Experiment deleted successfully.' });
  }

  /**
   * POST /api/ab-studio/experiments/:id/import-csv/preview
   */
  public static async previewCsvImport(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const { csv_content, column_mapping } = req.body;
    const result = await ABStudioService.previewCsvImport(userId, id, csv_content, column_mapping);
    res.json({ success: true, data: result });
  }

  /**
   * POST /api/ab-studio/experiments/:id/import-csv/execute
   */
  public static async executeCsvImport(req: Request, res: Response): Promise<void> {
    const userId = getAuthUser(req);
    const { id } = req.params;
    const { csv_content, column_mapping } = req.body;
    const result = await ABStudioService.executeCsvImport(userId, id, csv_content, column_mapping);
    res.json({ success: true, data: result });
  }
}
