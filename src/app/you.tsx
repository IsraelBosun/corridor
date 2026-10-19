import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { USING_LOCAL } from '@/data/backend';
import { usePayout } from '@/data/payout';
import { useSession } from '@/data/session';
import { useStore } from '@/data/store';
import { useLastOrigin } from '@/lib/origin';
import { hasPhone, noPhones } from '@/lib/phones';
import { REMINDERS_UNAVAILABLE, remindersOn, setRemindersOn, syncReminders } from '@/lib/reminders';
import { useTheme, type ThemeMode } from '@/theme/theme';
import { color, font, GUTTER, LIME, PINE, radius, space, themed } from '@/theme/tokens';
import {
  AlertIcon,
  BackIcon,
  CarIcon,
  CheckIcon,
  ChevronIcon,
  PersonIcon,
  PlayIcon,
  ShieldIcon,
  SignOutIcon,
} from '@/ui/icons';
import { Avatar, Callout, Screen, SectionTitle, TileRow } from '@/ui/primitives';
import { BankPicker } from '@/ui/bank-picker';
import { showDialog } from '@/ui/dialog';
import { useStatusBand } from '@/ui/status-band';
import { Text } from '@/ui/text';

/* The header is pine in both themes, so its contents keep their own colours. */
const ON_PINE = '#F5F5F2';
const ON_PINE_MUTED = '#A9C2B6';
const PINE_RAISED = '#24493A';
const PINE_DEEP = '#0B2A20';

