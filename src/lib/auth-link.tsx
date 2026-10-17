import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';

import { USING_LOCAL } from '@/data/backend';
import { supabase } from './supabase';

/**
 * The sign-up confirmation link, arriving back in the app.
 *
 * Supabase confirms the address on its own server, then redirects to
 * corridor:// with the new session in the fragment:
 *   corridor:///#access_token=...&refresh_token=...&type=signup
 * Handing those to setSession signs the person in, and the session provider
 * hears about it like any other sign in. A link that failed (used, expired)
 * carries error= instead and is ignored: they land on sign in as usual.
 *
 * Done by hand rather than detectSessionInUrl, which only works on the web.
 */
export function AuthLink() {
  const url = Linking.useURL();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (USING_LOCAL || !url || handled.current === url) return;
    const hash = url.indexOf('#');
    if (hash < 0) return;
    const params = new URLSearchParams(url.slice(hash + 1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return;
    handled.current = url;
    supabase.auth.setSession({ access_token, refresh_token }).catch(() => {
      // A bad or stale token: nothing to do but let them sign in by hand.
    });
  }, [url]);

  return null;
}
