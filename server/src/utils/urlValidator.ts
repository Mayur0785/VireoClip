import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../types/index.js';

/**
 * Supported video hosting domains and URL patterns.
 * Initially allows direct HTTP/HTTPS media files from publicly accessible web servers,
 * CDNs, and media storage hosts (Cloudflare, AWS, Supabase, GitHub releases, Wikimedia, Archive.org, W3C, Google Cloud Storage, etc.).
 */
export const ALLOWED_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.avi',
  '.mkv',
]);

export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export interface ValidatedUrlResult {
  normalizedUrl: string;
  hostname: string;
  inferredFilename: string;
  provider: 'direct_media' | 'youtube';
  youtubeVideoId?: string;
}

export class UrlValidator {
  /**
   * Checks if an IP address string belongs to private, loopback, link-local, or special reserved ranges.
   */
  public static isPrivateIp(ip: string): boolean {
    if (!net.isIP(ip)) {
      return false;
    }

    // IPv4 checks
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      const [a, b] = parts;

      // 0.0.0.0/8 (Current network)
      if (a === 0) return true;

      // 10.0.0.0/8 (Private RFC1918)
      if (a === 10) return true;

      // 127.0.0.0/8 (Loopback)
      if (a === 127) return true;

      // 169.254.0.0/16 (Link-local / Cloud metadata)
      if (a === 169 && b === 254) return true;

      // 172.16.0.0/12 (Private RFC1918)
      if (a === 172 && b >= 16 && b <= 31) return true;

      // 192.168.0.0/16 (Private RFC1918)
      if (a === 192 && b === 168) return true;

      // 100.64.0.0/10 (Carrier-grade NAT)
      if (a === 100 && b >= 64 && b <= 127) return true;

      // 192.0.0.0/24, 192.0.2.0/24 (Documentation / Test)
      if (a === 192 && b === 0) return true;

      // 198.51.100.0/24, 203.0.113.0/24 (Documentation)
      if (a === 198 && (b === 51 || b === 18 || b === 19)) return true;
      if (a === 203 && b === 0) return true;

      // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
      if (a >= 224) return true;

      // 255.255.255.255 (Broadcast)
      if (ip === '255.255.255.255') return true;

      return false;
    }

    // IPv6 checks
    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase();

      // ::1 loopback
      if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;

      // :: unspecified
      if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;

