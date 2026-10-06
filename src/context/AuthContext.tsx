import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { backendRequest } from '../services/backendClient';
import { projectService } from '../services/projectService';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
}

export interface CreatorProfileData {
  id?: string;
  user_id: string;
  brand_name?: string;
  niche: string;
  target_audience: string;
  brand_description?: string;
  language: string;
  tone: string;
  custom_tone?: string;
  content_goals?: string;
  website_url?: string;
  newsletter_url?: string;
  podcast_url?: string;
  youtube_cta?: string;
  instagram_cta?: string;
  linkedin_cta?: string;
  twitter_cta?: string;
  tiktok_cta?: string;
  preferred_hook_style?: string;
  brand_rules?: string;
  forbidden_phrases?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  creatorProfile: CreatorProfileData | null;
  loading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | Error | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async (userId: string, userEmail: string, token?: string) => {
    if (!isSupabaseConfigured) {
      // Local fallback profile
      setProfile({
        id: userId,
        email: userEmail,
        full_name: userEmail.split('@')[0] || 'Creator',
      });
      setCreatorProfile({
        user_id: userId,
        niche: 'Tech & SaaS',
        target_audience: 'Founders & Builders',
        language: 'English',
        tone: 'Friendly',
      });
      return;
    }

    try {
      const data = await backendRequest<{ profile: UserProfile; creatorProfile: CreatorProfileData }>('/profiles/me', {}, token);
      setProfile(data.profile);
      setCreatorProfile(data.creatorProfile);
    } catch (err) {
      console.error('Error fetching user profiles:', err);
      setProfile({ id: userId, email: userEmail, full_name: userEmail.split('@')[0] || 'Creator' });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfiles(user.id, user.email || '');
    }
  }, [user, fetchProfiles]);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!isSupabaseConfigured) {
        // If Supabase credentials are not yet configured in .env.local,
        // check if user previously signed in via local storage demo session
        const storedDemo = localStorage.getItem('vireo_demo_user');
        if (storedDemo) {
          try {
            const parsed = JSON.parse(storedDemo);
            if (mounted) {
              setUser(parsed);
              setSession({ access_token: 'demo-token', user: parsed } as unknown as Session);
              await fetchProfiles(parsed.id, parsed.email);
            }
          } catch {
            localStorage.removeItem('vireo_demo_user');
          }
        }
        if (mounted) setLoading(false);
        return;
      }

      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          if (initialSession?.user) {
            await fetchProfiles(initialSession.user.id, initialSession.user.email || '', initialSession.access_token);
          }
        }
      } catch (err) {
        console.error('[Supabase Auth] Failed to restore session:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    // The local development session has no Supabase auth events. A placeholder
    // client's INITIAL_SESSION event would otherwise clear it after refresh.
    if (!isSupabaseConfigured) {
      return () => { mounted = false; };
    }

    // Setup real-time auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await fetchProfiles(newSession.user.id, newSession.user.email || '', newSession.access_token);
      } else {
        setProfile(null);
        setCreatorProfile(null);
        projectService.clear();
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfiles]);

  const signUp = async (email: string, password: string, fullName?: string) => {
    if (!isSupabaseConfigured) {
      // Local fallback for unconfigured environment
      const mockUser = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        email,
        user_metadata: { full_name: fullName || email.split('@')[0] },
      } as unknown as User;
      localStorage.setItem('vireo_demo_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setSession({ access_token: 'demo-token', user: mockUser } as unknown as Session);
      await fetchProfiles(mockUser.id, email);
      return { error: null };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || '',
          },
        },
      });

      if (error) return { error };

      if (data.user) {
        // Safely ensure profile records exist
        await fetchProfiles(data.user.id, email, data.session?.access_token);
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      const mockUser = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        email,
        user_metadata: { full_name: email.split('@')[0] },
      } as unknown as User;
      localStorage.setItem('vireo_demo_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setSession({ access_token: 'demo-token', user: mockUser } as unknown as Session);
      await fetchProfiles(mockUser.id, email);
      return { error: null };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };

      if (data.user) {
        await fetchProfiles(data.user.id, email, data.session?.access_token);
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('vireo_demo_user');
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('SignOut error:', err);
      }
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setCreatorProfile(null);
    projectService.clear();
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    creatorProfile,
    loading,
    isAuthenticated: Boolean(user),
    isConfigured: isSupabaseConfigured,
    signUp,
    signInWithPassword,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
