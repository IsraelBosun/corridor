import * as SQLite from 'expo-sqlite';

import { WORK_DOMAIN } from '@/lib/config';
import type { Role } from '../types';
import type {
  AuthSession,
  Backend,
  LandmarkRow,
  MessageRow,
  ProfileRow,
  TripFields,
  TripRow,
} from './types';

/**
 * A backend that lives entirely on the phone, for testing.
 *
 * SQLite, so it behaves like a database and survives restarts, and nothing
 * leaves the device. Accounts are made in the app, and you can sign in as any
 * of them with one tap, which is what makes it possible to play the driver and
 * the passenger on one phone.
 *
 * The rules the hosted database enforces with RLS, triggers and functions are
 * enforced here in code, with the same wording where a person sees it. If a
 * rule changes in supabase/migrations, it changes here too.
 *
 * It is one phone's data. Two phones in local mode do not see each other.
 */

const DB_NAME = 'corridor-local.db';

/**
 * Same as the migrations leave the hosted table: the pickup and nothing else.
 * The four corridor stops were retired; destinations and drop offs are
 * searched places now.
 */
const LANDMARKS: LandmarkRow[] = [
  { id: 'marina', name: 'Access Towers', ord: 0, typical_min: 0, lat: 6.4281, lng: 3.4219 },
];

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT
);
CREATE TABLE IF NOT EXISTS landmarks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ord INTEGER NOT NULL UNIQUE,
  typical_min INTEGER NOT NULL,
  lat REAL,
  lng REAL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  initials TEXT NOT NULL,
  display_name TEXT NOT NULL,
  team TEXT,
  floor TEXT,
  drop_off_id TEXT,
  drop_off_name TEXT,
  drop_off_lat REAL,
  drop_off_lng REAL,
  role TEXT NOT NULL DEFAULT 'passenger',
  car TEXT
);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  driver_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  depart_at TEXT NOT NULL,
  tolerance_min INTEGER NOT NULL,
  seats_total INTEGER NOT NULL,
  vehicle TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'posted',
  announce_on_depart INTEGER NOT NULL DEFAULT 0,
  cancelled_at TEXT,
  destination_name TEXT,
  destination_lat REAL,
  destination_lng REAL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trip_stops (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  landmark_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (trip_id, landmark_id)
);
CREATE TABLE IF NOT EXISTS reservations (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rider_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reserved_at TEXT NOT NULL,
  present_at TEXT,
  PRIMARY KEY (trip_id, rider_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

/** Same pattern as the check constraint on corridor.messages. */
const PHONE_SHAPED = /[0-9][0-9 ()+-]{8,}/;

const LIVE = "('posted', 'boarding')";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync(DB_NAME);
      await d.execAsync(SCHEMA);
      // Phones that made the database before trips had a destination. SQLite
      // has no ADD COLUMN IF NOT EXISTS, so a column already there just throws.
      for (const col of [
        'trips ADD COLUMN destination_name TEXT',
        'trips ADD COLUMN destination_lat REAL',
        'trips ADD COLUMN destination_lng REAL',
        'profiles ADD COLUMN car TEXT',
      ]) {
        try {
          await d.execAsync(`ALTER TABLE ${col}`);
        } catch {
          // Already added.
        }
      }
      for (const l of LANDMARKS) {
        await d.runAsync(
          'INSERT OR IGNORE INTO landmarks (id, name, ord, typical_min, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
          l.id, l.name, l.ord, l.typical_min, l.lat, l.lng
        );
      }
      // Retire the old corridor stops on phones that seeded them, the way
      // 20261001130000_retire_corridor_stops.sql does on the server.
      await d.execAsync(`
        UPDATE profiles SET
          drop_off_name = COALESCE(drop_off_name, (SELECT name FROM landmarks l WHERE l.id = profiles.drop_off_id)),
          drop_off_lat = COALESCE(drop_off_lat, (SELECT lat FROM landmarks l WHERE l.id = profiles.drop_off_id)),
          drop_off_lng = COALESCE(drop_off_lng, (SELECT lng FROM landmarks l WHERE l.id = profiles.drop_off_id))
        WHERE drop_off_id IS NOT NULL AND drop_off_id <> 'marina';
        UPDATE profiles SET drop_off_id = NULL WHERE drop_off_id IS NOT NULL AND drop_off_id <> 'marina';
        UPDATE trips SET
          destination_name = (SELECT l.name FROM trip_stops s JOIN landmarks l ON l.id = s.landmark_id
                              WHERE s.trip_id = trips.id ORDER BY s.ord DESC LIMIT 1),
          destination_lat = (SELECT l.lat FROM trip_stops s JOIN landmarks l ON l.id = s.landmark_id
                             WHERE s.trip_id = trips.id ORDER BY s.ord DESC LIMIT 1),
          destination_lng = (SELECT l.lng FROM trip_stops s JOIN landmarks l ON l.id = s.landmark_id
                             WHERE s.trip_id = trips.id ORDER BY s.ord DESC LIMIT 1)
        WHERE destination_name IS NULL
          AND EXISTS (SELECT 1 FROM trip_stops s WHERE s.trip_id = trips.id AND s.landmark_id <> 'marina');
        DELETE FROM trip_stops WHERE landmark_id <> 'marina';
        DELETE FROM landmarks WHERE id <> 'marina';
      `);
      // Rule 2: nothing survives the evening. Same cut off as purge_yesterday().
      const cutoff = new Date(Date.now() - 8 * 3600 * 1000).toISOString();
      await d.runAsync('DELETE FROM trips WHERE depart_at < ?', cutoff);
      return d;
    })();
  }
  return dbPromise;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const now = () => new Date().toISOString();

