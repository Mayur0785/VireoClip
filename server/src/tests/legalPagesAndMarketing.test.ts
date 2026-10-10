import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS } from '../services/billing/planConfig.js';

describe('Vireo — Legal Pages & Honest Marketing Verification', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, '../../..');

  it('aligns marketing plan definitions with server planConfig.ts', async () => {
    const marketingPath = path.join(rootDir, 'src/data/marketing.ts');
    assert.ok(fs.existsSync(marketingPath), 'src/data/marketing.ts must exist');

    const marketingContent = fs.readFileSync(marketingPath, 'utf8');

    // Verify all 4 tiers exist in marketing.ts
    assert.match(marketingContent, /name:\s*'Free'/, 'Marketing includes Free tier');
    assert.match(marketingContent, /name:\s*'Creator'/, 'Marketing includes Creator tier');
    assert.match(marketingContent, /name:\s*'Pro'/, 'Marketing includes Pro tier');
    assert.match(marketingContent, /name:\s*'Studio'/, 'Marketing includes Studio tier');

    // Verify pricing matches planConfig.ts
    assert.match(marketingContent, new RegExp(`price:\\s*'\\$${PLANS.free.monthly_price}'`));
    assert.match(marketingContent, new RegExp(`price:\\s*'\\$${PLANS.creator.monthly_price}'`));
    assert.match(marketingContent, new RegExp(`price:\\s*'\\$${PLANS.pro.monthly_price}'`));
    assert.match(marketingContent, new RegExp(`price:\\s*'\\$${PLANS.studio.monthly_price}'`));

    // Verify processing quotas match planConfig.ts
    assert.match(marketingContent, new RegExp(`${PLANS.free.monthly_minutes}\\s*video processing minutes`));
    assert.match(marketingContent, new RegExp(`${PLANS.creator.monthly_minutes}\\s*video processing minutes`));
    assert.match(marketingContent, new RegExp(`${PLANS.pro.monthly_minutes}\\s*video processing minutes`));
    assert.match(marketingContent, new RegExp(`${PLANS.studio.monthly_minutes}\\s*video processing minutes`));
  });

  it('presents transparent checkout status and avoids misleading claims in marketing', () => {
    const marketingPath = path.join(rootDir, 'src/data/marketing.ts');
    const marketingContent = fs.readFileSync(marketingPath, 'utf8');

    // Verify Free tier is available and paid tiers clearly state sandbox / verification status
    assert.match(marketingContent, /available:\s*true/, 'Free tier is marked available');
    assert.match(marketingContent, /available:\s*false/, 'Paid tiers are not marked immediately active');
    assert.match(marketingContent, /Sandbox preview • Checkout activation pending/);

    // Verify no false live checkout claims
    assert.doesNotMatch(marketingContent, /guaranteed immediate refunds/i);
    assert.doesNotMatch(marketingContent, /instant live checkout/i);
  });

  it('verifies Terms of Service contains draft disclaimer and required owner confirmation tags', () => {
    const termsPath = path.join(rootDir, 'src/pages/TermsPage.tsx');
    assert.ok(fs.existsSync(termsPath), 'TermsPage.tsx must exist');

    const termsContent = fs.readFileSync(termsPath, 'utf8');

    // Must prominently display DRAFT — LEGAL REVIEW REQUIRED
    assert.match(termsContent, /DRAFT — LEGAL REVIEW REQUIRED/);
    assert.match(termsContent, /does not constitute formal legal advice/);

    // Must identify required owner confirmations
    assert.match(termsContent, /CONFIRMATION REQUIRED: Legal Company \/ Registered Entity Name/);
    assert.match(termsContent, /CONFIRMATION REQUIRED: Registered Physical Business Address/);
    assert.match(termsContent, /CONFIRMATION REQUIRED: Governing Jurisdiction/);
    assert.match(termsContent, /CONFIRMATION REQUIRED: Designated Support \/ Legal Email Address/);

    // Must accurately describe technical architecture
    assert.match(termsContent, /Supabase Auth/);
    assert.match(termsContent, /Groq/);
    assert.match(termsContent, /OpenRouter/);
    assert.match(termsContent, /AES-256-GCM/);
  });

  it('verifies Privacy Policy contains technical subprocessor inventory and draft banner', () => {
    const privacyPath = path.join(rootDir, 'src/pages/PrivacyPage.tsx');
    assert.ok(fs.existsSync(privacyPath), 'PrivacyPage.tsx must exist');

    const privacyContent = fs.readFileSync(privacyPath, 'utf8');

    // Must prominently display DRAFT — LEGAL REVIEW REQUIRED
    assert.match(privacyContent, /DRAFT — LEGAL REVIEW REQUIRED/);

    // Must document verified subprocessors
    assert.match(privacyContent, /Supabase/);
    assert.match(privacyContent, /MongoDB Atlas/);
    assert.match(privacyContent, /Cloudflare R2/);
    assert.match(privacyContent, /Groq API/);
    assert.match(privacyContent, /OpenRouter/);
    assert.match(privacyContent, /Paddle/);
    assert.match(privacyContent, /Razorpay/);

    // Must document zero third-party advertising cookies
    assert.match(privacyContent, /third-party advertising cookies/i);

    // Must not falsely claim unilateral compliance
    assert.match(privacyContent, /does not unilaterally certify regulatory compliance/i);
  });

  it('verifies CookieNotice and public navigation links in App.tsx and Footer.tsx', () => {
    const appPath = path.join(rootDir, 'src/App.tsx');
    const footerPath = path.join(rootDir, 'src/components/Footer.tsx');
    const signupPath = path.join(rootDir, 'src/pages/SignupPage.tsx');

    const appContent = fs.readFileSync(appPath, 'utf8');
    const footerContent = fs.readFileSync(footerPath, 'utf8');
    const signupContent = fs.readFileSync(signupPath, 'utf8');

    // Routes in App.tsx
    assert.match(appContent, /path="\/terms"/);
    assert.match(appContent, /path="\/privacy"/);
    assert.match(appContent, /<CookieNotice \/>/);

    // Links in Footer.tsx
    assert.match(footerContent, /to="\/terms"/);
    assert.match(footerContent, /to="\/privacy"/);

    // Links in SignupPage.tsx
    assert.match(signupContent, /to="\/terms"/);
    assert.match(signupContent, /to="\/privacy"/);
  });
});
