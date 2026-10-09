import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from '../../utils/logger.js';
import {
  ThumbnailCapabilityModel,
  ThumbnailAspectRatio,
  ThumbnailStyleDirection,
} from '../../types/index.js';

export interface ImageGenerationRequest {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: ThumbnailAspectRatio;
  reference_image_path?: string;
  reference_image_url?: string;
  reference_strength?: number; // 0.01 to 1.0 (default 0.65 for thumbnail background stylization)
  style_direction?: ThumbnailStyleDirection;
  seed?: number;
}

export interface ImageGenerationResult {
  image_url: string;
  image_path?: string;
  provider: string;
  model: string;
  prompt_used: string;
  aspect_ratio: ThumbnailAspectRatio;
  timings?: Record<string, number>;
}

/**
 * Image Provider Interface for Thumbnail Lab.
 * Conforms to strict provider honesty and safe error boundary reporting.
 */
export interface ThumbnailImageProvider {
  name: string;
  getCapabilities(): ThumbnailCapabilityModel;
  generateThumbnailImage(request: ImageGenerationRequest, userId: string): Promise<ImageGenerationResult>;
}

/**
 * fal.ai Dedicated Image Provider Adapter.
 *
 * Model Endpoint:
 * - Image-to-Image / Reference Frame: "fal-ai/flux-lora/image-to-image"
 *   Schema: { prompt, image_url, strength (0.01-1.0), num_images: 1, guidance_scale: 3.5 }
 * - Text-to-Image (when no reference frame is provided): "fal-ai/flux/dev"
 *   Schema: { prompt, image_size: "landscape_16_9" | "portrait_16_9" | "square_hd", num_images: 1 }
 *
 * Security & Governance:
 * - Reads FAL_KEY strictly from server environment (`process.env.FAL_KEY`).
 * - Never leaks FAL_KEY to client responses, logs, or errors.
 * - Enforces request timeout with AbortController.
 * - Prevents automatic billing retry loops.
 * - Validates output image URLs before downloading or returning.
 */
export class FalImageProvider implements ThumbnailImageProvider {
  public readonly name = 'fal_ai';
  public static readonly I2I_ENDPOINT = 'https://fal.run/fal-ai/flux-lora/image-to-image';
  public static readonly T2I_ENDPOINT = 'https://fal.run/fal-ai/flux/dev';
  public static readonly REQUEST_TIMEOUT_MS = 45000;

  public get apiKey(): string | undefined {
    return process.env.FAL_KEY?.trim();
  }

  public getCapabilities(): ThumbnailCapabilityModel {
    const isConfigured = Boolean(this.apiKey && this.apiKey.length > 0);
    return {
      image_provider_status: isConfigured ? 'SUPPORTED' : 'NOT_CONFIGURED',
      image_provider_name: 'fal_ai (FLUX.1 [dev] & FLUX-LoRA i2i)',
      source_frame_extraction: 'SUPPORTED',
      brand_brain_integration: 'SUPPORTED',
      thumbnail_scoring: 'SUPPORTED',
      publishing_handoff: 'SUPPORTED',
      supported_aspect_ratios: ['16:9', '9:16', '1:1'],
      supported_style_directions: [
        'EXPRESSIVE_CREATOR_PORTRAIT',
        'CINEMATIC_STORYTELLING',
        'BOLD_TYPOGRAPHY',
        'CLEAN_EDUCATIONAL',
        'PODCAST_EDITORIAL',
        'MINIMAL_PREMIUM',
        'HIGH_CONTRAST_VISUAL',
        'PRODUCT_SUBJECT_FOCUSED',
      ],
      max_concepts_per_session: 12,
    };
  }

  /**
   * Maps Vireo aspect ratio to fal.ai image_size enum
   */
  public static mapAspectToFalSize(aspect: ThumbnailAspectRatio): string {
    switch (aspect) {
      case '16:9':
        return 'landscape_16_9';
      case '9:16':
        return 'portrait_16_9';
      case '1:1':
      default:
        return 'square_hd';
    }
  }

  /**
   * Generates a background thumbnail image using fal.ai.
   */
  public async generateThumbnailImage(
    request: ImageGenerationRequest,
    _userId: string
  ): Promise<ImageGenerationResult> {
    const caps = this.getCapabilities();
    if (caps.image_provider_status === 'NOT_CONFIGURED') {
      throw new Error(
        'fal.ai image generation provider is not configured. Configure FAL_KEY in server environment to enable generative AI thumbnail backgrounds.'
      );
    }

    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Image generation prompt is required.');
    }

