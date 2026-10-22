import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { backend, type ReportCategory } from '@/data/backend';
import { useAnyTrip, useStore } from '@/data/store';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, CheckIcon, ShieldIcon } from '@/ui/icons';
import { Avatar, Button, Callout, Screen, ScreenHeader, SectionTitle } from '@/ui/primitives';
import { Text } from '@/ui/text';

const DETAILS_MAX = 1000;

const CATEGORIES: { id: ReportCategory; label: string; driverOnly?: boolean }[] = [
  { id: 'unsafe_driving', label: 'Unsafe driving', driverOnly: true },
  { id: 'harassment', label: 'Harassment or threats' },
  { id: 'inappropriate_messages', label: 'Inappropriate messages' },
  { id: 'no_show', label: 'Did not show up' },
  { id: 'payment', label: 'A problem with the fuel contribution' },
  { id: 'other', label: 'Something else' },
];

/**
 * Report a problem on a ride you are on.
 *
 * The report and a record of the ride go to whoever runs Corridor. Nobody on
 * the ride is told, and the person reported never learns who said it. An
 * emergency is not a report, so the way to 112 comes first.
 */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { person, me } = useStore();
  // A past ride too: something that happened last night is reported the next day.
  const { trip, loading } = useAnyTrip(id);

  // undefined: not chosen yet. null: the ride as a whole.
  const [about, setAbout] = useState<string | null | undefined>(undefined);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!trip || !me) {
    return (
      <Screen>
        <ScreenHeader title="Report a problem" icon="close" />
        {loading ? (
          <ActivityIndicator color={color.inkFaint} />
        ) : (
          <Text variant="body" tone="muted">
            This ride could not be found. You can only report a ride you drove or held a seat on.
          </Text>
        )}
      </Screen>
    );
  }

  if (sent) {
    return (
      <Screen footer={<Button label="Done" onPress={close} />}>
        <ScreenHeader title="Report sent" icon="close" />
        <View style={s.doneIcon}>
          <CheckIcon size={28} />
        </View>
        <Text variant="title">Thank you for telling us.</Text>
        <Text variant="body" tone="muted" style={s.gap}>
          We have a record of this ride and will look into it. Nobody on the ride is told
          that you reported it.
        </Text>
      </Screen>
    );
  }

  const people = [trip.driverId, ...trip.riders].filter((p) => p !== me.id);
  const aboutDriver = about === trip.driverId;
  const choices = CATEGORIES.filter((c) => !c.driverOnly || aboutDriver || about === null);
  const ready = about !== undefined && category !== null && !busy;

  async function send() {
    if (!ready || !trip) return;
    setBusy(true);
    setError(null);
    try {
      await backend.reportPerson(trip.id, about ?? null, category!, details.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={<Button label={busy ? 'Sending' : 'Send report'} onPress={send} disabled={!ready} />}>
      <ScreenHeader title="Report a problem" icon="close" />

      <Callout tone="stop" icon={<AlertIcon />}>
        <Text variant="body" tone="stop" style={s.bold}>
          In danger right now?
        </Text>
        <Text variant="small" tone="muted">
          Call the emergency line first. A report is read later, not straight away.
        </Text>
        <Pressable
          onPress={() => Linking.openURL('tel:112')}
          accessibilityRole="button"
          style={({ pressed }) => [s.call, pressed && s.pressed]}>
          <Text variant="body" style={s.callText}>
            Call 112
          </Text>
        </Pressable>
      </Callout>

      <SectionTitle style={s.section}>Who is it about?</SectionTitle>
      <View style={s.group}>
        {people.map((pid) => {
          const p = person(pid);
          const on = about === pid;
          return (
            <Choice key={pid} on={on} onPress={() => setAbout(pid)}>
              <Avatar initials={p.initials} size={36} />
              <View style={s.flex}>
                <Text variant="body" style={s.bold}>
                  {p.name}
                </Text>
                <Text variant="small" tone="muted">
                  {pid === trip.driverId ? 'Driver' : 'Rider'}
                </Text>
              </View>
            </Choice>
          );
        })}
        <Choice on={about === null} onPress={() => setAbout(null)} last>
          <View style={s.rideIcon}>
            <ShieldIcon size={20} tint={color.brandInk} />
          </View>
          <Text variant="body" style={[s.bold, s.flex]}>
            The ride in general
          </Text>
        </Choice>
      </View>

      <SectionTitle style={s.section}>What happened?</SectionTitle>
      <View style={s.group}>
        {choices.map((c, i) => (
          <Choice
            key={c.id}
            on={category === c.id}
            onPress={() => setCategory(c.id)}
            last={i === choices.length - 1}>
            <Text variant="body" style={s.flex}>
              {c.label}
            </Text>
          </Choice>
        ))}
      </View>

      <SectionTitle style={s.section}>Anything else we should know?</SectionTitle>
      <TextInput
        value={details}
        onChangeText={(t) => setDetails(t.slice(0, DETAILS_MAX))}
        style={s.details}
        placeholder="What happened, and when. Optional."
        placeholderTextColor={color.inkFaint}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Details of what happened"
      />

      {error ? (
        <Text variant="small" tone="stop" style={s.gap}>
          {error}
        </Text>
      ) : null}

      <Text variant="small" tone="faint" style={s.foot}>
        Ride {trip.code}. The person you report is not told who reported them.
      </Text>
    </Screen>
  );
}

function Choice({
  on,
  onPress,
  last,
  children,
}: {
  on: boolean;
  onPress: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [s.choice, !last && s.choiceLine, pressed && s.pressed]}>
      {children}
      <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
    </Pressable>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '600' },
    gap: { marginTop: space.md },
    section: { marginTop: space.xl },
    group: {
      backgroundColor: color.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: color.line,
      overflow: 'hidden',
    },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      minHeight: 56,
    },
    choiceLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: color.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: color.brand },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.brand },
    rideIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: color.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    details: {
      minHeight: 120,
      backgroundColor: color.surface,
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: radius.lg,
      padding: space.lg,
      fontSize: 16,
      fontFamily: font.sans,
      color: color.ink,
    },
    call: {
      marginTop: space.md,
      alignSelf: 'flex-start',
      backgroundColor: color.stop,
      borderRadius: radius.pill,
      paddingHorizontal: space.xl,
      paddingVertical: space.sm,
    },
    callText: { color: '#FFFFFF', fontWeight: '700' },
    doneIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: color.goSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.lg,
    },
    foot: { marginTop: space.xl },
    pressed: { opacity: 0.75 },
  })
);
