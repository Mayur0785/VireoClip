import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, FileText } from 'lucide-react';
import { Logo } from './Logo';
import { platformOutputs } from '../data/platforms';

export function AuthLayout({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="min-h-screen bg-[#fbf8f3] p-4 sm:p-7">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1440px] overflow-hidden rounded-[28px] border border-[#efe8df] bg-[#fffdf9] shadow-soft lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-16">
          <Logo />
          <div className="relative z-10 mt-7">
            <span className="rounded-full bg-[#fff0e9] px-4 py-2 text-xs font-bold uppercase tracking-widest text-clay">
              Upload once. Repurpose everywhere.
            </span>
            <h1 className="mt-4 max-w-xl font-display text-[clamp(3.2rem,4vw,5rem)] font-semibold leading-[1.08] tracking-[-.05em]">
              Turn one video into <span className="text-clay">content that travels.</span>
            </h1>
            <p className="mt-3 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Vireo turns your existing video into a transcript and useful drafts for every channel.
            </p>
            <div className="mt-5 grid gap-4">
              {['Capture every important idea', 'Create drafts for six platforms', 'Edit and copy when you are ready'].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium">
                  <span className="grid size-8 place-items-center rounded-full bg-[#e4f0e5] text-vireo-green">
                    <Check className="size-4" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10 mt-6 rounded-2xl border border-border bg-white p-5 shadow-lift">
            <div className="flex items-center justify-between">
              <Logo compact />
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Product preview</span>
            </div>
            <div className="mt-3 rounded-xl bg-[#eef5ee] p-4">
              <p className="text-xs font-bold text-vireo-green">Your content kit</p>
              <h3 className="mt-2 text-xl font-semibold text-forest">One recording. More to share.</h3>
              <p className="mt-2 text-xs text-muted-foreground">Transcript and editable drafts for six platforms.</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold">
              {platformOutputs.map((platform) => (
                <span key={platform.name} className="rounded-lg border border-border p-2.5">
                  <img src={platform.logo} alt="" className="mx-auto mb-1.5 size-5 object-contain" />
                  {platform.name}
                </span>
              ))}
            </div>
          </div>
          <div className="absolute -bottom-36 -left-20 size-80 rounded-full border-[70px] border-[#fae9df]" />
        </section>
        <div className="flex min-w-0 items-center justify-center bg-white/75 px-5 py-10 sm:px-10 xl:px-16">
          <div className="w-full max-w-[470px]">
            <div className="mb-9 flex items-center justify-between lg:hidden">
              <Logo />
              <Link to="/" className="text-sm font-medium text-muted-foreground">
                Home <ArrowRight className="inline size-4" />
              </Link>
            </div>
            <div className="mb-8 hidden justify-center lg:flex"><Logo /></div>
            <h2 className="text-center font-display text-4xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-3 text-center text-base text-muted-foreground">
              Continue creating from the videos you have already made.
            </p>
            {children}
            <div className="mt-8 flex items-center justify-center gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
              <FileText className="size-4 text-vireo-green" />
              Your projects stay connected to your account.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
