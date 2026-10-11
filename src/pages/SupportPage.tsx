import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  Clock,
  Globe2,
  Cpu,
  CreditCard,
  UserCheck,
  Check,
  Copy,
  ExternalLink,
  HelpCircle,
  FileText,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

const SUPPORT_EMAIL = 'vertexdigitals07@gmail.com';

export const SupportPage: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is unavailable
      const textArea = document.createElement('textarea');
      textArea.value = SUPPORT_EMAIL;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const supportCategories = [
    {
      icon: Cpu,
      title: 'Technical Support',
      subject: 'VireoClip Technical Support',
      description:
        'Assistance with video file uploads (MP4, MOV, WebM, AVI, MKV up to 2 GB), AI clip generation, transcript generation, timeline editing, automated framing, and clip exports.',
      details: [
        'Upload stalls or file format questions',
        'AI transcription & moment detection',
        'Clip rendering & aspect ratio export',
      ],
      accentColor: 'from-emerald-500/20 to-teal-500/10',
      borderColor: 'border-emerald-500/30',
      iconColor: 'text-[#20E3A2]',
    },
    {
      icon: CreditCard,
      title: 'Billing & Subscriptions',
      subject: 'VireoClip Billing Support',
      description:
        'Assistance with plan tiers (Free 15-minute tier, Creator, Pro, Studio), processing quotas, currency billing options (USD & INR), and commercial release verification.',
      details: [
        'Processing minute balances & tier features',
        'USD / INR pricing display questions',
        'Billing status & gateway verification',
      ],
      accentColor: 'from-purple-500/20 to-indigo-500/10',
      borderColor: 'border-purple-500/30',
      iconColor: 'text-purple-400',
    },
    {
      icon: UserCheck,
      title: 'Account & Login',
      subject: 'VireoClip Account Support',
      description:
        'Help with account credentials, sign-in authentication, password resets, demo account sessions, workspace history, and project data management.',
      details: [
        'Authentication and login issues',
        'Account profile & session settings',
        'Project workspace history & recovery',
      ],
      accentColor: 'from-cyan-500/20 to-blue-500/10',
      borderColor: 'border-cyan-500/30',
      iconColor: 'text-cyan-400',
    },
  ];

  return (
    <div className="min-h-screen bg-[#060B12] text-[#F4F6FC] selection:bg-[#20E3A2]/20 selection:text-[#20E3A2]">
      {/* Background Decorative Gradient Atmosphere */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-[#20E3A2]/10 via-[#9870FF]/10 to-transparent blur-3xl opacity-70" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-purple-900/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-12 pb-24">
        {/* Header Eyebrow & Main Title */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono font-bold tracking-widest uppercase text-[#20E3A2]">
            <span>Official Support</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#20E3A2] animate-pulse" />
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white font-sans">
            How can we <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#20E3A2] to-[#56D9E8]">help?</span>
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 leading-relaxed font-sans">
            Support for <strong className="text-zinc-200 font-semibold">VireoClip by Vertex Digitals</strong>. We provide direct email support for video repurposing workflows, subscription questions, and account access across India and worldwide.
          </p>

          {/* SLA & Service Scope Metrics Bar */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs text-zinc-400">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <Clock className="size-4 text-[#20E3A2]" />
              <span>Response target: <strong className="text-zinc-200">24–48 hours</strong></span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <Globe2 className="size-4 text-[#56D9E8]" />
              <span>Service region: <strong className="text-zinc-200">India & Worldwide</strong></span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <Mail className="size-4 text-purple-400" />
              <span>Channel: <strong className="text-zinc-200">Email only</strong></span>
            </div>
          </div>
        </div>

        {/* Primary Contact Action Card */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-gradient-to-b from-[#111724] to-[#0A0F1A] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#20E3A2]/5 blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#20E3A2]">
                <Mail className="size-4" />
                <span>Primary Support Channel</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Contact our support team directly
              </h2>
              <p className="text-sm text-zinc-400 max-w-xl">
                Please write to our designated support inbox. To help us resolve your request quickly, include your registered account email, relevant project title or ID, and a clear summary of your request.
              </p>
              <div className="pt-1">
                <span className="font-mono text-base sm:text-lg text-white font-semibold select-all bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 inline-block">
                  {SUPPORT_EMAIL}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
              <button
                type="button"
                onClick={handleCopyEmail}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-white font-semibold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
                aria-label="Copy official support email address"
              >
                {copied ? (
                  <>
                    <Check className="size-4 text-[#20E3A2]" />
                    <span className="text-[#20E3A2]">Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4 text-zinc-400" />
                    <span>Copy Email</span>
                  </>
                )}
              </button>

              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=VireoClip%20Support%20Request`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#20E3A2] to-[#56D9E8] hover:brightness-105 text-[#060B12] font-bold text-sm shadow-lg shadow-[#20E3A2]/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
              >
                <Mail className="size-4" />
                <span>Send Email</span>
                <ExternalLink className="size-3.5 opacity-70" />
              </a>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-white/[0.06] flex items-center gap-2 text-xs text-zinc-500">
            <AlertCircle className="size-3.5 shrink-0 text-zinc-400" />
            <span>
              Direct email is our only official support channel. We do not offer support via telephone, WhatsApp, or unsolicited third-party chat.
            </span>
          </div>
        </div>

        {/* 3 Core Support Categories */}
        <div className="mt-14">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Select a Support Topic
            </h2>
            <p className="text-sm text-zinc-400 mt-2">
              Choose the topic that best matches your question for pre-filled email routing:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {supportCategories.map((category) => {
              const Icon = category.icon;
              return (
                <div
                  key={category.title}
                  className={`rounded-2xl border ${category.borderColor} bg-gradient-to-b ${category.accentColor} p-6 flex flex-col justify-between hover:border-white/20 transition-all shadow-lg backdrop-blur-sm`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-xl bg-black/40 border border-white/10 ${category.iconColor}`}>
                        <Icon className="size-6" />
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/5">
                        24–48h SLA
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-white">{category.title}</h3>
                    <p className="text-xs leading-relaxed text-zinc-300">{category.description}</p>

                    <ul className="space-y-2 pt-2 border-t border-white/[0.06]">
                      {category.details.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs text-zinc-400">
                          <Check className="size-3.5 text-[#20E3A2] shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-6 mt-4">
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(category.subject)}`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
                    >
                      <Mail className="size-3.5" />
                      <span>Email {category.title}</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Self-Serve Documentation & Policies */}
        <div className="mt-16 rounded-2xl border border-white/10 bg-[#0B101D] p-6 sm:p-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Self-Serve Help & Policies
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Find instant answers to common questions or review our verified terms and data protection policies:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to="/#faq"
              className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20E3A2]"
            >
              <HelpCircle className="size-5 text-[#20E3A2] shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
              <div>
                <h3 className="text-sm font-semibold text-white group-hover:text-[#20E3A2] transition-colors">
                  Frequently Asked Questions
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Answers to file formats, direct upload limits (up to 2 GB), duration (2 hours), and output platforms.
                </p>
              </div>
            </Link>

            <Link
              to="/terms"
              className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              <FileText className="size-5 text-purple-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
              <div>
                <h3 className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">
                  Terms of Service
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Read our verified user agreement, acceptable use guidelines, and platform service terms.
                </p>
              </div>
            </Link>

            <Link
              to="/privacy"
              className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <ShieldCheck className="size-5 text-cyan-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
              <div>
                <h3 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  Privacy Policy
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Details on private Cloudflare R2 storage, AES-256 token security, and strict data privacy.
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Business Attribution Notice */}
        <div className="mt-12 text-center text-xs text-zinc-500">
          <p>
            VireoClip is developed and operated by <strong className="text-zinc-400 font-semibold">Vertex Digitals</strong>.
          </p>
          <p className="mt-1">
            Online support service only • Physical walk-in offices are not maintained for customer support inquiries.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
