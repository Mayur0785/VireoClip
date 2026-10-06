import { supabase } from '../lib/supabase';

export const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function authToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in again.');

  // Check if access token is expired or expiring within 60 seconds
  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - nowInSeconds < 60) {
    try {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed?.session?.access_token) {
        return refreshed.session.access_token;
      }
    } catch {
      // Fall back to existing token if network refresh fails
    }
  }

  return session.access_token;
}

export async function backendRequest<T>(path: string, options: RequestInit = {}, tokenOverride?: string): Promise<T> {
  let token = tokenOverride || await authToken();

  const makeFetch = async (bearerToken: string) => {
    return fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  };

  let response = await makeFetch(token);

  // If unauthorized and using automatic auth token, try refreshing session once and retry
  if (response.status === 401 && !tokenOverride) {
    try {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed?.session?.access_token) {
        token = refreshed.session.access_token;
        response = await makeFetch(token);
      }
    } catch {
      // Let standard error handling handle original response
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status}).`) as Error & { code?: string; status?: number; retryAfter?: number };
    error.code = data.code || data.error_code;
    error.status = response.status;
    const retryHeader = response.headers.get('retry-after');
    if (retryHeader) {
      error.retryAfter = parseInt(retryHeader, 10);
    }
    Object.assign(error, data);
    throw error;
  }
  return data as T;
}
