/** Keep a pending landing-page creation URL through login or signup. */
export function landingReturnPath(search: string, from?: { pathname?: string; search?: string }): string {
  const next = new URLSearchParams(search).get('next') || `${from?.pathname || ''}${from?.search || ''}`;
  return next === '/projects/new' || next.startsWith('/projects/new?') ? next : '/dashboard';
}

export function authPathWithReturn(base: '/login' | '/signup', destination: string): string {
  return destination === '/dashboard' ? base : `${base}?next=${encodeURIComponent(destination)}`;
}
