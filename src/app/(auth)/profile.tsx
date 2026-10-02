import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useSession } from '@/data/session';
import type { Role } from '@/data/types';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ShieldIcon } from '@/ui/icons';
import { Avatar, Button, Callout, Field, Screen } from '@/ui/primitives';
import { Text } from '@/ui/text';

/** "Israel Olatunbosun" becomes IO. Two letters, no photo, ever. */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileSetupScreen() {
  const { email, saveProfile, signOut, profileError } = useSession();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('passenger');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = initialsFrom(name);
  const ready = name.trim().length > 2 && initials.length >= 2;

  async function onSave() {
    setBusy(true);
    setError(null);
    const result = await saveProfile({ name: name.trim(), initials, role });
    setBusy(false);
    if (!result.ok) setError(result.error);
    // On success the profile appears, the root layout swaps, and the tabs open.
  }

  return (
    <Screen
      footer={
        <Button
          label={busy ? 'Saving' : 'Done'}
          onPress={onSave}
          disabled={!ready || busy}
          arrow={!busy}
        />
      }>
      <View style={s.top}>
        <Text variant="eyebrow" tone="brand">
          Last step
        </Text>
      </View>

      <Text variant="display" style={s.headline}>
        How should people recognise you at the gate?
      </Text>
      <Text variant="body" tone="muted" style={s.sub}>
        Enough to find each other in a car park, and nothing more. There are no
        photos here and there never will be.
      </Text>

      <View style={s.preview}>
        <Avatar initials={initials || '??'} size={64} tone={initials ? 'person' : 'sunken'} />
        <View style={s.previewText}>
          <Text variant="heading">
            {name.trim() || 'Your name'}
          </Text>
          <Text variant="small" tone="faint">
            {email}
          </Text>
        </View>
      </View>

      <Field label="Your name" hint="A first name and a surname initial is plenty.">
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (error) setError(null);
          }}
          style={s.input}
          placeholder="Israel O."
          placeholderTextColor={color.inkFaint}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </Field>

      {/*
        Asked once here rather than every evening on the corridor screen. It is
        not a permission: a driver can still take somebody's spare seat and a
        passenger who borrows a car can still post. It only decides what the
        app puts in front of you first.
      */}
      <Field
        label="Most evenings you are"
        hint="You can change this any time in your account.">
        <View style={s.roles}>
          {(['passenger', 'driver'] as const).map((r) => {
            const on = role === r;
            return (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  s.role,
                  on ? s.roleOn : s.roleOff,
                  pressed && s.pressed,
                ]}>
                <Text variant="heading" tone={on ? 'onInk' : 'ink'}>
                  {r === 'passenger' ? 'Looking for a seat' : 'Driving'}
                </Text>
                <Text variant="small" tone={on ? 'onInk' : 'faint'} style={s.roleSub}>
                  {r === 'passenger'
                    ? 'You will see who is going your way'
                    : 'You will be asked to post your trip'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {/*
        Team, floor and where you get off used to be here. They are all things
        you can add on the You tab in ten seconds, and asking for them before
        anybody has seen the app is how a sign up screen turns into a form.

        Where you get off was worse than slow. It went into a column with a
        foreign key on it, and pressing Done without choosing a stop sent an
        empty string, which the database rejected outright. The screen then sat
        there looking like it had ignored you.
      */}

      {profileError ? (
        <Callout tone="stop" icon={<AlertIcon />}>
          <Text variant="small" tone="muted">
            {profileError} This may be an existing profile that could not be
            read rather than a new account. Worth another try before typing
            everything again.
          </Text>
        </Callout>
      ) : null}

      {error ? (
        <Callout tone="stop" icon={<AlertIcon />}>
          <Text variant="small" tone="muted">
            {error}
          </Text>
        </Callout>
      ) : null}

      {busy ? <ActivityIndicator style={s.spinner} color={color.inkFaint} /> : null}

      <Callout icon={<ShieldIcon />}>
        <Text variant="small" tone="muted">
          A name and two initials is all this asks for. No photo, no phone
          number, and no trail of where you have been: today is the only
          evening this app knows about.
        </Text>
      </Callout>

      <View style={s.out}>
        <Button label="Sign out" kind="quiet" onPress={signOut} />
      </View>
    </Screen>
  );
}

const s = themed(() =>
  StyleSheet.create({
  top: { paddingTop: space.xl, paddingBottom: space.lg },
  headline: { marginBottom: space.lg },
  sub: { marginBottom: space.xl },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginBottom: space.xl,
  },
  previewText: { flex: 1 },
  input: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    fontSize: 16,
    fontFamily: font.sans,
    color: color.ink,
  },
  roles: { gap: space.sm },
  role: {
    minHeight: 96,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  roleOn: { backgroundColor: color.brand, borderColor: color.brand },
  roleOff: { backgroundColor: color.surface, borderColor: color.line },
  roleSub: { marginTop: space.xs },
  pressed: { opacity: 0.8 },
  stops: { gap: space.sm },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  stopOn: { backgroundColor: color.accentSoft, borderColor: color.accent },
  stopOff: { backgroundColor: color.surface, borderColor: color.line },
  spinner: { marginTop: space.md },
  out: { marginTop: space.lg, alignItems: 'flex-start' },
  })
);