// Change notification, standing in for Supabase realtime on one device.
const tripListeners = new Set<() => void>();
const messageListeners = new Map<string, Set<(row: MessageRow) => void>>();
const authListeners = new Set<(s: AuthSession | null) => void>();

function tripsChanged() {
  tripListeners.forEach((cb) => cb());
}

async function currentUserId(): Promise<string | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ user_id: string | null }>('SELECT user_id FROM local_session WHERE id = 1');
  return row?.user_id ?? null;
}

async function requireUser(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error('You are not signed in.');
  return id;
}

async function sessionFor(userId: string | null): Promise<AuthSession | null> {
  if (!userId) return null;
  const d = await db();
  const acc = await d.getFirstAsync<{ id: string; email: string }>('SELECT id, email FROM accounts WHERE id = ?', userId);
  return acc ? { userId: acc.id, email: acc.email } : null;
}

async function setSession(userId: string | null) {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO local_session (id, user_id) VALUES (1, ?)', userId);
  const s = await sessionFor(userId);
  authListeners.forEach((cb) => cb(s));
}

async function roleOf(userId: string): Promise<Role | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ role: Role }>('SELECT role FROM profiles WHERE id = ?', userId);
  return row?.role ?? null;
}

async function ownTrip(tripId: string, userId: string) {
  const d = await db();
  const trip = await d.getFirstAsync<{ id: string; status: string; seats_total: number }>(
    'SELECT id, status, seats_total FROM trips WHERE id = ? AND driver_id = ?',
    tripId, userId
  );
  if (!trip) throw new Error('This is not your ride to change.');
  return trip;
}

/** The rule behind "one mode at a time": what is tying this person to tonight. */
async function liveCommitments(userId: string) {
  const d = await db();
  const driving = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM trips WHERE driver_id = ? AND status IN ${LIVE}`,
    userId
  );
  const riding = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM reservations r JOIN trips t ON t.id = r.trip_id
     WHERE r.rider_id = ? AND t.status IN ${LIVE}`,
    userId
  );
  return { driving: (driving?.n ?? 0) > 0, riding: (riding?.n ?? 0) > 0 };
}

function checkFields(f: TripFields, stops: string[]) {
  if (f.seats_total < 1 || f.seats_total > 4) throw new Error('A ride offers between one and four seats.');
  if (f.tolerance_min < 5 || f.tolerance_min > 90) throw new Error('Give or take has to be between 5 and 90 minutes.');
  if ((f.vehicle ?? '').length > 80) throw new Error('Keep the car description under 80 characters.');
  if ((f.note ?? '').length > 300) throw new Error('Keep the note under 300 characters.');
  if ((f.destination_name ?? '').length > 120) throw new Error('Keep the destination under 120 characters.');
  if (stops.length < 1) throw new Error('A ride needs a pickup point.');
  if (!f.destination_name || f.destination_lat === null || f.destination_lng === null) {
    throw new Error('Say where you are going so riders can see if you pass them.');
  }
}

function tripCode(): string {
  return uuid().replace(/-/g, '').slice(0, 4).toUpperCase();
}

