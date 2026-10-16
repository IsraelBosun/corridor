import type { Role, TripStatus } from '../types';

/**
 * Everything the app asks of a backend, in one place.
 *
 * Two implementations answer it. The Supabase one talks to the hosted project
 * and leans on RLS and database functions for the rules. The local one keeps
 * everything in SQLite on the phone, for testing with made up drivers and
 * passengers, and enforces the same rules in code. The screens never know
 * which one is running.
 *
 * Rows use the database's own column names, so the conversion into app types
 * stays in one place (store.tsx and session.tsx), whichever backend produced
 * them. Failures throw an Error whose message is safe to show.
 */

export type AuthSession = { userId: string; email: string };

/**
 * Whether the signed in person belongs to the corridor right now: a work
 * address on an allowed domain, verified in the last 60 days. The login email
 * is personal and says nothing about this.
 */
export type Membership = {
  workEmail: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  member: boolean;
};

export type ProfileRow = {
  id: string;
  handle: string;
  initials: string;
  display_name: string;
  team: string | null;
  floor: string | null;
  drop_off_id: string | null;
  drop_off_name: string | null;
  drop_off_lat: number | null;
  drop_off_lng: number | null;
  role: Role;
  /** How to spot a driver's car. 30 characters at most. */
  car: string | null;
};

export type TripRow = {
  id: string;
  code: string;
  driver_id: string;
  depart_at: string;
  tolerance_min: number;
  seats_total: number;
  vehicle: string | null;
  note: string | null;
  status: TripStatus;
  announce_on_depart: boolean;
  cancelled_at: string | null;
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  /** Naira each rider pays the driver directly, or null for a free ride. */
  contribution_naira: number | null;
  reservations: { rider_id: string; present_at: string | null }[];
};

export type MessageRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type TripFields = {
  depart_at: string;
  tolerance_min: number;
  seats_total: number;
  vehicle: string | null;
  note: string | null;
  announce_on_depart: boolean;
  /** Where the driver is going tonight. Null ends the ride at its last stop. */
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  /** Where the driver starts tonight. Riders meet the car here. */
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  /** Null for a free ride. The database accepts only the one flat figure. */
  contribution_naira: number | null;
};

export type ProfilePatch = Partial<Omit<ProfileRow, 'id'>>;

/**
 * Where a driver takes fuel contributions by transfer. Set once on their
 * account. Readable only by the driver and by riders holding a seat tonight on
 * that driver's paid ride; the database enforces that, not the screens.
 */
export type PayoutRow = {
  bank_name: string;
  /** Ten digits. */
  account_number: string;
  account_name: string;
};

export interface Backend {
  /** 'local' shows the test account tools; 'supabase' is the real thing. */
  kind: 'local' | 'supabase';

  // Auth
  getSession(): Promise<AuthSession | null>;
  onAuthChange(cb: (session: AuthSession | null) => void): () => void;
  /** A personal email and password, shared with the project's other apps. */
  signIn(email: string, password: string): Promise<void>;
  /** needsConfirm when the project asks new accounts to confirm their email first. */
  signUp(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  signOut(): Promise<void>;

  // The work email that makes someone a member
  membership(): Promise<Membership>;
  /** Mails a six digit code to that work address. */
  sendWorkCode(workEmail: string): Promise<void>;
  /** Checks the code; on success the address is verified for 60 days. */
  verifyWorkCode(code: string): Promise<void>;
  /** "I have left": forget the work address. The account itself stays. */
  forgetWorkEmail(): Promise<void>;
  /** On the testers list: may switch riding and driving at any time. */
  isTester(): Promise<boolean>;

  // Profiles
  getProfile(userId: string): Promise<ProfileRow | null>;
  /** Create or replace the signed in person's own profile. */
  saveProfile(row: Pick<ProfileRow, 'id' | 'handle' | 'initials' | 'display_name' | 'role'>): Promise<void>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>;
  listProfiles(): Promise<ProfileRow[]>;

  // Bank details for fuel contributions
  /** Null when there are none, or when the caller is not allowed to see them. */
  getPayout(userId: string): Promise<PayoutRow | null>;
  /** The signed in person's own. Null removes them. */
  savePayout(userId: string, row: PayoutRow | null): Promise<void>;

  // The corridor
  listTrips(): Promise<TripRow[]>;
  /** Called whenever a trip or a reservation changes. Returns an unsubscribe. */
  onTripsChange(cb: () => void): () => void;

  // Driving
  /** Returns the new trip id. */
  createTrip(driverId: string, fields: TripFields): Promise<string>;
  /** Replaces the fields of the driver's own trip. */
  editTrip(tripId: string, fields: TripFields): Promise<void>;
  cancelTrip(tripId: string): Promise<void>;
  /** Sets off: anyone not marked present loses their seat. */
  departTrip(tripId: string): Promise<void>;

  // Riding
  /** False when the last seat went first, or the trip is no longer open. */
  reserveSeat(tripId: string): Promise<boolean>;
  releaseSeat(tripId: string, riderId: string): Promise<void>;
  setPresence(tripId: string, riderId: string, at: string | null): Promise<void>;

  // Trip chat
  listMessages(tripId: string): Promise<MessageRow[]>;
  sendMessage(tripId: string, authorId: string, body: string): Promise<MessageRow>;
  onMessage(tripId: string, cb: (row: MessageRow) => void): () => void;

  // Safety
  /**
   * Reports a problem on a ride the signed in person is on. reportedId is the
   * driver or a rider on it, or null for the ride as a whole. The database
   * keeps a record of the ride and the report goes to whoever runs Corridor;
   * nobody on the ride is told.
   */
  reportPerson(tripId: string, reportedId: string | null, category: ReportCategory, details: string): Promise<void>;
}

export type ReportCategory =
  | 'unsafe_driving'
  | 'harassment'
  | 'no_show'
  | 'payment'
  | 'inappropriate_messages'
  | 'other';