/** A work email is good for this long, then it is confirmed again. */
const MEMBERSHIP_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function YouScreen() {
  const router = useRouter();
  const { me, role, myTrip, mySeat } = useStore();
  const { email, signOut, deleteAccount, setRole, tester } = useSession();
  const [error, setError] = useState<string | null>(null);
  useStatusBand(PINE);

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

  function confirmDelete() {
    showDialog(
      'Delete your Corridor account?',
      'Your profile, rides, messages, bank details and company email are deleted for good. A private record of past rides is kept for safety for up to 90 days. Your login stays, because it also signs you in to our other apps.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            const result = await deleteAccount();
            if (!result.ok) setError(result.error);
          },
        },
      ],
      'alert'
    );
  }

  return (
    <Screen>
      <View style={s.head}>
        <View style={s.headBar}>
          <Pressable
            hitSlop={12}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.headBack, pressed && s.pressed]}>
            <BackIcon size={22} tint={ON_PINE} />
          </Pressable>
          <Text variant="heading" style={s.onPine}>
            Account
          </Text>
        </View>

        <Profile name={me?.name ?? 'You'} initials={me?.initials ?? '?'} email={email} driver={driver} />
        <RoleSwitch driver={driver} blocked={blocked} onSwitch={confirmSwitch} />
      </View>

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

      <SectionTitle>{driver ? 'Your usual drive' : 'Your usual ride'}</SectionTitle>
      <Commute driver={driver} />

      {driver ? (
        <>
          <SectionTitle>Your car</SectionTitle>
          <CarField />
          <SectionTitle>Bank details</SectionTitle>
          <PayoutField />
        </>
      ) : null}

      <SectionTitle>Company email</SectionTitle>
      <Membership onError={setError} />

      <SectionTitle>Reminders</SectionTitle>
      <Reminders driver={driver} />

      <SectionTitle>Appearance</SectionTitle>
      <ModePicker />

      <View style={[s.card, s.group]}>
        <Pressable
          onPress={() => router.push('/onboarding')}
          accessibilityRole="button"
          style={({ pressed }) => [s.groupRow, pressed && s.pressed]}>
          <PlayIcon size={22} tint={color.brandInk} />
          <Text variant="body" style={[s.flex, s.strong]}>
            How Corridor works
          </Text>
          <ChevronIcon />
        </Pressable>
        <View style={s.groupLine} />
        <Pressable
          onPress={() => router.push('/activity')}
          accessibilityRole="button"
          style={({ pressed }) => [s.groupRow, pressed && s.pressed]}>
          <ShieldIcon size={22} tint={color.brandInk} />
          <Text variant="body" style={[s.flex, s.strong]}>
            Your activity
          </Text>
          <ChevronIcon />
        </Pressable>
        <View style={s.groupLine} />
        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          style={({ pressed }) => [s.groupRow, pressed && s.pressed]}>
          <SignOutIcon size={22} />
          <Text variant="body" tone="stop" style={[s.flex, s.strong]}>
            {USING_LOCAL ? 'Sign out, or switch test account' : 'Sign out'}
          </Text>
        </Pressable>
        <View style={s.groupLine} />
        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          style={({ pressed }) => [s.groupRow, pressed && s.pressed]}>
          <AlertIcon />
          <Text variant="body" tone="stop" style={[s.flex, s.strong]}>
            Delete my account
          </Text>
        </Pressable>
      </View>

      <Text variant="small" tone="faint" style={s.foot}>
        A notice board between verified commuters, not a transport service. Drivers and vehicles are not
        vetted. Corridor never handles money: a fuel contribution, when a driver asks for one, goes
        straight from rider to driver. We keep your name, your work address, one usual place, a private
        record of the rides you take and what you do in Corridor, and the route of each ride while it is on
        the road, for safety. Routes are deleted after 90 days. Nobody else in Corridor sees any of it.
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
      <Avatar initials={initials} size={76} tone="me" />
      <View style={s.flex}>
        <Text variant="title" numberOfLines={1} style={s.onPine}>
          {name.split(' ')[0]}
        </Text>
        {email ? (
          <Text variant="small" numberOfLines={1} style={s.onPineMuted}>
            {email}
          </Text>
        ) : null}
        <View style={s.chips}>
          <View style={s.chip}>
            <Text variant="small" style={s.chipText}>
              {driver ? 'Driver' : 'Rider'}
            </Text>
          </View>
          {member ? (
            <View style={[s.chip, s.chipOutline]}>
              <CheckIcon size={13} tint={LIME} />
              <Text variant="small" style={[s.chipText, s.chipOutlineText]}>
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
            <Icon size={20} tint={on ? PINE : ON_PINE_MUTED} />
            <View>
              <Text variant="heading" style={on ? s.segmentOnText : s.onPine}>
                {label}
              </Text>
              <Text variant="small" style={on ? s.segmentOnSub : s.onPineMuted}>
                {sub}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {blocked ? (
        <Text variant="small" style={[s.under, s.onPineMuted]}>
          {blocked}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The trip you make most evenings, drawn as one: where it starts, a line, and
 * the place you usually go. Tapping it changes the place.
 */
function Commute({ driver }: { driver: boolean }) {
  const router = useRouter();
  const { dropOff } = useStore();
  // A driver's last starting point, from this phone. A rider starts wherever
  // their driver does, so there is nothing of theirs to show.
  const lastOrigin = useLastOrigin();
  const from = driver ? (lastOrigin?.name ?? 'Set when you offer a ride') : 'Wherever your driver starts';
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
          <View style={[s.railEnd, !set && s.railEndEmpty]} />
        </View>

        <View style={s.flex}>
          <Text variant="small" tone="muted">
            {driver ? 'From, set when you offer a ride' : 'From'}
          </Text>
          <Text variant="heading" tone={driver && lastOrigin ? 'ink' : 'muted'} numberOfLines={1}>
            {from}
          </Text>
          <View style={s.commuteGap} />
          <Text variant="small" tone="muted">
            {driver ? 'Usually heading to' : 'Usually getting off at'}
          </Text>
          <Text variant="heading" tone={set ? 'ink' : 'brand'} numberOfLines={1}>
            {dropOff?.name ?? 'Add your usual place'}
          </Text>
        </View>

        <View style={s.changePill}>
          <Text variant="body" style={s.strong}>
            {set ? 'Change' : 'Add'}
          </Text>
        </View>
      </Pressable>
      <Text variant="small" tone="faint" style={s.under}>
        {driver
          ? 'Tap to change where you usually head. It is filled in each time you offer a ride, and you can change either end on any one ride.'
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
      'Remove your company email?',
      'You will need to confirm a company email again to use Corridor. Your account and your other apps are not affected.',
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
          <ShieldIcon size={22} tint={LIME} />
        </View>
        <View style={s.flex}>
          <Text variant="body" style={s.strong} numberOfLines={1}>
            {membership?.workEmail ?? 'No company email yet'}
          </Text>
          <Text variant="small" tone="muted">
            {expires
              ? `Next check ${expires.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
              : 'Confirm one to use Corridor'}
          </Text>
        </View>
        {expires ? (
          <Text
            variant="dataLarge"
            tone="brand"
            accessibilityLabel={daysLeft === 1 ? '1 day left' : daysLeft + ' days left'}>
            {daysLeft}d
          </Text>
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
          <Text variant="body" tone="stop" style={s.strong}>
            I have left this job
          </Text>
          <Text variant="small" tone="muted">
            Your account stays. A new company email lets you back in.
          </Text>
        </View>
        <ChevronIcon />
      </Pressable>
    </View>
  );
}

const MODES: ThemeMode[] = ['light', 'dark', 'system'];
const MODE_LABEL: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

/** Light, dark, or follow the phone. Kept on this phone only. */
/**
 * The 15:00 weekday nudge, on or off. If the phone has notifications blocked
 * for Corridor, say so and offer the way to the phone's settings, since the
 * app cannot ask a second time.
 */
function Reminders({ driver }: { driver: boolean }) {
  // Unknown until the phone has said, so the switch never shows one state and
  // then jumps to the other.
  const [on, setOn] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const role = driver ? 'driver' : 'passenger';

  useEffect(() => {
    remindersOn().then(setOn);
  }, []);

  async function toggle(next: boolean) {
    setOn(next);
    await setRemindersOn(next);
    const result = await syncReminders(role);
    setBlocked(result === 'denied');
  }

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.flex}>
          <Text variant="body" style={s.strong}>
            Weekday nudge at 15:00
          </Text>
          <Text variant="small" tone="muted">
            {driver ? 'A reminder to post your ride home.' : 'A reminder to look for a ride home.'}
          </Text>
        </View>
        {on === null ? (
          <View style={s.switchSpace} />
        ) : (
          <Switch
            value={on}
            onValueChange={toggle}
            trackColor={{ false: color.lineStrong, true: color.brand }}
            thumbColor={color.surface}
            accessibilityLabel="Weekday reminder at 15:00"
          />
        )}
      </View>
      {REMINDERS_UNAVAILABLE ? (
        <Text variant="small" tone="muted" style={s.cardNote}>
          Reminders only work in the installed app, not in Expo Go or a browser.
        </Text>
      ) : blocked ? (
        <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" style={s.cardNote}>
          <Text variant="small" tone="stop">
            Notifications are off for Corridor on this phone.{' '}
            <Text variant="small" tone="brand" style={s.strong}>
              Open settings
            </Text>
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ModePicker() {
  const { mode, setMode } = useTheme();
  return <TileRow options={MODES} value={mode} onChange={setMode} render={(m) => MODE_LABEL[m]} />;
}

/**
 * Where riders send a fuel contribution by transfer. Set once, used on every
 * paid ride, and required for one: the database refuses a paid ride without
 * it. It shows them only to riders holding a seat on this driver's paid ride
 * tonight.
 */
function PayoutField() {
  const { me } = useStore();
  const { payout, loading, save } = usePayout(me?.id);
  const [editing, setEditing] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setBankName(payout?.bankName ?? '');
    setAccountNumber(payout?.accountNumber ?? '');
    setAccountName(payout?.accountName ?? me?.name ?? '');
    setError(null);
    setEditing(true);
  }

  const problem =
    bankName.trim().length < 2
      ? 'Choose your bank.'
      : !/^[0-9]{10}$/.test(accountNumber)
        ? 'An account number is ten digits.'
        : accountName.trim().length < 2
          ? 'Give the name on the account.'
          : null;

  async function onSave() {
    if (problem || busy) return;
    setBusy(true);
    const failed = await save({ bankName, accountNumber, accountName });
    setBusy(false);
    if (failed) setError(failed);
    else setEditing(false);
  }

  function confirmRemove() {
    showDialog(
      'Remove your bank details?',
      'You will need to add them again before your next paid ride.',
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const failed = await save(null);
            if (failed) setError(failed);
          },
        },
      ]
    );
  }

  if (loading) return <View style={s.card} />;

  if (!editing) {
    return (
      <View style={s.card}>
        {payout ? (
          <>
            <Text variant="small" tone="muted">
              {payout.bankName}
            </Text>
            <Text variant="dataLarge" selectable style={s.accountNumber}>
              {payout.accountNumber}
            </Text>
            <Text variant="body" style={s.strong}>
              {payout.accountName}
            </Text>
            <View style={s.saveRow}>
              <Pressable onPress={startEdit} accessibilityRole="button" style={({ pressed }) => [s.save, pressed && s.pressed]}>
                <Text variant="small" tone="onAccent" style={s.bold}>
                  Change
                </Text>
              </Pressable>
              <Pressable onPress={confirmRemove} accessibilityRole="button" hitSlop={8}>
                <Text variant="small" tone="stop" style={s.bold}>
                  Remove
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable onPress={startEdit} accessibilityRole="button" style={s.linkRow}>
            <View style={s.flex}>
              <Text variant="body" style={s.strong}>
                Add an account for transfers
              </Text>
              <Text variant="small" tone="muted">
                Needed before you ask riders for a fuel contribution.
              </Text>
            </View>
            <ChevronIcon />
          </Pressable>
        )}
        {error ? (
          <Text variant="small" tone="stop" style={s.cardNote}>
            {error}
          </Text>
        ) : null}
        <Text variant="small" tone="faint" style={s.cardNote}>
          Only riders holding a seat on your paid ride see this, and only that evening. Corridor
          never handles the money.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <Text variant="eyebrow">Bank</Text>
      <BankPicker value={bankName} onChange={setBankName} />

      <Text variant="eyebrow" style={s.gapTop}>
        Account number
      </Text>
      <View style={s.inputWrap}>
        <TextInput
          value={accountNumber}
          onChangeText={(v) => setAccountNumber(v.replace(/[^0-9]/g, '').slice(0, 10))}
          placeholder="Ten digits"
          placeholderTextColor={color.inkFaint}
          style={s.input}
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel="Account number"
        />
        <Text variant="small" tone="faint">
          {accountNumber.length}/10
        </Text>
      </View>

      <Text variant="eyebrow" style={s.gapTop}>
        Name on the account
      </Text>
      <View style={s.inputWrap}>
        <TextInput
          value={accountName}
          onChangeText={(v) => setAccountName(v.slice(0, 60))}
          placeholder="As the bank shows it"
          placeholderTextColor={color.inkFaint}
          style={s.input}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onSave}
          accessibilityLabel="Name on the account"
        />
      </View>

      {error ? (
        <Text variant="small" tone="stop" style={s.cardNote}>
          {error}
        </Text>
      ) : null}

      <View style={s.saveRow}>
        <Text variant="small" tone="faint" style={s.flex}>
          {problem ?? 'Riders check the name before they send.'}
        </Text>
        <Pressable onPress={() => setEditing(false)} accessibilityRole="button" hitSlop={8}>
          <Text variant="small" tone="muted" style={s.bold}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={Boolean(problem) || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(problem) || busy }}
          style={({ pressed }) => [s.save, (problem || busy) && s.dim, pressed && s.pressed]}>
          <Text variant="small" tone="onAccent" style={s.bold}>
            {busy ? 'Saving' : 'Save'}
          </Text>
        </Pressable>
      </View>
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
    if (hasPhone(draft)) {
      setError(noPhones('the car description'));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setCar(draft);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setJustSaved(true);
  }

  return (
    <View style={s.card}>
      <Text variant="eyebrow">What riders look for</Text>

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
            <Text variant="small" tone="onAccent" style={s.bold}>
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
        <Text variant="small" tone="muted" style={s.cardNote}>
          Colour, make, anything that stands out. No plate. Only riders with a seat see it.
        </Text>
      )}
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '600' },
    strong: { fontWeight: '700' },
    pressed: { opacity: 0.7 },
    dim: { opacity: 0.5 },
    gapTop: { marginTop: space.md },
    under: { marginTop: space.sm, paddingHorizontal: space.xs },
    onPine: { color: ON_PINE },
    onPineMuted: { color: ON_PINE_MUTED },

    // The pine header, edge to edge under the status bar.
    head: {
      backgroundColor: PINE,
      marginHorizontal: -GUTTER,
      paddingHorizontal: GUTTER,
      paddingTop: space.lg,
      paddingBottom: space.xl,
      borderBottomLeftRadius: 32,
      borderBottomRightRadius: 32,
      gap: space.xl,
    },
    headBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    headBack: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: PINE_RAISED,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Profile
    profile: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: LIME,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: 3,
    },
    chipText: { color: PINE, fontWeight: '800', fontSize: 13 },
    chipOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#4C7A66' },
    chipOutlineText: { color: LIME },

    local: {
      backgroundColor: color.accentSoft,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      marginTop: space.md,
    },

    // Role switch, on the pine header
    segment: {
      flexDirection: 'row',
      gap: space.xs,
      padding: space.xs,
      borderRadius: radius.xl,
      backgroundColor: PINE_DEEP,
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
    segmentOn: { backgroundColor: ON_PINE },
    segmentOnText: { color: PINE },
    segmentOnSub: { color: '#5D6A63' },

    // Cards
    card: {
      backgroundColor: color.surface,
      borderRadius: radius.xl,
      padding: space.lg,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    cardNote: { marginTop: space.md },
    cardDivider: { height: 1, backgroundColor: color.line, marginVertical: space.lg },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: PINE,
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
    railLine: {
      flex: 1,
      width: 0,
      borderLeftWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: color.inkFaint,
      marginVertical: 4,
    },
    railEnd: {
      width: 14,
      height: 14,
      borderRadius: 4,
      backgroundColor: LIME,
      borderWidth: 2,
      borderColor: PINE,
    },
    railEndEmpty: { backgroundColor: color.line, borderColor: color.lineStrong },
    commuteGap: { height: space.lg },
    changePill: {
      alignSelf: 'center',
      backgroundColor: color.sunken,
      borderRadius: radius.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },

    // Membership
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: color.sunken,
      marginTop: space.lg,
      overflow: 'hidden',
    },
    fill: { height: 8, borderRadius: 4, backgroundColor: color.brand },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    switchSpace: { width: 52, height: 32 },
    accountNumber: { letterSpacing: 1.5, marginVertical: space.xs },

    // Car
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginTop: space.md,
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
      paddingVertical: space.lg,
      fontSize: 16,
      fontFamily: font.sans,
      color: color.ink,
    },
    saveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
    save: {
      backgroundColor: color.accent,
      borderRadius: radius.pill,
      paddingHorizontal: space.xl,
      paddingVertical: space.sm,
    },

    // How it works and sign out
    group: { marginTop: space.xl, paddingVertical: 0 },
    groupRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
    groupLine: { height: 1, backgroundColor: color.line },

    foot: { marginTop: space.xl, textAlign: 'center', paddingHorizontal: space.md },
  })
);
