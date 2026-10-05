import { supabase } from '../lib/supabase';

export const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function authToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in again.');
  return session.access_token;
}

export async function backendRequest<T>(path: string, options: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const token = tokenOverride || await authToken();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status}).`) as Error & { code?: string; status?: number };
    error.code = data.code || data.error_code;
    error.status = response.status;
    Object.assign(error, data);
    throw error;
  }
  return data as T;
}
