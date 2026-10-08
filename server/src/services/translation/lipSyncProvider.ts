import { AppError, LipSyncProviderCapabilities } from '../../types/index.js';

export interface LipSyncRequest {
  video_path: string;
  audio_path: string;
  consent_confirmed: boolean;
  consent_statement?: string;
}

export interface LipSyncResult {
  output_video_path: string;
  duration_sec: number;
}

export interface LipSyncProvider {
  name: string;
  isConfigured(): boolean;
  getCapabilities(): LipSyncProviderCapabilities;
  generateLipSync(request: LipSyncRequest, userId: string): Promise<LipSyncResult>;
}

/**
 * Phase 21: Lip-Sync Provider Architecture
 * Enforces zero-fake lip sync and strict likeness protections.
 * Correctly reports NOT_CONFIGURED in current deployment.
 */
export class DefaultLipSyncProvider implements LipSyncProvider {
  public readonly name = 'default';

  public isConfigured(): boolean {
    return false; // Honest status: No proprietary lip-sync model provisioned
  }

  public getCapabilities(): LipSyncProviderCapabilities {
    return {
      provider_name: this.name,
      status: 'NOT_CONFIGURED',
    };
  }

  public async generateLipSync(
    request: LipSyncRequest,
    _userId: string
  ): Promise<LipSyncResult> {
    if (!request.consent_confirmed || !request.consent_statement?.trim()) {
      throw new AppError(
        '[CONSENT_REQUIRED] Affirmative likeness and video consent is required for facial processing.',
        400,
        'CONSENT_REQUIRED'
      );
    }

    throw new AppError(
      '[LIP_SYNC_NOT_CONFIGURED] Lip-sync synthesis engine is not configured in this deployment.',
      503,
      'NOT_CONFIGURED'
    );
  }
}

export class LipSyncProviderRegistry {
  private static provider: LipSyncProvider = new DefaultLipSyncProvider();

  public static getProvider(): LipSyncProvider {
    return this.provider;
  }

  public static getCapabilities(): LipSyncProviderCapabilities {
    return this.provider.getCapabilities();
  }
}
