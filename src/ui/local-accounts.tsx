import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { localTools, type LocalAccount } from '@/data/backend/local';
import type { Role } from '@/data/types';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AlertIcon } from './icons';
import { Avatar, Button, Callout, Screen, SectionTitle } from './primitives';
import { showDialog } from './dialog';
import { Text } from './text';

/**
 * The sign in screen, when the app runs on the local test database.
 *
 * Testing this app means being two people: a driver who posts, and a
 * passenger who takes the seat. So accounts are made here in one step, and
 * any of them is one tap away. Sign out from Account comes back here, which
 * is how you switch sides.
 */
export function LocalAccounts() {
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('passenger');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setAccounts(await localTools.listAccounts());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const acc = await localTools.createAccount({ name, role });
      setName('');
      // Straight in. The session appears and the app swaps to the map.
      await localTools.signInAs(acc.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that account.');
      setBusy(false);
    }
  }

  function remove(acc: LocalAccount) {
    showDialog(`Remove ${acc.name}?`, 'Their rides, seats and messages go too.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await localTools.deleteAccount(acc.id);
          load();
        },
      },
    ]);
  }

  function resetAll() {
    showDialog('Reset all test data?', 'Every test account, ride and message on this phone is deleted.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await localTools.resetAll();
          load();
        },
      },
    ]);
  }

  const drivers = accounts.filter((a) => a.role === 'driver');
  const passengers = accounts.filter((a) => a.role === 'passenger');

  return (
    <Screen>
      <View style={s.top}>
        <Text variant="heading" tone="muted">
          Corridor
        </Text>
        <View style={s.badge}>
          <Text variant="small" tone="accent" style={s.bold}>
            Local test data
          </Text>
        </View>
      </View>

      <Text variant="display">Who are you testing as?</Text>
      <Text variant="body" tone="muted" style={s.sub}>
        Tap an account to sign in. Sign out from Account to come back and switch.
      </Text>

      {accounts.length === 0 ? (
        <Text variant="small" tone="muted" style={s.none}>
          No test accounts yet. Make a car owner and a passenger below.
        </Text>
      ) : null}

      {[
        { title: 'Car owners', list: drivers },
        { title: 'Passengers', list: passengers },
      ].map((group) =>
        group.list.length > 0 ? (
          <View key={group.title}>
            <SectionTitle>{group.title}</SectionTitle>
            {group.list.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => localTools.signInAs(a.id)}
                onLongPress={() => remove(a)}
                accessibilityRole="button"
                accessibilityHint="Long press to remove"
                style={({ pressed }) => [s.account, pressed && s.pressed]}>
                <Avatar initials={a.initials} size={44} tone="person" />
                <View style={s.flex}>
                  <Text variant="body" style={s.bold}>
                    {a.name}
                  </Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {a.email}
                  </Text>
                </View>
                <Text variant="small" tone="accent" style={s.bold}>
                  Sign in
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null
      )}

      <SectionTitle>New test account</SectionTitle>
      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(null);
        }}
        style={s.input}
        placeholder="Name, like Ada Obi"
        placeholderTextColor={color.inkFaint}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
      />
      <View style={s.segment}>
        {(['passenger', 'driver'] as const).map((r) => {
          const on = role === r;
          return (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[s.segmentItem, on && s.segmentOn]}>
              <Text variant="body" tone={on ? 'ink' : 'muted'} style={s.bold}>
                {r === 'passenger' ? 'Passenger' : 'Car owner'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Callout tone="stop" icon={<AlertIcon />}>
          <Text variant="small" tone="muted">
            {error}
          </Text>
        </Callout>
      ) : null}

      <Button
        label={busy ? 'Creating' : 'Create and sign in'}
        onPress={create}
        disabled={busy || name.trim().length < 2}
        style={s.create}
      />

      {accounts.length > 0 ? (
        <Button label="Reset all test data" kind="danger" onPress={resetAll} style={s.reset} />
      ) : null}
    </Screen>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.6 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  badge: {
    backgroundColor: color.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  sub: { marginTop: space.sm },
  none: { paddingTop: space.lg },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  input: {
    backgroundColor: color.sunken,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: font.sans,
    color: color.ink,
    marginTop: space.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: color.sunken,
    borderRadius: radius.md,
    padding: 4,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm },
  segmentOn: {
    backgroundColor: color.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  create: { marginTop: space.sm },
  reset: { marginTop: space.xl },
  })
);
