import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Logo } from '../components/Logo';
export const NotFoundPage: React.FC = () => <div className="flex min-h-[65vh] items-center justify-center px-4 py-16"><div className="max-w-lg rounded-3xl border border-border bg-white p-10 text-center shadow-soft"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#eaf3eb] text-vireo-green"><Compass className="size-8" /></div><div className="mt-5 flex justify-center"><Logo compact /></div><p className="mt-4 text-xs font-bold uppercase tracking-widest text-clay">404</p><h1 className="mt-2 font-display text-4xl font-semibold">Page not found.</h1><p className="mt-3 text-sm text-muted-foreground">The page you’re looking for has moved or does not exist.</p><Link to="/" className="mt-7 inline-block rounded-xl bg-clay px-5 py-3 text-sm font-semibold text-white">Go Home</Link></div></div>;