    const key = this.apiKey!;
    const isImageToImage = Boolean(request.reference_image_url || request.reference_image_path);
    const endpoint = isImageToImage ? FalImageProvider.I2I_ENDPOINT : FalImageProvider.T2I_ENDPOINT;

    let payload: Record<string, any>;
    if (isImageToImage) {
      // Image-to-image with reference frame
      let imageUrl = request.reference_image_url;
      if (!imageUrl && request.reference_image_path && fs.existsSync(request.reference_image_path)) {
        // Encode local file to data URI if local path provided
        const mime = request.reference_image_path.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const buffer = fs.readFileSync(request.reference_image_path);
        imageUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      }

      if (!imageUrl) {
        throw new Error('Reference image could not be resolved for image-to-image conditioning.');
      }

      // Bound strength between 0.1 and 0.95
      const strength = Math.max(0.1, Math.min(0.95, request.reference_strength ?? 0.65));

      payload = {
        prompt: request.prompt,
        image_url: imageUrl,
        strength,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
      };
    } else {
      // Text-to-image
      payload = {
        prompt: request.prompt,
        image_size: FalImageProvider.mapAspectToFalSize(request.aspect_ratio),
        num_images: 1,
        enable_safety_checker: true,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, FalImageProvider.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Key ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let cleanMessage = `fal.ai provider error (HTTP ${response.status})`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.detail || parsed.message) {
            cleanMessage = `fal.ai: ${parsed.detail || parsed.message}`;
          }
        } catch {
          // ignore parsing error
        }
        throw new Error(cleanMessage);
      }

      const data = (await response.json()) as any;
      const images = data.images || [];
      if (!Array.isArray(images) || images.length === 0 || !images[0]?.url) {
        throw new Error('fal.ai response did not contain a valid generated image URL.');
      }

      const generatedUrl = images[0].url;

      return {
        image_url: generatedUrl,
        provider: 'fal_ai',
        model: isImageToImage ? 'flux-lora/image-to-image' : 'flux/dev',
        prompt_used: request.prompt,
        aspect_ratio: request.aspect_ratio,
        timings: data.timings,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('fal.ai image generation timed out. Please try again.');
      }
      // Re-throw sanitized error without revealing API keys
      throw new Error(err.message || 'Failed to generate image via fal.ai');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Composite Image Provider Router.
 * Automatically chooses FalImageProvider when FAL_KEY is configured;
 * otherwise reports honest unconfigured status.
 */
export class ThumbnailImageProviderManager implements ThumbnailImageProvider {
  public readonly name = 'provider_manager';
  private falProvider = new FalImageProvider();

  public getCapabilities(): ThumbnailCapabilityModel {
    if (this.falProvider.apiKey) {
      return this.falProvider.getCapabilities();
    }
    // Honest unconfigured state
    return {
      image_provider_status: 'NOT_CONFIGURED',
      image_provider_name: 'none (FAL_KEY not set)',
      source_frame_extraction: 'SUPPORTED',
      brand_brain_integration: 'SUPPORTED',
      thumbnail_scoring: 'SUPPORTED',
      publishing_handoff: 'SUPPORTED',
      supported_aspect_ratios: ['16:9', '9:16', '1:1'],
      supported_style_directions: [
        'EXPRESSIVE_CREATOR_PORTRAIT',
        'CINEMATIC_STORYTELLING',
        'BOLD_TYPOGRAPHY',
        'CLEAN_EDUCATIONAL',
        'PODCAST_EDITORIAL',
        'MINIMAL_PREMIUM',
        'HIGH_CONTRAST_VISUAL',
        'PRODUCT_SUBJECT_FOCUSED',
      ],
      max_concepts_per_session: 12,
    };
  }

  public async generateThumbnailImage(
    request: ImageGenerationRequest,
    userId: string
  ): Promise<ImageGenerationResult> {
    const caps = this.getCapabilities();
    if (caps.image_provider_status === 'NOT_CONFIGURED') {
      throw new Error(
        'AI image generation provider is not configured. Configure FAL_KEY in server environment to enable generative AI thumbnail backgrounds.'
      );
    }
    return await this.falProvider.generateThumbnailImage(request, userId);
  }
}

export const thumbnailImageProvider = new ThumbnailImageProviderManager();