export const localBackend: Backend = {
  kind: 'local',

  async getSession() {
    return sessionFor(await currentUserId());
  },

  onAuthChange(cb) {
    authListeners.add(cb);
    return () => authListeners.delete(cb);
  },

  async signIn(email, code) {
    const d = await db();
    const acc = await d.getFirstAsync<{ id: string; code: string }>(
      'SELECT id, code FROM accounts WHERE email = ?',
      email.toLowerCase()
    );
    // Same vagueness as Supabase: never say which half was wrong.
    if (!acc || acc.code !== code) throw new Error('Invalid login credentials');
    await setSession(acc.id);
  },

  async signUp() {
    throw new Error('Test accounts are made from the account picker in local mode.');
  },

  async signOut() {
    await setSession(null);
  },

  // Local test accounts are colleagues by construction: there is no inbox to
  // send a code to, so everyone counts as verified.
  async membership() {
    const now = new Date();
    return {
      workEmail: null,
      verifiedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 86400_000).toISOString(),
      member: true,
    };
  },

  async sendWorkCode() {},

  async verifyWorkCode() {},

  async forgetWorkEmail() {},

  async isTester() {
    return false;
  },

  async getProfile(userId) {
    const d = await db();
    return d.getFirstAsync<ProfileRow>('SELECT * FROM profiles WHERE id = ?', userId);
  },

  async saveProfile(row) {
    const d = await db();
    await d.runAsync(
      `INSERT INTO profiles (id, handle, initials, display_name, role) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, initials = excluded.initials,
         display_name = excluded.display_name, role = excluded.role`,
      row.id, row.handle, row.initials, row.display_name, row.role
    );
  },

  async updateProfile(userId, patch) {
    const d = await db();
    if ((patch.car ?? '').length > 30) throw new Error('Keep the car description to 30 characters.');
    if (patch.role) {
      const current = await roleOf(userId);
      if (current && current !== patch.role) {
        const live = await liveCommitments(userId);
        if (live.driving) throw new Error("Cancel tonight's ride before you switch to riding.");
        if (live.riding) throw new Error('Give up your seat before you switch to driving.');
      }
    }
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    await d.runAsync(`UPDATE profiles SET ${sets} WHERE id = ?`, ...keys.map((k) => patch[k] ?? null), userId);
    tripsChanged();
  },

  async listProfiles() {
    const d = await db();
    return d.getAllAsync<ProfileRow>('SELECT * FROM profiles');
  },

  async listLandmarks() {
    const d = await db();
    return d.getAllAsync<LandmarkRow>('SELECT * FROM landmarks ORDER BY ord');
  },

  async listTrips() {
    const d = await db();
    const trips = await d.getAllAsync<Omit<TripRow, 'trip_stops' | 'reservations' | 'announce_on_depart'> & { announce_on_depart: number }>(
      'SELECT id, code, driver_id, depart_at, tolerance_min, seats_total, vehicle, note, status, announce_on_depart, cancelled_at, destination_name, destination_lat, destination_lng FROM trips ORDER BY depart_at'
    );
    const stops = await d.getAllAsync<{ trip_id: string; landmark_id: string; ord: number }>('SELECT * FROM trip_stops');
    const res = await d.getAllAsync<{ trip_id: string; rider_id: string; present_at: string | null }>(
      'SELECT trip_id, rider_id, present_at FROM reservations ORDER BY reserved_at'
    );
    return trips.map((t) => ({
      ...t,
      announce_on_depart: t.announce_on_depart === 1,
      trip_stops: stops.filter((s) => s.trip_id === t.id).map(({ landmark_id, ord }) => ({ landmark_id, ord })),
      reservations: res.filter((r) => r.trip_id === t.id).map(({ rider_id, present_at }) => ({ rider_id, present_at })),
    }));
  },

  onTripsChange(cb) {
    tripListeners.add(cb);
    return () => tripListeners.delete(cb);
  },

  async createTrip(driverId, fields, stops) {
    const me = await requireUser();
    if (me !== driverId) throw new Error('You can only post your own ride.');
    if ((await roleOf(me)) !== 'driver') throw new Error('Only drivers can post a ride. Switch to driving in your account.');
    checkFields(fields, stops);
    const d = await db();
    const id = uuid();
    await d.withExclusiveTransactionAsync(async (tx) => {
      // One live ride per driver, as the unique index does on the server.
      const live = await tx.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM trips WHERE driver_id = ? AND status IN ${LIVE}`,
        me
      );
      if ((live?.n ?? 0) > 0) throw new Error('You already have a ride posted tonight. Edit that one instead.');
      await tx.runAsync(
        `INSERT INTO trips (id, code, driver_id, depart_at, tolerance_min, seats_total, vehicle, note, announce_on_depart,
                            destination_name, destination_lat, destination_lng, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, tripCode(), me, fields.depart_at, fields.tolerance_min, fields.seats_total,
        fields.vehicle, fields.note, fields.announce_on_depart ? 1 : 0,
        fields.destination_name, fields.destination_lat, fields.destination_lng, now()
      );
      for (let i = 0; i < stops.length; i++) {
        await tx.runAsync('INSERT INTO trip_stops (trip_id, landmark_id, ord) VALUES (?, ?, ?)', id, stops[i], i);
      }
    });
    tripsChanged();
    return id;
  },

  async editTrip(tripId, fields, stops) {
    const me = await requireUser();
    await ownTrip(tripId, me);
    checkFields(fields, stops);
    const d = await db();
    await d.withExclusiveTransactionAsync(async (tx) => {
      const taken = await tx.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM reservations WHERE trip_id = ?', tripId);
      if (fields.seats_total < (taken?.n ?? 0)) {
        throw new Error('That leaves fewer seats than people already holding one. Release a seat first.');
      }
      await tx.runAsync(
        `UPDATE trips SET depart_at = ?, tolerance_min = ?, seats_total = ?, vehicle = ?, note = ?, announce_on_depart = ?,
                          destination_name = ?, destination_lat = ?, destination_lng = ?
         WHERE id = ?`,
        fields.depart_at, fields.tolerance_min, fields.seats_total, fields.vehicle, fields.note,
        fields.announce_on_depart ? 1 : 0,
        fields.destination_name, fields.destination_lat, fields.destination_lng, tripId
      );
      await tx.runAsync('DELETE FROM trip_stops WHERE trip_id = ?', tripId);
      for (let i = 0; i < stops.length; i++) {
        await tx.runAsync('INSERT INTO trip_stops (trip_id, landmark_id, ord) VALUES (?, ?, ?)', tripId, stops[i], i);
      }
    });
    tripsChanged();
  },

  async cancelTrip(tripId) {
    const me = await requireUser();
    await ownTrip(tripId, me);
    const d = await db();
    await d.runAsync("UPDATE trips SET status = 'cancelled', cancelled_at = ? WHERE id = ?", now(), tripId);
    tripsChanged();
  },

  async departTrip(tripId) {
    const me = await requireUser();
    await ownTrip(tripId, me);
    const d = await db();
    await d.withExclusiveTransactionAsync(async (tx) => {
      // Presence is the record of who actually got in.
      await tx.runAsync('DELETE FROM reservations WHERE trip_id = ? AND present_at IS NULL', tripId);
      await tx.runAsync("UPDATE trips SET status = 'left' WHERE id = ?", tripId);
    });
    tripsChanged();
  },

  async reserveSeat(tripId) {
    const me = await requireUser();
    if ((await roleOf(me)) !== 'passenger') {
      throw new Error('Drivers do not take seats. Switch to riding in your account.');
    }
    const d = await db();
    let ok = false;
    await d.withExclusiveTransactionAsync(async (tx) => {
      const trip = await tx.getFirstAsync<{ seats_total: number; status: string; driver_id: string }>(
        'SELECT seats_total, status, driver_id FROM trips WHERE id = ?',
        tripId
      );
      if (!trip || (trip.status !== 'posted' && trip.status !== 'boarding') || trip.driver_id === me) return;
      // One seat at a time, across the whole corridor.
      const elsewhere = await tx.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM reservations r JOIN trips t ON t.id = r.trip_id
         WHERE r.rider_id = ? AND t.status IN ${LIVE} AND t.id <> ?`,
        me, tripId
      );
      if ((elsewhere?.n ?? 0) > 0) throw new Error('You already have a seat tonight. Give it up first.');
      const taken = await tx.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM reservations WHERE trip_id = ?', tripId);
      if ((taken?.n ?? 0) >= trip.seats_total) return;
      await tx.runAsync(
        'INSERT OR IGNORE INTO reservations (trip_id, rider_id, reserved_at) VALUES (?, ?, ?)',
        tripId, me, now()
      );
      ok = true;
    });
    tripsChanged();
    return ok;
  },

  async releaseSeat(tripId, riderId) {
    const me = await requireUser();
    if (me !== riderId) throw new Error('You can only give up your own seat.');
    const d = await db();
    await d.runAsync('DELETE FROM reservations WHERE trip_id = ? AND rider_id = ?', tripId, riderId);
    tripsChanged();
  },

  async setPresence(tripId, riderId, at) {
    const me = await requireUser();
    const d = await db();
    const trip = await d.getFirstAsync<{ driver_id: string }>('SELECT driver_id FROM trips WHERE id = ?', tripId);
    // The rider taps themselves in, or the driver taps them in from the grid.
    if (me !== riderId && trip?.driver_id !== me) throw new Error('Only the rider or the driver can do that.');
    await d.runAsync('UPDATE reservations SET present_at = ? WHERE trip_id = ? AND rider_id = ?', at, tripId, riderId);
    tripsChanged();
  },

  async listMessages(tripId) {
    const d = await db();
    return d.getAllAsync<MessageRow>(
      'SELECT id, author_id, body, created_at FROM messages WHERE trip_id = ? ORDER BY created_at',
      tripId
    );
  },

  async sendMessage(tripId, authorId, body) {
    const me = await requireUser();
    if (me !== authorId) throw new Error('You can only send as yourself.');
    const d = await db();
    const onTrip = await d.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM trips WHERE id = ? AND driver_id = ?) +
              (SELECT COUNT(*) FROM reservations WHERE trip_id = ? AND rider_id = ?) AS n`,
      tripId, me, tripId, me
    );
    if ((onTrip?.n ?? 0) === 0) throw new Error('Only people on this ride can message it.');
    if (body.length < 1 || body.length > 500) throw new Error('Messages are 1 to 500 characters.');
    // The same error text the server's constraint produces, so chat.ts reads it the same way.
    if (PHONE_SHAPED.test(body)) throw new Error('messages_no_phone_numbers');
    const row: MessageRow = { id: uuid(), author_id: me, body, created_at: now() };
    await d.runAsync(
      'INSERT INTO messages (id, trip_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      row.id, tripId, row.author_id, row.body, row.created_at
    );
    messageListeners.get(tripId)?.forEach((cb) => cb(row));
    return row;
  },

  onMessage(tripId, cb) {
    const set = messageListeners.get(tripId) ?? new Set();
    set.add(cb);
    messageListeners.set(tripId, set);
    return () => set.delete(cb);
  },
};

