import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { backend, type AuthSession, type Membership, type ProfileRow } from './backend';
import type { DropOff, Person, Role } from './types';
import { forgetPush } from '@/lib/push';

/**
 * Who is signed in, and are they one of us.
 *
 * Two separate facts. The login is a personal email and password, the same
 * account the project's other apps use. Membership is a work email on an
 * allowed domain, proven by a code sent to it and good for 60 days. Leaving a
 * job ends the membership, never the account.
 *
 * Rule 4 is checked in three places on purpose. Here, so the person is sent to
 * the right screen with a useful message. In a trigger on corridor.profiles,
 * so a non-member cannot get a profile and therefore cannot post, reserve or
 * see anything. In every RLS policy, so a bug in this file cannot leak a row.
 * All three ask corridor.is_member().
 *
 * Everything here goes through the backend, so the same code runs against the
 * hosted project or the local test database.
 */

type Result = { ok: true } | { ok: false; error: string };

type SessionState = {
  /** True until the stored session has been read back. */
  loading: boolean;
  session: AuthSession | null;
  email: string | null;
  /** Null when signed in but the profile row has not been written yet. */
  me: Person | null;

  /** Null until it has been read; check `member` for the answer. */
  membership: Membership | null;
  /** A verified, unexpired work email on an allowed domain. */
  member: boolean;
  /** May switch riding and driving with a live ride or seat. */
  tester: boolean;

  /** Personal email and password. */
  signIn: (email: string, password: string) => Promise<Result>;
  /** A new account. needsConfirm: check the inbox, then sign in. */
  signUp: (email: string, password: string) => Promise<Result & { needsConfirm?: boolean }>;
  /** Mails a code for a forgotten password. */
  sendPasswordReset: (email: string) => Promise<Result>;
  /** The code and a new password. On success they are signed in. */
  resetPassword: (email: string, code: string, password: string) => Promise<Result>;
  /** The part before the @; the allowed domain is added here. */
  sendWorkCode: (email: string) => Promise<Result>;
  verifyWorkCode: (code: string) => Promise<Result>;
  forgetWorkEmail: () => Promise<Result>;
  /** Deletes the Corridor account, then signs out. */
  deleteAccount: () => Promise<Result>;
  saveProfile: (draft: ProfileDraft) => Promise<Result>;
  /**
   * Switching between driving and riding. Refused while tonight already ties
   * you to the other one: a posted ride, or a seat you are holding.
   */
  setRole: (role: Role) => Promise<Result>;
  /** Where you get off, set later and changed as often as you like. */
  setDropOff: (place: DropOff | null) => Promise<Result>;
  /** How to spot your car. Empty clears it. */
  setCar: (car: string) => Promise<Result>;
  signOut: () => Promise<void>;
  /**
   * Why the profile could not be read, when that is what happened.
   *
   * Without this a failed read is indistinguishable from a new account, so a
   * person with a perfectly good profile gets sent back to sign up and told
   * nothing.
   */
  profileError: string | null;
};

/** Sign up asks for a name and whether you drive. Nothing else. */
export type ProfileDraft = {
  name: string;
  initials: string;
  role: Role;
};

const Ctx = createContext<SessionState | null>(null);

export function toPerson(row: ProfileRow): Person {
  return {
    id: row.id,
    handle: row.handle,
    initials: row.initials,
    name: row.display_name,
    team: row.team ?? '',
    floor: row.floor ?? '',
    dropOff: row.drop_off_name
      ? {
          landmarkId: row.drop_off_id ?? undefined,
          name: row.drop_off_name,
          lat: row.drop_off_lat ?? undefined,
          lng: row.drop_off_lng ?? undefined,
        }
      : undefined,
    role: row.role,
    car: row.car ?? undefined,
  };
}

