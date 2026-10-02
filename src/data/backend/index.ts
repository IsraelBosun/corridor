import { isConfigured } from '@/lib/supabase';
import { localBackend } from './local';
import { supabaseBackend } from './supabase';
import type { Backend } from './types';

/**
 * Which backend this build talks to.
 *
 * EXPO_PUBLIC_BACKEND=local keeps everything on the phone, with test accounts
 * you make in the app. Anything else, or nothing, is the hosted Supabase
 * project. Metro inlines the value at build time, so changing it needs
 * npx expo start --clear.
 */
export const USING_LOCAL = process.env.EXPO_PUBLIC_BACKEND === 'local';

export const backend: Backend = USING_LOCAL ? localBackend : supabaseBackend;

/** Local mode needs no keys. Supabase mode needs both. */
export const backendReady = USING_LOCAL || isConfigured;

export type * from './types';
