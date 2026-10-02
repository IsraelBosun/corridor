import { supabase } from '@/lib/supabase';
import type { AuthSession, Backend, Membership, MessageRow, ProfileRow, TripRow } from './types';

/**
 * The hosted backend. The rules live in the database (RLS, triggers and the
 * functions in supabase/migrations), so this file only moves rows.
 */

const PROFILE_COLUMNS =
  'id, handle, initials, display_name, team, floor, drop_off_id, drop_off_name, drop_off_lat, drop_off_lng, role, car';

/** Columns, and the two embedded tables, in one round trip. */
const TRIP_SELECT =
  'id, code, driver_id, depart_at, tolerance_min, seats_total, vehicle, note, status, announce_on_depart, cancelled_at, destination_name, destination_lat, destination_lng, trip_stops(landmark_id, ord), reservations(rider_id, present_at)';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Calls the corridor-work-email edge function. A refusal comes back as a non
 * 2xx response with a plain sentence in it, which is what gets shown.
 */
async function workEmail(body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke('corridor-work-email', { body });
  if (!error) return;
  const response = (error as { context?: Response }).context;
  let text = 'That did not work. Try again.';
  try {
    const parsed = (await response?.json()) as { error?: string } | undefined;
    if (parsed?.error) text = parsed.error;
  } catch {
    // Not JSON: the function did not run at all, so keep the plain message.
  }
  throw new Error(text);
}

function toAuth(s: { user: { id: string; email?: string } } | null): AuthSession | null {
  return s ? { userId: s.user.id, email: s.user.email ?? '' } : null;
}

export const supabaseBackend: Backend = {
  kind: 'supabase',

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return toAuth(data.session);
  },

  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => cb(toAuth(next)));
    return () => data.subscription.unsubscribe();
  },

  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    fail(error);
  },

  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    fail(error);
    return { needsConfirm: !data.session };
  },

  async membership() {
    const { data, error } = await supabase.rpc('membership');
    fail(error);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { work_email: string | null; verified_at: string | null; expires_at: string | null; member: boolean }
      | undefined;
    const out: Membership = {
      workEmail: row?.work_email ?? null,
      verifiedAt: row?.verified_at ?? null,
      expiresAt: row?.expires_at ?? null,
      member: Boolean(row?.member),
    };
    return out;
  },

  async sendWorkCode(address) {
    await workEmail({ action: 'send', email: address });
  },

  async verifyWorkCode(code) {
    await workEmail({ action: 'verify', code });
  },

  async forgetWorkEmail() {
    const { error } = await supabase.rpc('forget_work_email');
    fail(error);
  },

  async isTester() {
    // Not a tester when it cannot be asked: the database refuses the switch
    // anyway, so a wrong "no" costs a message, never a broken rule.
    const { data, error } = await supabase.rpc('is_tester');
    return !error && data === true;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    fail(error);
    return (data as ProfileRow | null) ?? null;
  },

  async saveProfile(row) {
    const { error } = await supabase.from('profiles').upsert(row);
    fail(error);
  },

  async updateProfile(userId, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    fail(error);
  },

  async listProfiles() {
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS);
    fail(error);
    return (data ?? []) as ProfileRow[];
  },

  async listLandmarks() {
    const { data, error } = await supabase
      .from('landmarks')
      .select('id, name, ord, typical_min, lat, lng')
      .order('ord');
    fail(error);
    return data ?? [];
  },

  async listTrips() {
    const { data, error } = await supabase.from('trips').select(TRIP_SELECT).order('depart_at');
    fail(error);
    return (data ?? []) as TripRow[];
  },

  onTripsChange(cb) {
    const channel = supabase
      .channel('corridor-changes')
      .on('postgres_changes', { event: '*', schema: 'corridor', table: 'trips' }, cb)
      .on('postgres_changes', { event: '*', schema: 'corridor', table: 'reservations' }, cb)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  async createTrip(driverId, fields, stops) {
    const { data, error } = await supabase
      .from('trips')
      .insert({ driver_id: driverId, ...fields })
      .select('id')
      .single();
    fail(error);
    const id = (data as { id: string }).id;

    // The stops are a second write. A trip with no stops passes nobody, so if
    // they fail the trip is taken back out rather than left routeless.
    const { error: stopsError } = await supabase
      .from('trip_stops')
      .insert(stops.map((landmark_id, ord) => ({ trip_id: id, landmark_id, ord })));
    if (stopsError) {
      await supabase.from('trips').delete().eq('id', id);
      throw new Error(`${stopsError.message} The ride was not posted.`);
    }
    return id;
  },

  async editTrip(tripId, fields, stops) {
    fail((await supabase.from('trips').update(fields).eq('id', tripId)).error);
    // Replaced wholesale. Five rows at most, and the order is the meaning.
    fail((await supabase.from('trip_stops').delete().eq('trip_id', tripId)).error);
    fail(
      (
        await supabase
          .from('trip_stops')
          .insert(stops.map((landmark_id, ord) => ({ trip_id: tripId, landmark_id, ord })))
      ).error
    );
  },

  async cancelTrip(tripId) {
    const { error } = await supabase
      .from('trips')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', tripId);
    fail(error);
  },

  async departTrip(tripId) {
    fail((await supabase.rpc('depart_trip', { p_trip: tripId })).error);
  },

  async reserveSeat(tripId) {
    // The seat limit is settled by the database, which locks the trip row so
    // exactly one of two simultaneous riders wins.
    const { data, error } = await supabase.rpc('reserve_seat', { p_trip: tripId });
    fail(error);
    return data === true;
  },

  async releaseSeat(tripId, riderId) {
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('trip_id', tripId)
      .eq('rider_id', riderId);
    fail(error);
  },

  async setPresence(tripId, riderId, at) {
    const { error } = await supabase
      .from('reservations')
      .update({ present_at: at })
      .eq('trip_id', tripId)
      .eq('rider_id', riderId);
    fail(error);
  },

  async listMessages(tripId) {
    const { data, error } = await supabase
      .from('messages')
      .select('id, author_id, body, created_at')
      .eq('trip_id', tripId)
      .order('created_at');
    fail(error);
    return (data ?? []) as MessageRow[];
  },

  async sendMessage(tripId, authorId, body) {
    const { data, error } = await supabase
      .from('messages')
      .insert({ trip_id: tripId, author_id: authorId, body })
      .select('id, author_id, body, created_at')
      .single();
    fail(error);
    return data as MessageRow;
  },

  onMessage(tripId, cb) {
    const channel = supabase
      .channel('chat-' + tripId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'corridor', table: 'messages', filter: 'trip_id=eq.' + tripId },
        (payload) => cb(payload.new as MessageRow)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },
};
