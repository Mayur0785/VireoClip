import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, ShieldCheck } from 'lucide-react';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#fafbf7] text-[#1a2e22] py-16 px-5 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#485f4d] hover:text-[#183d2d] mb-8 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Vireo home
        </Link>

        {/* Legal Review Required Callout Banner */}
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-5 mb-10 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold tracking-wide uppercase text-amber-900">
                DRAFT — LEGAL REVIEW REQUIRED
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                This Privacy Policy is an evidence-based draft detailing the exact data collection, processing, and storage architecture of Vireo.
                It has been prepared for developer and operator review and does not constitute formal legal counsel.
                Items marked with brackets (<span className="font-mono font-semibold">[CONFIRMATION REQUIRED]</span>) require explicit confirmation by the application owner and review by qualified legal counsel.
                Publishing this draft does not unilaterally certify regulatory compliance (e.g., GDPR, CCPA).
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-[#dfe7da] pb-8 mb-8">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#36764c]">
            <ShieldCheck className="size-4" />
            <span>Data Transparency</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-[#183d2d] mt-2 tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-3 text-xs text-[#78867a]">
            Status: Draft for Owner Review • Last updated: October 2026
          </p>
        </div>

        <div className="prose prose-sm max-w-none text-[#2d4233] space-y-8 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">1. Data Controller and Scope</h2>
            <p>
              This Privacy Policy explains how <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">[CONFIRMATION REQUIRED: Legal Company / Registered Entity Name]</span> ("Vireo", "we", "us", or "our") collects, uses, processes, and safeguards personal data through the Vireo web application.
            </p>
            <p className="mt-2">
              For privacy inquiries or data requests, contact our designated privacy representative at:
              <br />
              <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs mt-1 inline-block">[CONFIRMATION REQUIRED: Privacy / Data Protection Contact Email, e.g. privacy@vireo.app]</span>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">2. Categories of Data Collected and Processed</h2>
            <p>
              In accordance with our application architecture, we collect only data necessary to deliver video processing and publishing capabilities:
            </p>
            <div className="mt-3 space-y-3">
              <div className="p-3.5 rounded-lg border border-[#e1e7db] bg-white">
                <h3 className="font-bold text-xs uppercase text-[#183d2d] tracking-wide">A. Account and Identity Data</h3>
                <p className="mt-1 text-xs text-[#526857]">
                  Email address, hashed password credentials (managed securely via Supabase Auth), optional user display name, and unique account identifiers.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-[#e1e7db] bg-white">
                <h3 className="font-bold text-xs uppercase text-[#183d2d] tracking-wide">B. Video, Audio, and Creative Assets</h3>
                <p className="mt-1 text-xs text-[#526857]">
                  Raw video files uploaded via browser or imported from authorized URLs, extracted audio tracks, generated transcripts, custom watermarks, brand color hex codes, and brand tone guidelines.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-[#e1e7db] bg-white">
                <h3 className="font-bold text-xs uppercase text-[#183d2d] tracking-wide">C. Connected Social Platform OAuth Credentials</h3>
                <p className="mt-1 text-xs text-[#526857]">
                  OAuth access and refresh tokens for connected channels (YouTube, Instagram, TikTok, LinkedIn, X), platform user/channel identifiers, and scheduled publishing timestamps. <em>All OAuth tokens are encrypted at rest using AES-256-GCM encryption with randomized IVs.</em>
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-[#e1e7db] bg-white">
                <h3 className="font-bold text-xs uppercase text-[#183d2d] tracking-wide">D. Billing and Subscription Metadata</h3>
                <p className="mt-1 text-xs text-[#526857]">
                  Customer identifiers, subscription IDs, billing plan tier, current period start/end dates, and webhook event logs received from payment processors (Paddle, Razorpay, Stripe). <em>Vireo does NOT store raw credit card numbers, CVVs, or full bank account details on our servers.</em>
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-[#e1e7db] bg-white">
                <h3 className="font-bold text-xs uppercase text-[#183d2d] tracking-wide">E. Operational Logs and Quota Metrics</h3>
                <p className="mt-1 text-xs text-[#526857]">
                  Video processing minutes consumed, worker job execution states, API rate-limiting records, and workspace audit logs.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">3. Subprocessors and Third-Party Infrastructure</h2>
            <p>
              We disclose data to vetted technical subprocessors strictly as required to provide core product functionality:
            </p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs border border-[#dfe7da] bg-white rounded-lg">
                <thead className="bg-[#f2f5ec] text-[#183d2d] font-bold">
                  <tr>
                    <th className="p-2.5 border-b border-[#dfe7da]">Subprocessor</th>
                    <th className="p-2.5 border-b border-[#dfe7da]">Role & Function</th>
                    <th className="p-2.5 border-b border-[#dfe7da]">Data Involved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe7da] text-[#425947]">
                  <tr>
                    <td className="p-2.5 font-semibold">Supabase</td>
                    <td className="p-2.5">User authentication and session tokens</td>
                    <td className="p-2.5">Email address, encrypted auth session</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">MongoDB Atlas</td>
                    <td className="p-2.5">Primary application database</td>
                    <td className="p-2.5">User profile, workspace data, metadata, audit records</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">Cloudflare R2</td>
                    <td className="p-2.5">S3-compatible secure object storage</td>
                    <td className="p-2.5">Source media, rendered clip MP4 files, thumbnails</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">Groq API</td>
                    <td className="p-2.5">Audio transcription via Whisper models</td>
                    <td className="p-2.5">Extracted audio files from uploaded videos</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">OpenRouter</td>
                    <td className="p-2.5">Language model inference for moment detection & copywriting</td>
                    <td className="p-2.5">Video transcript text and user prompts</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">Paddle / Razorpay / Stripe</td>
                    <td className="p-2.5">Payment processing and subscription lifecycle</td>
                    <td className="p-2.5">Customer billing metadata and webhook payloads</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">Google / Meta / TikTok / LinkedIn / X</td>
                    <td className="p-2.5">Social media publishing targets</td>
                    <td className="p-2.5">Clips, captions, and publishing metadata authorized by user</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">4. Cookies and Client-Side Storage</h2>
            <p>
              Vireo does <strong>not</strong> employ third-party advertising cookies, behavioural cross-site tracking pixels, or data-broker trackers.
            </p>
            <p className="mt-2">
              We utilize strictly necessary local storage mechanisms:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li><strong>Session Authentication:</strong> Storing authorized tokens to maintain user sign-in status across navigation.</li>
              <li><strong>Interface Preferences:</strong> Retaining local UI preferences (such as editor display modes and notice dismissals).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">5. Data Retention, Deletion, and User Rights</h2>
            <p>
              <strong>Media Retention:</strong> Uploaded source videos and generated clips remain stored in your account until you delete them or close your account.
              Local server temporary processing files generated during FFmpeg transcoding are deleted upon job completion.
            </p>
            <p className="mt-2">
              <strong>Account Deletion:</strong> <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">[CONFIRMATION REQUIRED: Target retention period after account closure, e.g. 30 days grace period before hard database purge]</span>. Users may request full account and data erasure by contacting our privacy email.
            </p>
            <p className="mt-2">
              <strong>User Rights:</strong> Depending on your jurisdiction, you may have the right to request access to, rectification of, or deletion of your personal data.
              Requests will be processed upon verification of account ownership.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">6. Security Measures</h2>
            <p>
              We implement industry-standard technical safeguards to protect personal data:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li>Transport Layer Security (TLS/HTTPS) for all data in transit.</li>
              <li>AES-256-GCM encryption with randomized IVs for sensitive OAuth access tokens stored at rest.</li>
              <li>Tenant isolation enforced across database repositories to prevent cross-account data leakage.</li>
              <li>Automated rate-limiting to mitigate unauthorized credential abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">7. Policy Updates and Contact</h2>
            <p>
              We may update this Privacy Policy from time to time. Any material changes will be posted on this page with an updated revision date.
            </p>
            <p className="mt-2">
              For questions regarding this draft policy or our privacy practices:
              <br />
              <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs mt-1 inline-block">[CONFIRMATION REQUIRED: Designated Support / Privacy Email Address]</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
