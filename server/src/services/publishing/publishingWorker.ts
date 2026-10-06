import { publishingService } from '../publishingService.js';
import { logger } from '../../utils/logger.js';

let isRunning = false;
let timer: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 15000; // Poll every 15 seconds

export function startPublishingWorker(): void {
  if (isRunning) return;
  isRunning = true;

  logger.info('Publishing background worker started (interval: 15s)');

  const tick = async () => {
    try {
      const processed = await publishingService.processDueJobs();
      if (processed > 0) {
        logger.info(`Publishing worker processed ${processed} due job(s)`);
      }
    } catch (err: any) {
      logger.error('Error in publishing worker cycle', { err: err?.message });
    } finally {
      if (isRunning) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }
  };

  // Schedule first tick after 5 seconds to let server finish bootstrapping
  timer = setTimeout(tick, 5000);
}

export function stopPublishingWorker(): void {
  isRunning = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  logger.info('Publishing background worker stopped');
}
