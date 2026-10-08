import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleIcon } from '../components/GoogleIcon';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { authPathWithReturn, landingReturnPath } from '../lib/landingReturnPath';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = landingReturnPath(location.search);
  const { signUp, isConfigured } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setBusy(true);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      setBusy(false);
      return;
    }
    if (!agreed) {
      setErrorMessage('Please agree to the account terms.');
      setBusy(false);
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      setBusy(false);
      return;
    }

    try {
      const { error } = await signUp(email.trim(), password, name.trim());
      if (error) {
        if (error.message.includes('User already registered') || error.message.includes('already exists')) {
          setErrorMessage('An account with this email already exists. Please sign in instead.');
        } else if (error.message.includes('Password should be')) {
          setErrorMessage('Password is too weak. Please use at least 6 characters.');
        } else {
          setErrorMessage(error.message || 'Failed to create account. Please try again.');
        }
        setBusy(false);
        return;
      }

      navigate(destination);
    } catch (err) {
      setErrorMessage((err as Error).message || 'An unexpected error occurred.');
      setBusy(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setErrorMessage(null);
    if (!isConfigured) {
      setInfoMessage('Google sign-up requires VITE_SUPABASE_URL and Google OAuth provider enabled in the Supabase Dashboard.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + destination,
        },
      });
      if (error) {
        setErrorMessage('Google sign-up failed. Please verify Google OAuth configuration in Supabase Dashboard.');
      }
    } catch {
      setErrorMessage('Could not initiate Google authentication.');
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start turning your videos into engaging content across all platforms."
    >
      {errorMessage && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {infoMessage && (
        <p role="status" className="mt-6 rounded-xl bg-[#e8f3e9] p-3 text-sm text-vireo-green">
          {infoMessage}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="mt-6 h-12 w-full gap-2.5 font-medium border-border/80 hover:bg-cream"
        onClick={handleGoogleOAuth}
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </Button>

      <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-wider text-muted-foreground font-mono">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Full name"
          type="text"
          required
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Email address"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute bottom-2 right-2 rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        <Input
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <label className="flex items-start gap-3 text-xs text-muted-foreground cursor-pointer pt-1">
          <input
            className="mt-0.5 accent-clay size-4 rounded"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>I agree to create a Vireo account and receive service messages related to it.</span>
        </label>

        <Button
          type="submit"
          variant="clay"
          size="lg"
          className="w-full gap-2 shadow-clay mt-2"
          disabled={busy}
        >
          <span>{busy ? 'Creating account…' : 'Create Account'}</span>
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={authPathWithReturn('/login', destination)} className="font-semibold text-clay hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};
