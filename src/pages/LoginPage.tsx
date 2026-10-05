import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleIcon } from '../components/GoogleIcon';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { signInWithPassword, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setBusy(true);

    try {
      const { error } = await signInWithPassword(email.trim(), password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Invalid email or password. Please check your credentials.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMessage('Please confirm your email address before signing in.');
        } else {
          setErrorMessage(error.message || 'Failed to sign in. Please try again.');
        }
        setBusy(false);
        return;
      }

      navigate('/dashboard');
    } catch (err) {
      setErrorMessage((err as Error).message || 'An unexpected error occurred.');
      setBusy(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setErrorMessage(null);
    if (!isConfigured) {
      setInfoMessage('Google sign-in requires VITE_SUPABASE_URL and Google OAuth provider enabled in the Supabase Dashboard.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/dashboard',
        },
      });
      if (error) {
        setErrorMessage('Google sign-in failed. Please verify Google OAuth configuration in Supabase Dashboard.');
      }
    } catch {
      setErrorMessage('Could not initiate Google authentication.');
    }
  };

  return <AuthLayout title="Welcome back">
    {errorMessage && <p role="alert" className="mt-6 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p>}
    {infoMessage && <p role="status" className="mt-6 rounded-xl bg-[#e8f3e9] p-3 text-sm text-forest">{infoMessage}</p>}
    <Button type="button" variant="outline" className="mt-8 h-12 w-full" onClick={handleGoogleOAuth}><GoogleIcon />Continue with Google</Button>
    <div className="my-6 flex items-center gap-4 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" />or continue with email<span className="h-px flex-1 bg-border" /></div>
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input label="Email address" type="email" required autoComplete="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} />
      <div className="relative"><Input label="Password" type={showPassword?'text':'password'} required minLength={6} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} /><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'} className="absolute bottom-2 right-2 rounded-lg p-2 text-muted-foreground">{showPassword?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button></div>
      <Button type="submit" variant="clay" size="lg" className="w-full" disabled={busy}>{busy?'Signing in…':'Sign in'}</Button>
    </form>
    <p className="mt-6 text-center text-sm text-muted-foreground">New to Vireo? <Link to="/signup" className="font-semibold text-clay hover:underline">Create an account</Link></p>
  </AuthLayout>;
};
