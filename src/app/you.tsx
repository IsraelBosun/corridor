import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { USING_LOCAL } from '@/data/backend';
import { useSession } from '@/data/session';
import { useStore } from '@/data/store';
import { useTheme, type ThemeMode } from '@/theme/theme';
import { color, font, MINT, radius, space, TEAL, themed } from '@/theme/tokens';
import { AlertIcon, CarIcon, CheckIcon, ChevronIcon, PersonIcon, ShieldIcon } from '@/ui/icons';
import { Avatar, Callout, Screen, ScreenHeader, SectionTitle } from '@/ui/primitives';
import { showDialog } from '@/ui/dialog';
import { Text } from '@/ui/text';

/** A work email is good for this long, then it is confirmed again. */
const MEMBERSHIP_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function YouScreen() {
  const router = useRouter();
  const { me, role, myTrip, mySeat } = useStore();
  const { email, signOut, setRole, tester } = useSession();
  const [error, setError] = useState<string | null>(null);

  const driver = role === 'driver';
  // A seat on a ride that has already left is not something to give up, and
  // the backend only counts rides still waiting at the pickup.
  const liveSeat = mySeat && (mySeat.status === 'posted' || mySeat.status === 'boarding') ? mySeat : undefined;

  // Tonight already ties you to one side. The backend refuses the switch too;
  // this just says so before anyone taps. Testers switch freely.
  const blocked = tester
    ? null
    : driver
      ? myTrip
        ? "Cancel tonight's ride to switch."
        : null
      : liveSeat
        ? 'Give up your seat to switch.'
        : null;

  function confirmSwitch() {
    if (blocked) return;
    const next = driver ? 'passenger' : 'driver';
    showDialog(
      driver ? 'Switch to riding?' : 'Switch to driving?',
      driver
        ? 'You will see rides going your way instead of your own. You can switch back any time.'
        : 'You will post your own rides instead of taking seats. You can switch back any time.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setError(null);
            const result = await setRole(next);
            if (!result.ok) setError(result.error);
            else router.replace('/');
          },
        },
      ],
      driver ? 'person' : 'car'
    );
  }

  function confirmSignOut() {
    showDialog(
      'Sign out of Corridor?',
      'Your rides and settings stay as they are.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOut },
      ],
      'signout'
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Account" />

      <Profile name={me?.name ?? 'You'} initials={me?.initials ?? '?'} email={email} driver={driver} />

      {USING_LOCAL ? (
        <View style={s.local}>
          <Text variant="small" tone="accent" style={s.bold}>
            Local test data. Nothing here reaches the real app.
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={s.gapTop}>
          <Callout tone="stop" icon={<AlertIcon />}>
            <Text variant="small" tone="muted">
              {error}
            </Text>
          </Callout>
        </View>
      ) : null}

      <SectionTitle>How you use Corridor</SectionTitle>
      <RoleSwitch driver={driver} blocked={blocked} onSwitch={confirmSwitch} />

      <SectionTitle>{driver ? 'Your usual drive' : 'Your usual ride'}</SectionTitle>
      <Commute driver={driver} />

      {driver ? (
        <>
          <SectionTitle>Your car</SectionTitle>
          <CarField />
        </>
      ) : null}

      <SectionTitle>Colleague check</SectionTitle>
      <Membership onError={setError} />

      <SectionTitle>Appearance</SectionTitle>
      <ModePicker />

      <Pressable
        onPress={() => router.push('/onboarding')}
        accessibilityRole="button"
        style={({ pressed }) => [s.card, s.introRow, pressed && s.pressed]}>
        <View style={s.iconTile}>
          <CarIcon size={20} tint={color.brandInk} />
        </View>
        <View style={s.flex}>
          <Text variant="body" style={s.bold}>
            How Corridor works
          </Text>
          <Text variant="small" tone="muted">
            Watch the three step intro again
          </Text>
        </View>
        <ChevronIcon />
      </Pressable>

      <Pressable
        onPress={confirmSignOut}
        accessibilityRole="button"
        style={({ pressed }) => [s.signOut, pressed && s.pressed]}>
        <Text variant="body" tone="stop" style={s.bold}>
          {USING_LOCAL ? 'Sign out, or switch test account' : 'Sign out'}
        </Text>
      </Pressable>

      <Text variant="small" tone="faint" style={s.foot}>
        A notice board between colleagues, not a transport service. Drivers and vehicles are not
        vetted, and no money changes hands. We keep your name, your work address and one usual
        place, and nothing about where you have been.
      </Text>
    </Screen>
  );
}