      // Link-local fe80::/10
      if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
        return true;
      }

      // Unique local fc00::/7 (fc00 - fdff)
      if (lower.startsWith('fc') || lower.startsWith('fd')) {
        return true;
      }

      // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
      if (lower.includes('::ffff:')) {
        const ipv4Part = lower.split('::ffff:')[1];
        if (ipv4Part && net.isIPv4(ipv4Part)) {
          return this.isPrivateIp(ipv4Part);
        }
      }

      return false;
    }

    return false;
  }

  /**
   * Resolves the hostname to IP addresses via DNS and checks for SSRF targets.
   */
  public static async checkSsrf(hostname: string): Promise<void> {
    const cleanHost = hostname.toLowerCase().trim();

    // Check direct loopback/local hostnames
    if (
      cleanHost === 'localhost' ||
      cleanHost.endsWith('.localhost') ||
      cleanHost.endsWith('.local') ||
      cleanHost.endsWith('.internal') ||
      cleanHost.endsWith('.lan') ||
      cleanHost.endsWith('.home') ||
      cleanHost === 'metadata.google.internal' ||
      cleanHost === 'instance-data'
    ) {
      throw new AppError('Access to local or internal addresses is blocked.', 400, 'SSRF_BLOCKED');
    }

    // If hostname is already an IP address
    if (net.isIP(cleanHost)) {
      if (this.isPrivateIp(cleanHost)) {
        throw new AppError('Access to private or local IP ranges is blocked.', 400, 'SSRF_BLOCKED');
      }
      return;
    }

    // Perform DNS lookup to test underlying resolved IPs
    try {
      const addresses = await dns.lookup(cleanHost, { all: true });
      if (!addresses || addresses.length === 0) {
        throw new AppError('Failed to resolve host address.', 400, 'INVALID_HOST');
      }

      for (const addr of addresses) {
        if (this.isPrivateIp(addr.address)) {
          throw new AppError('Target URL resolves to a private or restricted network address.', 400, 'SSRF_BLOCKED');
        }
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`DNS resolution failed for host "${cleanHost}": ${err.message}`, 400, 'HOST_UNREACHABLE');
    }
  }

  /**
   * Parses and validates a potential YouTube video URL.
   * Extracts clean 11-char video ID from watch, youtu.be, shorts, and embed formats.
   * Returns null if URL is not a YouTube URL.
   * Throws AppError if it IS a YouTube domain but is a non-video page (channel, playlist, search, homepage).
   */
  public static parseYouTubeUrl(parsed: URL): { videoId: string; normalizedUrl: string } | null {
    const host = parsed.hostname.toLowerCase();
    const isYtDomain = host === 'youtube.com' || host.endsWith('.youtube.com');
    const isYtShortDomain = host === 'youtu.be' || host.endsWith('.youtu.be');

    if (!isYtDomain && !isYtShortDomain) {
      return null;
    }

    let videoId: string | null = null;

    if (isYtShortDomain) {
      const part = parsed.pathname.slice(1).split('/')[0];
      if (part && YOUTUBE_VIDEO_ID_REGEX.test(part)) {
        videoId = part;
      }
    } else if (isYtDomain) {
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v');
        if (v && YOUTUBE_VIDEO_ID_REGEX.test(v)) {
          videoId = v;
        }
      } else if (parsed.pathname.startsWith('/shorts/')) {
        const part = parsed.pathname.replace(/^\/shorts\//, '').split('/')[0];
        if (part && YOUTUBE_VIDEO_ID_REGEX.test(part)) {
          videoId = part;
        }
      } else if (parsed.pathname.startsWith('/embed/')) {
        const part = parsed.pathname.replace(/^\/embed\//, '').split('/')[0];
        if (part && YOUTUBE_VIDEO_ID_REGEX.test(part)) {
          videoId = part;
        }
      } else if (parsed.pathname.startsWith('/v/')) {
        const part = parsed.pathname.replace(/^\/v\//, '').split('/')[0];
        if (part && YOUTUBE_VIDEO_ID_REGEX.test(part)) {
          videoId = part;
        }
      }
    }

    if (videoId) {
      return {
        videoId,
        normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }

    // It's a YouTube domain, but not a supported individual video URL (channel, playlist, user, etc.)
    throw new AppError(
      'Only direct public YouTube video and Short links are supported (e.g. youtube.com/watch?v=... or youtu.be/...). Channel, search, and playlist pages cannot be imported.',
      400,
      'YOUTUBE_INVALID_URL'
    );
  }

  /**
   * Validates video URL protocol, structure, and SSRF safety.
   */
  public static async validateVideoUrl(rawUrl: string): Promise<ValidatedUrlResult> {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      throw new AppError('Video URL is required.', 400, 'INVALID_URL');
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      throw new AppError('Malformed video URL. Please provide a valid HTTP or HTTPS URL.', 400, 'INVALID_URL');
    }

    // Protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new AppError(`Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`, 400, 'UNSUPPORTED_PROTOCOL');
    }

    // Hostname check
    if (!parsed.hostname || parsed.hostname.length < 3) {
      throw new AppError('Invalid hostname in video URL.', 400, 'INVALID_HOST');
    }

    const host = parsed.hostname.toLowerCase();

    // 1. Check for supported YouTube video URLs first
    const ytResult = this.parseYouTubeUrl(parsed);
    if (ytResult) {
      return {
        normalizedUrl: ytResult.normalizedUrl,
        hostname: parsed.hostname,
        inferredFilename: `youtube-${ytResult.videoId}.mp4`,
        provider: 'youtube',
        youtubeVideoId: ytResult.videoId,
      };
    }

    // 2. Reject other known unsupported platforms early (TikTok, Instagram)
    const otherUnsupportedPlatforms = [
      'tiktok.com',
      'instagram.com',
    ];

    const isOtherUnsupported = otherUnsupportedPlatforms.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );

    if (isOtherUnsupported) {
      throw new AppError(
        "This video platform URL isn't supported yet. Please use a direct public video file URL such as an MP4, MOV, WebM, AVI, or MKV URL, or a YouTube video link.",
        400,
        'UNSUPPORTED_PLATFORM_URL'
      );
    }

    // 3. SSRF validation for general web media URLs
    await this.checkSsrf(parsed.hostname);

    // 4. Extract pathname and inferred filename for direct media URLs
    const pathname = parsed.pathname;
    const rawFilename = pathname.split('/').pop() || 'video.mp4';
    let cleanFilename = rawFilename.split('?')[0].split('#')[0].trim();
    if (!cleanFilename || !cleanFilename.includes('.')) {
      cleanFilename = 'source_video.mp4';
    }

    return {
      normalizedUrl: parsed.toString(),
      hostname: parsed.hostname,
      inferredFilename: cleanFilename,
      provider: 'direct_media',
    };
  }
}
