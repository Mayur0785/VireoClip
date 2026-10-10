// Marketing plan definitions aligned with application plan configuration (server/src/services/billing/planConfig.ts).
// Free tier is active. Paid plans (Creator, Pro, Studio) are fully engineered in-app; live payment checkout is currently undergoing sandbox verification prior to public commercial release.

export interface MarketingPlan {
  name: string;
  badge?: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  available: boolean;
  statusNote: string;
}

export const plans: MarketingPlan[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/ month',
    description: 'Get started with essential video clipping and platform content kits.',
    features: [
      '15 video processing minutes / mo',
      'AI transcription & moment detection',
      'Export vertical 9:16 clips',
      'Multi-platform content kits (6 channels)',
      '1 workspace member',
    ],
    available: true,
    statusNote: 'Active now — no card required',
  },
  {
    name: 'Creator',
    badge: 'POPULAR',
    price: '$12',
    period: '/ mo ($120/yr)',
    description: 'For active creators publishing weekly short-form video content.',
    features: [
      '120 video processing minutes / mo',
      'High-definition 1080p exports',
      'Custom brand voice presets',
      'Priority AI clipping queue',
      '1 workspace member',
    ],
    available: false,
    statusNote: 'Sandbox preview • Checkout activation pending',
  },
  {
    name: 'Pro',
    badge: 'FOR TEAMS',
    price: '$24',
    period: '/ mo ($240/yr)',
    description: 'For collaborative creator teams and multi-platform publishing.',
    features: [
      '360 video processing minutes / mo',
      'Up to 3 team workspace members',
      'Custom watermarks & brand assets',
      'Social auto-scheduling & dispatch',
      'Priority render queue',
    ],
    available: false,
    statusNote: 'Sandbox preview • Checkout activation pending',
  },
  {
    name: 'Studio',
    badge: 'STUDIO SCALE',
    price: '$49',
    period: '/ mo ($490/yr)',
    description: 'For production agencies with demanding multi-seat video workflows.',
    features: [
      '900 video processing minutes / mo',
      'Up to 10 team workspace members',
      'Dedicated compute pipeline',
      'Full brand kit automation',
      'Priority enterprise support',
    ],
    available: false,
    statusNote: 'Sandbox preview • Checkout activation pending',
  },
];

export const examples = [
  { platform: 'YouTube', type: 'Title + description', sample: 'The lessons that changed how I run my business' },
  { platform: 'Instagram', type: 'Hook + caption', sample: 'The one thing I wish I knew before I started…' },
  { platform: 'Shorts / Reels', type: 'Moment ideas', sample: 'A sharp takeaway, ready to turn into a clip' },
  { platform: 'TikTok', type: 'Hook + caption', sample: 'The moment that changes how you think about your next video' },
  { platform: 'LinkedIn', type: 'Professional post', sample: 'Three practical lessons from building in public' },
  { platform: 'X', type: 'Thread outline', sample: 'A concise story, structured post by post' },
];