/** Who you are, on the plain page: avatar, name, login email, and two chips. */
function Profile({
  name,
  initials,
  email,
  driver,
}: {
  name: string;
  initials: string;
  email: string | null | undefined;
  driver: boolean;
}) {
  const { member } = useSession();
  return (
    <View style={s.profile}>
      <Avatar initials={initials} size={64} />
      <View style={s.flex}>
        <Text variant="title" numberOfLines={1}>
          {name}
        </Text>
        {email ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {email}
          </Text>
        ) : null}
        <View style={s.chips}>
          <View style={s.chip}>
            {driver ? <CarIcon size={13} tint={color.brandInk} /> : <PersonIcon size={13} tint={color.brandInk} />}
            <Text variant="small" tone="brand" style={s.chipText}>
              {driver ? 'Driver' : 'Rider'}
            </Text>
          </View>
          {member ? (
            <View style={[s.chip, s.chipGo]}>
              <CheckIcon size={13} />
              <Text variant="small" tone="go" style={s.chipText}>
                Verified
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * Riding or driving, as a two way switch. The side you are on is filled; the
 * other asks before it changes anything.
 */
function RoleSwitch({
  driver,
  blocked,
  onSwitch,
}: {
  driver: boolean;
  blocked: string | null;
  onSwitch: () => void;
}) {
  const options = [
    { key: 'rider', on: !driver, label: 'Ride', sub: 'Take a seat', Icon: PersonIcon },
    { key: 'driver', on: driver, label: 'Drive', sub: 'Offer seats', Icon: CarIcon },
  ];
  return (
    <>
      <View style={s.segment} accessibilityRole="radiogroup">
        {options.map(({ key, on, label, sub, Icon }) => (
          <Pressable
            key={key}
            onPress={on ? undefined : onSwitch}
            disabled={!on && Boolean(blocked)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: !on && Boolean(blocked) }}
            style={({ pressed }) => [
              s.segmentItem,
              on && s.segmentOn,
              !on && blocked ? s.dim : null,
              pressed && !on && s.pressed,
            ]}>
            <Icon size={20} tint={on ? color.onInk : color.inkMuted} />
            <View>
              <Text variant="body" tone={on ? 'onInk' : 'ink'} style={s.bold}>
                {label}
              </Text>
              <Text variant="small" tone={on ? 'onInk' : 'muted'} style={on ? s.segmentSubOn : null}>
                {sub}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {blocked ? (
        <Text variant="small" tone="faint" style={s.under}>
          {blocked}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The trip you make most evenings, drawn as one: the pickup, a line, and the
 * place you usually go. Tapping it changes the place.
 */
function Commute({ driver }: { driver: boolean }) {
  const router = useRouter();
  const { dropOff, landmarks } = useStore();
  const pickup = landmarks[0]?.name ?? 'The pickup point';
  const set = Boolean(dropOff?.name);

  return (
    <>
      <Pressable
        onPress={() => router.push('/find')}
        accessibilityRole="button"
        accessibilityLabel={driver ? 'Change where you usually go' : 'Change where you usually get off'}
        style={({ pressed }) => [s.card, s.commute, pressed && s.pressed]}>
        <View style={s.rail}>
          <View style={s.railStart} />
          <View style={s.railLine} />
          <View style={[s.railEnd, !set && s.railEndEmpty]}>
            <View style={s.railEndDot} />
          </View>
        </View>

        <View style={s.flex}>
          <Text variant="small" tone="faint">
            From
          </Text>
          <Text variant="body" style={s.bold} numberOfLines={1}>
            {pickup}
          </Text>
          <View style={s.commuteGap} />
          <Text variant="small" tone="faint">
            {driver ? 'Usually heading to' : 'Usually getting off at'}
          </Text>
          <Text variant="body" tone={set ? 'ink' : 'brand'} style={s.bold} numberOfLines={1}>
            {dropOff?.name ?? 'Add your usual place'}
          </Text>
        </View>

        <View style={s.changePill}>
          <Text variant="small" tone="brand" style={s.bold}>
            {set ? 'Change' : 'Add'}
          </Text>
        </View>
      </Pressable>
      <Text variant="small" tone="faint" style={s.under}>
        {driver
          ? 'Filled in each time you offer a ride. Change it on any one ride without touching this.'
          : 'Rides whose road passes close to it come first. Change it any evening from the home screen.'}
      </Text>
    </>
  );
}

/**
 * The work email behind your membership, and how long it has left. A bar
 * makes "we check again in 40 days" something you see rather than work out.
 */
function Membership({ onError }: { onError: (e: string) => void }) {
  const { membership, forgetWorkEmail } = useSession();
  const expires = membership?.expiresAt ? new Date(membership.expiresAt) : null;
  const daysLeft = expires ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / DAY_MS)) : 0;
  const share = Math.min(1, daysLeft / MEMBERSHIP_DAYS);

  function confirmLeave() {
    showDialog(
      'Remove your work email?',
      'You will need to confirm a work email again to use Corridor. Your account and your other apps are not affected.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await forgetWorkEmail();
            if (!result.ok) onError(result.error);
          },
        },
      ],
      'shield'
    );
  }

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.iconTile}>
          <ShieldIcon size={20} tint={color.brandInk} />
        </View>
        <View style={s.flex}>
          <Text variant="body" style={s.bold} numberOfLines={1}>
            {membership?.workEmail ?? 'No work email yet'}
          </Text>
          <Text variant="small" tone="muted">
            {expires
              ? `Next check ${expires.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
              : 'Confirm one to use Corridor'}
          </Text>
        </View>
        {expires ? (
          <View style={s.daysBadge}>
            <Text variant="small" tone="go" style={s.bold}>
              {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
            </Text>
          </View>
        ) : null}
      </View>

      {expires ? (
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.max(4, share * 100)}%` }]} />
        </View>
      ) : null}

      <View style={s.cardDivider} />

      <Pressable
        onPress={confirmLeave}
        accessibilityRole="button"
        style={({ pressed }) => [s.linkRow, pressed && s.pressed]}>
        <View style={s.flex}>
          <Text variant="body" tone="stop" style={s.bold}>
            I have left this job
          </Text>
          <Text variant="small" tone="muted">
            Your account stays. A new work email lets you back in.
          </Text>
        </View>
        <ChevronIcon />
      </Pressable>
    </View>
  );
}

