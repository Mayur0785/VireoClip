import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap, TrendingUp, Users, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';
import { platformOutputs } from '../data/platforms';

export function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen bg-[#fbf8f3] p-4 sm:p-7">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1440px] overflow-hidden rounded-[28px] border border-[#efe8df] bg-[#fffdf9] shadow-soft lg:grid-cols-[1.1fr_.9fr]">
        {/* Left Side: Brand Showcase */}
        <section className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-16">
          <Logo />

          <div className="relative z-10 mt-6 space-y-6">
            <span className="inline-block rounded-full bg-[#fff0e9] border border-clay/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-clay font-mono">
              AI Video Creation for Creators
            </span>

            <h1 className="max-w-xl font-display text-[clamp(2.8rem,3.8vw,4.5rem)] font-semibold leading-[1.08] tracking-[-.04em] text-foreground">
              Turn Your Ideas Into <span className="text-clay">Scroll-Stopping Videos</span>
            </h1>

            <p className="max-w-lg text-base text-muted-foreground leading-relaxed">
              Vireo helps you create professional, platform-ready videos with AI. Go from an idea to a fully edited video in minutes — no filming, no editing skills, no complicated tools.
            </p>

            {/* 3 Benefit Items */}
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3.5">
                <span className="grid size-10 place-items-center rounded-2xl bg-[#fff0e9] text-clay shrink-0">
                  <Zap className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground font-display">Create faster</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Turn ideas into polished videos in minutes.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <span className="grid size-10 place-items-center rounded-2xl bg-[#eaf3eb] text-vireo-green shrink-0">
                  <TrendingUp className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground font-display">Grow your audience</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Optimized for every platform.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <span className="grid size-10 place-items-center rounded-2xl bg-[#fef4eb] text-clay shrink-0">
                  <Users className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground font-display">Built for creators</p>
                  <p className="text-xs text-muted-foreground mt-0.5">From solo creators to growing teams.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Card Preview */}
          <div className="relative z-10 mt-6 rounded-2xl border border-border bg-white p-4 shadow-lift max-w-md">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <Logo compact />
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                Repurpose Everywhere
              </span>
            </div>
            <div className="mt-3 grid grid-cols-6 gap-2 text-center text-[10px] font-semibold">
              {platformOutputs.map((platform) => (
                <span key={platform.name} className="rounded-lg border border-border/80 p-2 bg-[#fbf8f3]/60 flex flex-col items-center justify-center">
                  <img src={platform.logo} alt="" className="size-4 object-contain mb-1" />
                  <span className="truncate w-full text-[9px] text-muted-foreground">{platform.name.split(' ')[0]}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="absolute -bottom-36 -left-20 size-80 rounded-full border-[70px] border-[#fae9df]/60 pointer-events-none" />
        </section>

        {/* Right Side: Auth Form Container */}
        <div className="flex min-w-0 items-center justify-center bg-white/80 px-5 py-10 sm:px-10 xl:px-16">
          <div className="w-full max-w-[440px]">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Logo />
              <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Home <ArrowRight className="inline size-4 ml-0.5" />
              </Link>
            </div>

            <div className="mb-6 hidden justify-center lg:flex">
              <Logo />
            </div>

            <h2 className="text-center font-display text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed">
              {subtitle || 'Sign in to your account and keep creating amazing videos with Vireo.'}
            </p>

            {children}

            {/* Bottom Security Note */}
            <div className="mt-8 flex items-center justify-center gap-3 border-t border-border/70 pt-6">
              <div className="grid size-8 place-items-center rounded-full bg-[#eaf3eb] text-vireo-green shrink-0">
                <ShieldCheck className="size-4" />
              </div>
              <div className="text-left text-xs">
                <p className="font-semibold text-foreground">Your data is secure</p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  We use industry-standard encryption to keep your information safe and private.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
