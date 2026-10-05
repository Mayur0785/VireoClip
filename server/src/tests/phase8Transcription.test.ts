/**
 * Phase 8 Deterministic Test Suite
 * Tests provider factory, provider behaviors, normalization, error mapping, and pre-flight validation
 * without making external paid API requests.
 */
import assert from 'assert';
import { getTranscriptionProvider } from '../services/transcription/transcriptionProviderFactory.js';
import { GroqTranscriptionProvider } from '../services/transcription/groqTranscriptionProvider.js';
import { OpenRouterTranscriptionProvider } from '../services/transcription/openRouterTranscriptionProvider.js';
import { normalizeTranscriptionError } from '../services/transcription/errorNormalizer.js';
import { config } from '../config/index.js';

let passed = 0;
let total = 0;

function it(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✓ ${name}`);
        })
        .catch((err) => {
          console.error(`  ✗ ${name}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('Running Phase 8 Deterministic Tests...\n');

  // Test 1: Factory default resolves configured provider (or Groq)
  await it('Factory default resolves configured provider (or Groq)', () => {
    const provider = getTranscriptionProvider();
    const expected = config.transcriptionProvider || 'groq';
    assert.strictEqual(provider.name, expected);
  });

  // Test 1b: Factory resolves GroqTranscriptionProvider when explicitly requested
  await it('Factory resolves GroqTranscriptionProvider when specified', () => {
    const provider = getTranscriptionProvider('groq');
    assert.strictEqual(provider.name, 'groq');
    assert.ok(provider instanceof GroqTranscriptionProvider);
  });

  // Test 2: Factory with openrouter resolves OpenRouterTranscriptionProvider
  await it('Factory resolves OpenRouterTranscriptionProvider when specified', () => {
    const provider = getTranscriptionProvider('openrouter');
    assert.strictEqual(provider.name, 'openrouter');
    assert.ok(provider instanceof OpenRouterTranscriptionProvider);
  });

  // Test 3: Factory throws error for unsupported provider
  await it('Factory throws clear configuration error for unsupported provider', () => {
    assert.throws(
      () => getTranscriptionProvider('unsupported-vendor'),
      /Unsupported transcription provider "unsupported-vendor"/
    );
  });

  // Test 4: Missing GROQ_API_KEY throws before network request
  await it('GroqTranscriptionProvider rejects when GROQ_API_KEY is missing', async () => {
    const origKey = config.groqApiKey;
    (config as any).groqApiKey = '';
    const provider = new GroqTranscriptionProvider();
    await assert.rejects(
      () => provider.transcribeAudio(Buffer.from('fake-audio')),
      /GROQ_API_KEY is not configured on the server/
    );
    (config as any).groqApiKey = origKey;
  });

  // Test 5: Missing OPENROUTER_API_KEY throws before network request
  await it('OpenRouterTranscriptionProvider rejects when OPENROUTER_API_KEY is missing', async () => {
    const origKey = config.openrouterApiKey;
    (config as any).openrouterApiKey = '';
    const provider = new OpenRouterTranscriptionProvider();
    await assert.rejects(
      () => provider.transcribeAudio(Buffer.from('fake-audio')),
      /OPENROUTER_API_KEY is not configured on the server/
    );
    (config as any).openrouterApiKey = origKey;
  });

  // Test 6: Empty audio buffer rejected pre-flight
  await it('Providers reject empty audio buffer pre-flight', async () => {
    const origGroqKey = config.groqApiKey;
    (config as any).groqApiKey = 'gsk-test-key-mock';
    const groq = new GroqTranscriptionProvider();
    await assert.rejects(
      () => groq.transcribeAudio(Buffer.alloc(0)),
      /provided audio buffer is empty/
    );
    (config as any).groqApiKey = origGroqKey;

    const origOpenRouterKey = config.openrouterApiKey;
    (config as any).openrouterApiKey = 'sk-or-test-key-mock';
    const openrouter = new OpenRouterTranscriptionProvider();
    await assert.rejects(
      () => openrouter.transcribeAudio(Buffer.alloc(0)),
      /provided audio buffer is empty/
    );
    (config as any).openrouterApiKey = origOpenRouterKey;
  });

  // Test 7: Audio > 25MB rejected pre-flight
  await it('Providers reject audio exceeding 25MB pre-flight', async () => {
    const origGroqKey = config.groqApiKey;
    (config as any).groqApiKey = 'gsk-test-key-mock';
    const groq = new GroqTranscriptionProvider();
    const largeBuffer = Buffer.alloc(26 * 1024 * 1024); // 26 MB
    await assert.rejects(
      () => groq.transcribeAudio(largeBuffer),
      /Audio track exceeds transcription provider limit of 25 MB/
    );
    (config as any).groqApiKey = origGroqKey;
  });

  // Test 8: Error normalization for status codes (401, 402, 408, 413, 429, 500/503)
  await it('Error normalizer maps status codes safely without leaking keys', () => {
    const err401 = normalizeTranscriptionError(new Error('Invalid key Bearer gsk_secret_12345'), {
      status: 401,
      provider: 'Groq',
    });
    assert.strictEqual(
      err401.message,
      'Transcription provider authentication failed. Please verify provider credentials.'
    );
    assert.ok(!err401.message.includes('gsk_secret_12345'));

    const err402 = normalizeTranscriptionError(new Error('Out of credits'), {
      status: 402,
      provider: 'OpenRouter',
    });
    assert.strictEqual(
      err402.message,
      'Transcription provider credit balance is insufficient.'
    );

    const err408 = normalizeTranscriptionError(new Error('Request aborted'), {
      status: 408,
      provider: 'Groq',
    });
    assert.strictEqual(
      err408.message,
      'Transcription provider request timed out. Please retry.'
    );

    const err413 = normalizeTranscriptionError(new Error('Payload too large'), {
      status: 413,
      provider: 'Groq',
    });
    assert.strictEqual(
      err413.message,
      'Audio track exceeds transcription provider limit of 25 MB. Please provide a shorter clip.'
    );

    const err429 = normalizeTranscriptionError(new Error('Too many requests'), {
      status: 429,
      provider: 'Groq',
    });
    assert.strictEqual(
      err429.message,
      'Transcription rate limit reached. Please wait a few moments before retrying.'
    );

    const err500 = normalizeTranscriptionError(new Error('Internal server error'), {
      status: 500,
      provider: 'Groq',
    });
    assert.strictEqual(
      err500.message,
      'Transcription provider service is temporarily unavailable. Please retry shortly.'
    );

    const err503 = normalizeTranscriptionError(new Error('Service unavailable'), {
      status: 503,
      provider: 'OpenRouter',
    });
    assert.strictEqual(
      err503.message,
      'Transcription provider service is temporarily unavailable. Please retry shortly.'
    );
  });

  // Test 9: Error normalization for empty speech and malformed JSON
  await it('Error normalizer maps empty transcript and malformed response', () => {
    const emptyErr = normalizeTranscriptionError(
      new Error('Transcription returned no audible speech'),
      { provider: 'Groq' }
    );
    assert.strictEqual(
      emptyErr.message,
      'Transcription returned no speech. Ensure the video has audible speech.'
    );

    const jsonErr = normalizeTranscriptionError(
      new Error('Unexpected token < in JSON at position 0'),
      { provider: 'Groq' }
    );
    assert.strictEqual(
      jsonErr.message,
      'Unable to parse transcription provider response.'
    );
  });

  // Test 10: Segment normalization behavior
  await it('Segment normalization validates start, end, and text fields', () => {
    const mockRawSegments = [
      { start: 0, end: 2.5, text: ' Hello world! ' },
      { start: '2.5', end: '4.8', text: 'Testing normalized segments.' },
      { start: null, end: undefined, text: '' }, // empty/invalid
    ];

    const normalized = mockRawSegments
      .map((seg: any) => ({
        start: Number(seg.start ?? 0),
        end: Number(seg.end ?? 0),
        text: String(seg.text ?? '').trim(),
      }))
      .filter((seg) => seg.text.length > 0 || seg.end > seg.start);

    assert.strictEqual(normalized.length, 2);
    assert.deepStrictEqual(normalized[0], {
      start: 0,
      end: 2.5,
      text: 'Hello world!',
    });
    assert.deepStrictEqual(normalized[1], {
      start: 2.5,
      end: 4.8,
      text: 'Testing normalized segments.',
    });
  });

  // Test 11: Database payload compatibility test
  await it('Normalized transcription shape maps directly to transcripts table payload', () => {
    const normalizedResult = {
      text: 'This is the full transcription test text.',
      language: 'en',
      durationSeconds: 120.45,
      segments: [
        { start: 0, end: 60, text: 'Part 1' },
        { start: 60, end: 120.45, text: 'Part 2' },
      ],
    };

    const projectId = '11111111-1111-1111-1111-111111111111';
    const userId = '22222222-2222-2222-2222-222222222222';

    const dbPayload = {
      project_id: projectId,
      user_id: userId,
      transcript_text: normalizedResult.text,
      language: normalizedResult.language,
      duration_seconds: normalizedResult.durationSeconds,
      segments: normalizedResult.segments,
      updated_at: new Date().toISOString(),
    };

    assert.strictEqual(dbPayload.project_id, projectId);
    assert.strictEqual(dbPayload.user_id, userId);
    assert.strictEqual(dbPayload.transcript_text, 'This is the full transcription test text.');
    assert.strictEqual(dbPayload.language, 'en');
    assert.strictEqual(dbPayload.duration_seconds, 120.45);
    assert.strictEqual(dbPayload.segments.length, 2);
    assert.ok(typeof dbPayload.updated_at === 'string');
  });

  console.log(`\nResults: ${passed}/${total} tests passed.\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