/* -------------------------------------------------------------------------- */
/* Test tools. Only reachable when the app runs on the local backend.         */
/* -------------------------------------------------------------------------- */

export type LocalAccount = {
  id: string;
  email: string;
  code: string;
  name: string;
  initials: string;
  role: Role;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const localTools = {
  async listAccounts(): Promise<LocalAccount[]> {
    const d = await db();
    return d.getAllAsync<LocalAccount>(
      `SELECT a.id, a.email, a.code, p.display_name AS name, p.initials, p.role
       FROM accounts a JOIN profiles p ON p.id = a.id ORDER BY p.role, a.created_at`
    );
  },

  /** A ready to use account: signed up, profile written, nothing left to fill in. */
  async createAccount(input: { name: string; role: Role }): Promise<LocalAccount> {
    const name = input.name.trim();
    if (name.length < 2) throw new Error('Give the test account a name.');
    const d = await db();
    const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    let email = `${handle}@${WORK_DOMAIN}`;
    // Two "Ada"s get ada@ and ada.2@.
    for (let i = 2; await d.getFirstAsync('SELECT 1 FROM accounts WHERE email = ?', email); i++) {
      email = `${handle}.${i}@${WORK_DOMAIN}`;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const id = uuid();
    const initials = initialsFrom(name);
    await d.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO accounts (id, email, code, created_at) VALUES (?, ?, ?, ?)', id, email, code, now());
      await tx.runAsync(
        'INSERT INTO profiles (id, handle, initials, display_name, role) VALUES (?, ?, ?, ?, ?)',
        id, email.split('@')[0], initials, name, input.role
      );
    });
    return { id, email, code, name, initials, role: input.role };
  },

  /** Skips the code. Test data only. */
  async signInAs(userId: string): Promise<void> {
    await setSession(userId);
  },

  async deleteAccount(userId: string): Promise<void> {
    const d = await db();
    if ((await currentUserId()) === userId) await setSession(null);
    await d.runAsync('DELETE FROM accounts WHERE id = ?', userId);
    tripsChanged();
  },

  /** Every account, ride and message on this phone, gone. The stops stay. */
  async resetAll(): Promise<void> {
    const d = await db();
    await setSession(null);
    await d.execAsync('DELETE FROM messages; DELETE FROM reservations; DELETE FROM trip_stops; DELETE FROM trips; DELETE FROM profiles; DELETE FROM accounts;');
    tripsChanged();
  },
};