function message(e: unknown): string {
  return readable(e instanceof Error ? e.message : String(e));
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [tester, setTester] = useState(false);

  const loadMembership = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([backend.membership(), backend.isTester()]);
      setMembership(m);
      setTester(t);
    } catch {
      // Unreadable counts as not a member: the work email screen can always
      // be passed again, a wrongly open door cannot be closed after the fact.
      setMembership({ workEmail: null, verifiedAt: null, expiresAt: null, member: false });
    }
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    // A read that fails and a person who has never signed up look identical
    // from here: both give no row. The reason is kept rather than thrown away.
    try {
      const row = await backend.getProfile(userId);
      setProfileError(null);
      setMe(row ? toPerson(row) : null);
    } catch (e) {
      setProfileError(message(e));
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    backend.getSession().then(async (s) => {
      if (!alive) return;
      setSession(s);
      if (s) await Promise.all([loadMembership(), loadProfile(s.userId)]);
      setLoading(false);
    });

    const unsubscribe = backend.onAuthChange((next) => {
      setSession(next);
      if (next) {
        loadMembership();
        loadProfile(next.userId);
      } else {
        setMe(null);
        setMembership(null);
        setTester(false);
      }
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [loadProfile, loadMembership]);

  const signIn = useCallback(async (email: string, password: string): Promise<Result> => {
    try {
      await backend.signIn(email.trim().toLowerCase(), password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { needsConfirm } = await backend.signUp(email.trim().toLowerCase(), password);
      return { ok: true as const, needsConfirm };
    } catch (e) {
      return { ok: false as const, error: message(e) };
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<Result> => {
    try {
      await backend.sendPasswordReset(email.trim().toLowerCase());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, password: string): Promise<Result> => {
      try {
        await backend.resetPassword(email.trim().toLowerCase(), code.trim(), password);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: message(e) };
      }
    },
    []
  );

  const sendWorkCode = useCallback(async (email: string): Promise<Result> => {
    const address = email.trim().toLowerCase();
    try {
      await backend.sendWorkCode(address);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }, []);

  const verifyWorkCode = useCallback(
    async (code: string): Promise<Result> => {
      try {
        await backend.verifyWorkCode(code.trim());
        // Membership first: the profile is only readable once it is true.
        await loadMembership();
        if (session) await loadProfile(session.userId);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: message(e) };
      }
    },
    [session, loadMembership, loadProfile]
  );

  const forgetWorkEmail = useCallback(async (): Promise<Result> => {
    try {
      await backend.forgetWorkEmail();
      await loadMembership();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }, [loadMembership]);

  const saveProfile = useCallback(
    async (draft: ProfileDraft): Promise<Result> => {
      if (!session) return { ok: false, error: 'You are not signed in.' };
      try {
        await backend.saveProfile({
          id: session.userId,
          // The work handle when there is one; the login email is personal.
          handle: (membership?.workEmail ?? session.email).split('@')[0],
          initials: draft.initials,
          display_name: draft.name,
          role: draft.role,
        });
        await loadProfile(session.userId);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: message(e) };
      }
    },
    [session, loadProfile, membership]
  );

  const update = useCallback(
    async (patch: Parameters<typeof backend.updateProfile>[1]): Promise<Result> => {
      if (!session) return { ok: false, error: 'You are not signed in.' };
      try {
        await backend.updateProfile(session.userId, patch);
        await loadProfile(session.userId);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: message(e) };
      }
    },
    [session, loadProfile]
  );

  const setRole = useCallback((role: Role) => update({ role }), [update]);

  // landmarkId stays null for a searched place. It points into the shared
  // corridor, and one person's turning is not a corridor stop.
  const setDropOff = useCallback(
    (place: DropOff | null) =>
      update({
        drop_off_id: place?.landmarkId ?? null,
        drop_off_name: place?.name ?? null,
        drop_off_lat: place?.lat ?? null,
        drop_off_lng: place?.lng ?? null,
      }),
    [update]
  );

  const setCar = useCallback(
    (car: string) => update({ car: car.trim() ? car.trim().slice(0, 30) : null }),
    [update]
  );

  const signOut = useCallback(async () => {
    await forgetPush();
    await backend.signOut();
  }, []);

  // Delete first, then sign out, so a failure leaves them signed in to read why.
  const deleteAccount = useCallback(async (): Promise<Result> => {
    try {
      await backend.deleteAccount();
      await backend.signOut();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      session,
      email: session?.email ?? null,
      me,
      membership,
      member: Boolean(membership?.member),
      tester,
      signIn,
      signUp,
      sendPasswordReset,
      resetPassword,
      sendWorkCode,
      verifyWorkCode,
      forgetWorkEmail,
      deleteAccount,
      saveProfile,
      setRole,
      setDropOff,
      setCar,
      signOut,
      profileError,
    }),
    [
      loading, session, me, membership, tester, signIn, signUp, sendPasswordReset, resetPassword, sendWorkCode, verifyWorkCode, forgetWorkEmail, deleteAccount,
      saveProfile, setRole, setDropOff, setCar, signOut, profileError,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

/**
 * Backends speak in API errors. People do not. The domain refusal in
 * particular comes back as a database exception, which is accurate and
 * useless.
 */
function readable(text: string): string {
  const m = text.toLowerCase();
  if (m.includes('outside the group')) {
    return 'Verify your work email first.';
  }
  // "Invalid login credentials" whether the email is unknown or the password
  // is wrong. Saying which would tell a stranger who has an account.
  if (m.includes('invalid login credentials')) {
    return 'That email and password did not match.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirm your email first. Check your inbox for the link, then sign in.';
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'There is already an account with that email. Sign in instead.';
  }
  // A reset code that is mistyped, used, or past its hour.
  if (m.includes('token has expired') || m.includes('otp') || m.includes('invalid token')) {
    return 'That code is wrong or has run out. Ask for a new one.';
  }
  // Before the length check below, which "should be" would also match.
  if (m.includes('should be different')) {
    return 'Choose a password you have not used here before.';
  }
  if (m.includes('password should be') || m.includes('weak password')) {
    return 'Choose a longer password: at least 8 characters.';
  }
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  return text;
}
