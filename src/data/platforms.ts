import youtubeLogo from '../assets/landing/platforms/youtube.svg';
import instagramLogo from '../assets/landing/platforms/instagram.svg';
import shortsLogo from '../assets/landing/platforms/youtubeshorts.svg';
import tiktokLogo from '../assets/landing/platforms/tiktok.svg';
import linkedinLogo from '../assets/landing/platforms/linkedin-in.png';
import xLogo from '../assets/landing/platforms/x.svg';

export const platformOutputs = [
  { name: 'YouTube', type: 'Title + description', logo: youtubeLogo, variant: 'youtube' },
  { name: 'Instagram', type: 'Hook + caption', logo: instagramLogo, variant: 'instagram' },
  { name: 'Shorts / Reels', type: 'Moments + timestamps', logo: shortsLogo, variant: 'shorts' },
  { name: 'TikTok', type: 'Hook + caption', logo: tiktokLogo, variant: 'tiktok' },
  { name: 'LinkedIn', type: 'Professional post', logo: linkedinLogo, variant: 'linkedin' },
  { name: 'X', type: 'Thread draft', logo: xLogo, variant: 'x' },
] as const;

export const channels = platformOutputs.map((platform) => platform.name);
