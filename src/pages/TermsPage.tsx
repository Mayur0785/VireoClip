import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export const TermsPage: React.FC = () => {
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
                This Terms of Service document is an operational draft reflecting the current technical capabilities and architecture of Vireo.
                It does not constitute formal legal advice and has not been reviewed or executed by legal counsel.
                Items marked with brackets (<span className="font-mono font-semibold">[CONFIRMATION REQUIRED]</span>) must be confirmed and approved by the owner and qualified legal counsel prior to public launch.
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-[#dfe7da] pb-8 mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-[#36764c]">Legal Agreement</span>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-[#183d2d] mt-2 tracking-tight">
            Terms of Service
          </h1>
          <p className="mt-3 text-xs text-[#78867a]">
            Status: Draft for Owner Review • Last updated: October 2026
          </p>
        </div>

        <div className="prose prose-sm max-w-none text-[#2d4233] space-y-8 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">1. Operating Entity and Acceptance of Terms</h2>
            <p>
              These Terms of Service ("Terms") govern your access to and use of the Vireo web application, APIs, and associated services (collectively, "Vireo" or the "Service"), operated by <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">[CONFIRMATION REQUIRED: Legal Company / Registered Entity Name]</span> ("Company", "we", "us", or "our"), with registered offices at <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">[CONFIRMATION REQUIRED: Registered Physical Business Address]</span>.
            </p>
            <p className="mt-2">
              By accessing, browsing, registering an account with, or utilizing any portion of Vireo, you agree to be bound by these Terms. If you do not agree to all terms and conditions set forth herein, you must not access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">2. Account Registration and Security</h2>
            <p>
              To utilize core features of Vireo, you must create an account using a valid email address and secure password (authenticated through our identity provider, Supabase Auth) or an authorized third-party OAuth provider (such as Google).
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li>You must provide true, accurate, and complete registration information.</li>
              <li>You are solely responsible for safeguarding your login credentials and preventing unauthorized access.</li>
              <li>You are fully responsible for all actions conducted under your account, including operations initiated by invited workspace members.</li>
              <li>Workspace roles (Owner, Admin, Editor, Viewer) grant distinct permission tiers within the application; workspace owners maintain administrative accountability for all member invitations and access rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">3. Service Description and AI Processing</h2>
            <p>
              Vireo is a video content repurposing and management platform designed to transcribe spoken audio, detect notable clips, reframe video to vertical 9:16 aspect ratios, burn closed captions, generate multi-platform social media copy, and assist in publishing workflows.
            </p>
            <p className="mt-2">
              <strong>Automated and Generative Output:</strong> Portions of the Service utilize artificial intelligence models and external processing providers (including Groq for Whisper transcription and OpenRouter for language models). You acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li>AI-generated text (titles, hooks, captions, summaries, transcripts) is inherently probabilistic and may contain inaccuracies, omissions, or stylistic variations.</li>
              <li>You remain solely responsible for reviewing, verifying, and editing all AI-generated drafts prior to public dissemination or commercial use.</li>
              <li>Vireo does not warrant that AI-generated clips or text will achieve specific audience engagement, reach, or monetization targets.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">4. User Content and Intellectual Property Rights</h2>
            <p>
              <strong>Your Content:</strong> You retain full copyright, ownership, and intellectual property rights in and to all videos, audio files, images, branding assets, and text you upload or submit to Vireo ("User Content").
            </p>
            <p className="mt-2">
              <strong>Limited Processing License:</strong> You grant Vireo a limited, worldwide, non-exclusive, royalty-free license solely to transcode, encode, temporarily cache, transcribe, generate derivations of, and store your User Content to the extent strictly necessary to operate, maintain, and deliver the Service to you.
            </p>
            <p className="mt-2">
              <strong>Prohibited Content and Conduct:</strong> You represent and warrant that your User Content does not and will not:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li>Infringe any copyright, trademark, trade secret, or privacy right of any third party.</li>
              <li>Violate applicable export laws, criminal statutes, or platform community guidelines.</li>
              <li>Contain malicious software, viruses, corrupted files, or automated harvesting scripts.</li>
              <li>Involve unlawful defamation, hate speech, harassment, or unauthorized biometric exploitation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">5. Third-Party Integrations and Social Publishing</h2>
            <p>
              Vireo enables users to connect external third-party social media accounts (including YouTube / Google, Meta / Instagram, TikTok, LinkedIn, and X) using OAuth 2.0.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li>Tokens are encrypted at rest using AES-256-GCM.</li>
              <li>Publishing actions dispatched through Vireo are subject to the respective terms and developer policies of each platform (e.g., YouTube Terms of Service, Meta Platform Terms, TikTok Developer Terms).</li>
              <li>You are responsible for maintaining compliance with each third-party network's policies and content guidelines. You may disconnect connected channels at any time via your account settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">6. Subscriptions, Processing Quotas, and Billing Status</h2>
            <p>
              Vireo structures service usage around monthly processing minutes and workspace member entitlements across plan tiers:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li><strong>Free Plan:</strong> 15 video processing minutes per calendar month, 1 workspace seat, standard transcription and platform kits.</li>
              <li><strong>Creator Plan:</strong> 120 processing minutes per month ($12/mo or $120/yr; ₹999/mo via Razorpay), 1 seat, 1080p exports, brand voice presets.</li>
              <li><strong>Pro Plan:</strong> 360 processing minutes per month ($24/mo or $240/yr; ₹1,999/mo via Razorpay), up to 3 workspace seats, custom watermarks, priority rendering.</li>
              <li><strong>Studio Plan:</strong> 900 processing minutes per month ($49/mo or $490/yr; ₹3,999/mo via Razorpay), up to 10 workspace seats, dedicated compute queue.</li>
            </ul>
            <p className="mt-2">
              <strong>Pre-Launch Billing Status Notice:</strong> Live paid checkout is undergoing payment gateway sandbox verification. Paid subscriptions are not currently actively charged to public consumer cards. Once live checkout is commercially activated:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li>Fees will be billed in advance on a recurring monthly or annual basis via authorized processors (Paddle, Razorpay, or Stripe).</li>
              <li>Usage quotas reset on the first day of each calendar month (UTC). Unused processing minutes do not roll over.</li>
              <li>Cancellations will take effect at the conclusion of the active prepaid billing cycle.</li>
              <li>Refund policy terms: <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">[CONFIRMATION REQUIRED: Refund policy terms, e.g. 14-day statutory EU right of withdrawal vs non-refundable consumed quotas]</span>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">7. Disclaimers and Limitations of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, VIREO IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="mt-2">
              IN NO EVENT SHALL VIREO, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">8. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms and any dispute arising from or related to the Service shall be governed by and construed in accordance with the laws of <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">[CONFIRMATION REQUIRED: Governing Jurisdiction, State/Country]</span>, without regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#183d2d] mb-3">9. Contact and Notices</h2>
            <p>
              Questions, notices, or inquiries regarding these Terms should be directed to:
            </p>
            <p className="mt-1 font-mono text-xs text-[#36764c]">
              <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">[CONFIRMATION REQUIRED: Designated Support / Legal Email Address, e.g., legal@vireo.app]</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
