import type { Backend } from './types';

/**
 * The local test backend, on web. It is SQLite, and expo-sqlite's web worker
 * does not bundle here, so on web it is left out entirely and the web build
 * always talks to Supabase. Metro picks this file over local.ts for web only.
 */
export const localBackend: Backend = new Proxy({ kind: 'local' } as Backend, {
  get(target, key) {
    if (key in target) return target[key as keyof Backend];
    return () => {
      throw new Error('Local test mode runs on phones only. Use the Supabase backend on web.');
    };
  },
});
