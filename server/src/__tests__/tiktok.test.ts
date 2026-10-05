import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VALID_PLATFORMS } from '../types/index.js';
import { ContentPromptService } from '../services/contentPromptService.js';
import { ContentOutputService } from '../services/contentOutputService.js';

describe('TikTok content kit', () => {
  it('is one of the six supported generation targets', () => {
    assert.deepEqual(VALID_PLATFORMS, [
      'youtube', 'instagram', 'shorts', 'tiktok', 'linkedin', 'x',
    ]);
  });

  it('uses transcript context and never asks for invented timestamps', () => {
    const prompt = ContentPromptService.buildPromptForPlatform('tiktok', {
      transcript: 'A practical lesson about planning one video.',
      segments: [],
    });
    assert.match(prompt, /TikTok content package/);
    assert.match(prompt, /A practical lesson about planning one video/);
    assert.match(prompt, /Set start and end to "N\/A"/);
  });

  it('saves hooks, caption, and a timestamped clip idea as editable rows', () => {
    const rows = ContentOutputService.transformTikTokToRows('project-1', {
      hooks: ['First hook', 'Second hook', 'Third hook'],
      caption: 'An editable caption',
      moment: {
        start: '00:12',
        end: '00:35',
        description: 'A useful standalone lesson',
        timestamps_available: true,
      },
    });
    assert.deepEqual(rows.map(({ platform, content_type, position }) => ({ platform, content_type, position })), [
      { platform: 'tiktok', content_type: 'hook', position: 0 },
      { platform: 'tiktok', content_type: 'hook', position: 1 },
      { platform: 'tiktok', content_type: 'hook', position: 2 },
      { platform: 'tiktok', content_type: 'caption', position: 0 },
      { platform: 'tiktok', content_type: 'moment', position: 0 },
    ]);
    assert.equal(rows.at(-1)?.content, '[00:12 - 00:35] A useful standalone lesson');
  });

  it('omits time labels when a clip has no verified timestamps', () => {
    const rows = ContentOutputService.transformTikTokToRows('project-1', {
      hooks: ['Hook'],
      caption: 'Caption',
      moment: { start: 'N/A', end: 'N/A', description: 'A grounded clip idea', timestamps_available: false },
    });
    assert.equal(rows.at(-1)?.content, 'A grounded clip idea');
  });
});