/** What each theme tile shows: a tiny page with a header bar and two lines. */
const PREVIEWS: Record<'light' | 'dark', { bg: string; bar: string; line: string }> = {
  light: { bg: '#FFFFFF', bar: TEAL, line: '#E2ECEA' },
  dark: { bg: '#061A1E', bar: MINT, line: '#173F47' },
};

const MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
];

function Preview({ scheme }: { scheme: 'light' | 'dark' }) {
  const p = PREVIEWS[scheme];
  return (
    <View style={[s.previewHalf, { backgroundColor: p.bg }]}>
      <View style={[s.previewBar, { backgroundColor: p.bar }]} />
      <View style={[s.previewLine, { backgroundColor: p.line }]} />
      <View style={[s.previewLine, s.previewShort, { backgroundColor: p.line }]} />
    </View>
  );
}

/** Light, dark, or follow the phone, each tile a small picture of itself. Kept on this phone only. */
function ModePicker() {
  const { mode, setMode } = useTheme();
  return (
    <View style={s.modes} accessibilityRole="radiogroup">
      {MODES.map((m) => {
        const on = m.mode === mode;
        return (
          <Pressable
            key={m.mode}
            onPress={() => setMode(m.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={m.label}
            style={({ pressed }) => [s.mode, on && s.modeOn, pressed && s.pressed]}>
            <View style={s.preview}>
              {m.mode === 'system' ? (
                <>
                  <Preview scheme="light" />
                  <Preview scheme="dark" />
                </>
              ) : (
                <Preview scheme={m.mode} />
              )}
            </View>
            <View style={s.modeLabel}>
              <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
              <Text variant="small" style={s.bold}>
                {m.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const CAR_MAX = 30;

/**
 * How riders spot the car. Set once here and copied onto every ride posted,
 * so nobody types it at five thirty with their bag in one hand.
 */
function CarField() {
  const { me } = useStore();
  const { setCar } = useSession();
  const saved = me?.car ?? '';
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [focused, setFocused] = useState(false);
  const changed = draft.trim() !== saved;

  async function save() {
    if (!changed || busy) return;
    setBusy(true);
    setError(null);
    const result = await setCar(draft);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setJustSaved(true);
  }

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.iconTile}>
          <CarIcon size={20} tint={color.brandInk} />
        </View>
        <View style={s.flex}>
          <Text variant="body" style={s.bold}>
            {saved || 'Describe your car'}
          </Text>
          <Text variant="small" tone="muted">
            Only riders with a seat see it
          </Text>
        </View>
      </View>

      <View style={[s.inputWrap, focused && s.inputFocused, error ? s.inputError : null]}>
        <TextInput
          value={draft}
          onChangeText={(v) => {
            setDraft(v.slice(0, CAR_MAX));
            setJustSaved(false);
            if (error) setError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={CAR_MAX}
          placeholder="Silver Corolla, roof rack"
          placeholderTextColor={color.inkFaint}
          style={s.input}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Describe your car"
        />
        <Text variant="small" tone={draft.length >= CAR_MAX ? 'accent' : 'faint'}>
          {draft.length}/{CAR_MAX}
        </Text>
      </View>

      {error ? (
        <Text variant="small" tone="stop" style={s.cardNote}>
          {error}
        </Text>
      ) : changed ? (
        <View style={s.saveRow}>
          <Text variant="small" tone="faint" style={s.flex}>
            Colour, make, anything that stands out. No plate.
          </Text>
          <Pressable
            onPress={save}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [s.save, pressed && s.pressed]}>
            <Text variant="small" tone="onInk" style={s.bold}>
              {busy ? 'Saving' : 'Save'}
            </Text>
          </Pressable>
        </View>
      ) : justSaved ? (
        <View style={s.saveRow}>
          <CheckIcon size={16} />
          <Text variant="small" tone="go" style={s.bold}>
            Saved. Your next ride shows it.
          </Text>
        </View>
      ) : (
        <Text variant="small" tone="faint" style={s.cardNote}>
          Colour, make, anything that stands out. No plate.
        </Text>
      )}
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '600' },
    pressed: { opacity: 0.7 },
    dim: { opacity: 0.5 },
    gapTop: { marginTop: space.md },
    under: { marginTop: space.sm, paddingHorizontal: space.xs },

    // Profile
    profile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.lg,
      marginTop: space.sm,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: color.brandSoft,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: 4,
    },
    chipGo: { backgroundColor: color.goSoft },
    chipText: { fontWeight: '700' },

    local: {
      backgroundColor: color.accentSoft,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      marginTop: space.md,
    },

    // Role switch
    segment: {
      flexDirection: 'row',
      gap: space.xs,
      padding: space.xs,
      borderRadius: radius.xl,
      backgroundColor: color.sunken,
    },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      borderRadius: radius.lg,
    },
    segmentOn: {
      backgroundColor: color.brand,
      shadowColor: TEAL,
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    segmentSubOn: { opacity: 0.8 },

    // Cards
    card: {
      backgroundColor: color.surface,
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: radius.xl,
      padding: space.lg,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    cardNote: { marginTop: space.sm },
    cardDivider: { height: 1, backgroundColor: color.line, marginVertical: space.md },
    iconTile: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: color.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Commute
    commute: { flexDirection: 'row', alignItems: 'stretch', gap: space.lg },
    rail: { width: 16, alignItems: 'center', paddingVertical: 4 },
    railStart: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
      borderColor: color.brand,
      backgroundColor: color.surface,
    },
    railLine: { flex: 1, width: 2, backgroundColor: color.lineStrong, marginVertical: 4 },
    railEnd: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: MINT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    railEndEmpty: { backgroundColor: color.line },
    railEndDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL },
    commuteGap: { height: space.lg },
    changePill: {
      alignSelf: 'center',
      backgroundColor: color.brandSoft,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: 6,
    },

    // Membership
    daysBadge: {
      backgroundColor: color.goSoft,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: 4,
    },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: color.sunken,
      marginTop: space.lg,
      overflow: 'hidden',
    },
    fill: { height: 6, borderRadius: 3, backgroundColor: color.go },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl },

    // Car
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginTop: space.lg,
      backgroundColor: color.sunken,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: radius.lg,
      paddingHorizontal: space.lg,
    },
    inputFocused: { borderColor: color.brand, backgroundColor: color.surface },
    inputError: { borderColor: color.stop },
    input: {
      flex: 1,
      paddingVertical: space.md,
      fontSize: 16,
      fontFamily: font.sans,
      color: color.ink,
    },
    saveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
    save: {
      backgroundColor: color.brand,
      borderRadius: radius.pill,
      paddingHorizontal: space.xl,
      paddingVertical: space.sm,
    },

    // Appearance
    modes: { flexDirection: 'row', gap: space.sm },
    mode: {
      flex: 1,
      padding: space.sm,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: color.line,
      backgroundColor: color.surface,
    },
    modeOn: { borderColor: color.brand },
    preview: {
      flexDirection: 'row',
      height: 64,
      borderRadius: radius.sm,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: color.line,
    },
    previewHalf: { flex: 1, padding: 6, gap: 4 },
    previewBar: { height: 8, borderRadius: 3, width: '70%', marginBottom: 2 },
    previewLine: { height: 5, borderRadius: 3, width: '100%' },
    previewShort: { width: '55%' },
    modeLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: space.sm,
      paddingHorizontal: 2,
    },
    radio: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: color.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: color.brand },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand },

    // Footer
    signOut: {
      marginTop: space.xxl,
      alignItems: 'center',
      paddingVertical: space.lg,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: color.line,
      backgroundColor: color.surface,
    },
    foot: { marginTop: space.xl, textAlign: 'center', paddingHorizontal: space.md },
  })
);
