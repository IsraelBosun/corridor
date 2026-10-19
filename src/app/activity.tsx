import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { backend, type ActivityRow } from '@/data/backend';
import { color, space, themed } from '@/theme/tokens';
import { Row, Screen, ScreenHeader } from '@/ui/primitives';
import { Text } from '@/ui/text';

/**
 * Your own activity log: everything Corridor has recorded you doing, newest
 * first. The database writes it; this only reads your own rows. The safety
 * team sees the same lines, and nobody else does.
 */
export default function ActivityScreen() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backend
      .listMyActivity(200)
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load your activity.'));
  }, []);

  return (
    <Screen>
      <ScreenHeader title="Your activity" />
      <Text variant="body" tone="muted" style={s.sub}>
        What Corridor has recorded about what you did, for safety. Only you and the Corridor safety team can see
        it. Chat messages are listed, never what they said.
      </Text>

      {error ? (
        <Text variant="body" tone="stop">
          {error}
        </Text>
      ) : rows === null ? (
        <ActivityIndicator color={color.inkFaint} />
      ) : rows.length === 0 ? (
        <Text variant="body" tone="muted">
          Nothing yet.
        </Text>
      ) : (
        rows.map((r, i) => (
          <Row key={r.id} title={label(r)} subtitle={when(r.at)} last={i === rows.length - 1} />
        ))
      )}
    </Screen>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/** A sentence for each kind of line. Unknown kinds still read as something. */
function label(r: ActivityRow): string {
  const d = r.detail ?? {};
  const code = text(d.code);
  const ride = code ? `ride ${code}` : 'a ride';
  switch (r.action) {
    case 'signed_in':
      return 'Signed in';
    case 'signed_out':
      return 'Signed out';
    case 'profile_created':
      return 'Joined Corridor';
    case 'account_deleted':
      return 'Deleted the account';
    case 'work_email_verified':
      return `Confirmed company email${text(d.email) ? ` ${d.email}` : ''}`;
    case 'work_email_removed':
      return 'Removed company email';
    case 'role_switched':
      return d.to === 'driver' ? 'Switched to driving' : 'Switched to riding';
    case 'drop_off_changed':
      return text(d.to) ? `Usual place set to ${d.to}` : 'Cleared usual place';
    case 'car_changed':
      return 'Changed car description';
    case 'name_changed':
      return 'Changed name';
    case 'ride_posted':
      return `Posted ${ride}`;
    case 'ride_edited':
      return `Edited ${ride}`;
    case 'ride_left':
      return `Set off on ${ride}`;
    case 'ride_cancelled':
      return `Cancelled ${ride}`;
    case 'seat_booked':
      return 'Took a seat';
    case 'seat_given_up':
      return 'Gave up a seat';
    case 'rider_removed':
      return 'Removed a rider from your ride';
    case 'checked_in':
      return 'Checked in at the pickup';
    case 'check_in_undone':
      return 'Undid a check in';
    case 'message_sent':
      return 'Sent a ride chat message';
    case 'report_filed':
      return 'Sent a report';
    case 'location_recording_started':
      return 'Location recorded during a ride';
    default:
      return r.action.replace(/_/g, ' ');
  }
}

const s = themed(() =>
  StyleSheet.create({
    sub: { marginTop: space.xs, marginBottom: space.md },
  })
);
