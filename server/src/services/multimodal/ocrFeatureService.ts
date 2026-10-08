import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../../utils/logger.js';
import { VideoKeyframe } from '../../types/index.js';

const execFileAsync = promisify(execFile);

export interface KeyframeOcrResult {
  timestamp: number;
  text: string;
  has_text: boolean;
}

export interface ProjectOcrSummary {
  ocr_status: 'detected' | 'empty' | 'NOT_CONFIGURED';
  results: KeyframeOcrResult[];
  combined_unique_text: string;
}

/**
 * Phase 16: OCR Feature Service
 * Extracts on-screen text from keyframes using real local Tesseract.
 * Zero fake OCR. Returns NOT_CONFIGURED when Tesseract is not present.
 */
export class OcrFeatureService {
  /**
   * Resolves the Tesseract binary path.
   */
  public static getTesseractPath(): string | null {
    if (process.env.TESSERACT_PATH && fs.existsSync(process.env.TESSERACT_PATH)) {
      return process.env.TESSERACT_PATH;
    }
    const candidates = [
      '/opt/homebrew/bin/tesseract',
      '/usr/local/bin/tesseract',
      '/usr/bin/tesseract',
      'tesseract',
    ];
    for (const c of candidates) {
      if (c.startsWith('/') && fs.existsSync(c)) {
        return c;
      }
    }
    return null;
  }

  /**
   * Runs OCR on a single image file path.
   * Resolves real canonical paths to avoid symlink issues on macOS (/tmp vs /private/tmp).
   */
  public static async runOcrOnImage(
    imagePath: string,
    timeoutMs = 15000
  ): Promise<string> {
    const tesseractBin = this.getTesseractPath();
    if (!tesseractBin) {
      return '';
    }

    if (!fs.existsSync(imagePath)) {
      return '';
    }

    // Resolve canonical path
    const resolvedPath = fs.realpathSync(imagePath);
    const tag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const rawOutBase = path.join(os.tmpdir(), `vireo-ocr-${tag}`);
    const outBase = fs.existsSync(os.tmpdir()) ? path.join(fs.realpathSync(os.tmpdir()), `vireo-ocr-${tag}`) : rawOutBase;
    const outTxt = `${outBase}.txt`;

    try {
      await execFileAsync(
        tesseractBin,
        [resolvedPath, outBase, '--oem', '1', '-l', 'eng'],
        { timeout: timeoutMs }
      );

      if (fs.existsSync(outTxt)) {
        const rawContent = fs.readFileSync(outTxt, 'utf8');
        return this.cleanOcrText(rawContent);
      }
      return '';
    } catch (err: any) {
      logger.warn(`[OcrFeatureService] Tesseract execution notice: ${err.message}`);
      return '';
    } finally {
      try {
        if (fs.existsSync(outTxt)) {
          fs.unlinkSync(outTxt);
        }
      } catch {}
    }
  }

  /**
   * Cleans OCR text: strips garbage single characters, collapses whitespace, trims lines.
   */
  public static cleanOcrText(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 2) // Ignore single artifact chars
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Processes a list of keyframes with local Tesseract.
   * If Tesseract is not available, gracefully marks ocr_status as NOT_CONFIGURED.
   */
  public static async processKeyframes(
    keyframes: VideoKeyframe[],
    maxFramesToScan = 20
  ): Promise<ProjectOcrSummary> {
    const tesseractBin = this.getTesseractPath();
    if (!tesseractBin) {
      return {
        ocr_status: 'NOT_CONFIGURED',
        results: [],
        combined_unique_text: '',
      };
    }

    const framesToScan = keyframes.slice(0, maxFramesToScan);
    const results: KeyframeOcrResult[] = [];
    const uniqueLines = new Set<string>();

    for (const kf of framesToScan) {
      if (!kf.frame_path || !fs.existsSync(kf.frame_path)) continue;

      const detected = await this.runOcrOnImage(kf.frame_path);
      kf.ocr_text = detected;

      if (detected.length > 0) {
        results.push({
          timestamp: kf.timestamp,
          text: detected,
          has_text: true,
        });
        uniqueLines.add(detected);
      } else {
        results.push({
          timestamp: kf.timestamp,
          text: '',
          has_text: false,
        });
      }
    }

    const hasAnyText = results.some((r) => r.has_text);
    return {
      ocr_status: hasAnyText ? 'detected' : 'empty',
      results,
      combined_unique_text: Array.from(uniqueLines).join(' | '),
    };
  }
}
