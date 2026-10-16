import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BANKS, FINTECHS } from '@/lib/banks';
import { color, font, GUTTER, radius, space, themed } from '@/theme/tokens';
import { BackIcon, CheckIcon, ChevronIcon, CloseIcon, SearchIcon } from './icons';
import { StatusBand } from './status-band';
import { Text } from './text';

/**
 * The bank field: a row that opens a searchable list of banks and fintechs.
 * Searching rather than a plain dropdown, because there are sixty of them and
 * people know the one they want by name. A bank that is not listed can still
 * be used, as typed.
 */
export function BankPicker({ value, onChange }: { value: string; onChange: (bank: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const banks = BANKS.filter(match);
  const fintechs = FINTECHS.filter(match);
  const listed = [...BANKS, ...FINTECHS].some((b) => b.toLowerCase() === q);
  const typed = query.trim().slice(0, 40);

  function pick(bank: string) {
    onChange(bank);
    setOpen(false);
    setQuery('');
  }

  function row(name: string) {
    const on = name === value;
    return (
      <Pressable
        key={name}
        onPress={() => pick(name)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={({ pressed }) => [s.row, pressed && s.pressed]}>
        <Text variant="body" style={[s.flex, on && s.bold]}>
          {name}
        </Text>
        {on ? <CheckIcon size={18} tint={color.brandInk} /> : null}
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `Bank, ${value}. Change` : 'Choose your bank'}
        style={({ pressed }) => [s.field, pressed && s.pressed]}>
        <Text variant="body" tone={value ? 'ink' : 'faint'} numberOfLines={1} style={s.flex}>
          {value || 'Choose your bank'}
        </Text>
        <ChevronIcon tint={color.inkMuted} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
          <View style={s.bar}>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={s.back}>
              <BackIcon />
            </Pressable>
            <View style={s.search}>
              <SearchIcon size={18} tint={color.brand} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                style={s.input}
                placeholder="Search banks and fintechs"
                placeholderTextColor={color.inkFaint}
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (banks.length + fintechs.length === 1) pick([...banks, ...fintechs][0]);
                }}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear">
                  <CloseIcon size={18} tint={color.inkMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
            {banks.length > 0 ? (
              <>
                <Text variant="kicker" tone="muted" style={s.section}>
                  Banks
                </Text>
                {banks.map(row)}
              </>
            ) : null}

            {fintechs.length > 0 ? (
              <>
                <Text variant="kicker" tone="muted" style={s.section}>
                  Fintechs and microfinance
                </Text>
                {fintechs.map(row)}
              </>
            ) : null}

            {/* Not every bank is on the list. Use it as typed. */}
            {typed.length >= 2 && !listed ? (
              <Pressable
                onPress={() => pick(typed)}
                accessibilityRole="button"
                style={({ pressed }) => [s.row, s.custom, pressed && s.pressed]}>
                <Text variant="body" tone="brand" style={[s.flex, s.bold]}>
                  Use &quot;{typed}&quot;
                </Text>
              </Pressable>
            ) : null}

            {banks.length + fintechs.length === 0 && typed.length < 2 ? (
              <Text variant="small" tone="muted" style={s.section}>
                Type the name of your bank.
              </Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
        <StatusBand />
      </Modal>
    </>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '700' },
    pressed: { opacity: 0.6 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginTop: space.md,
      backgroundColor: color.sunken,
      borderRadius: radius.lg,
      paddingHorizontal: space.lg,
      paddingVertical: space.lg,
    },
    screen: { flex: 1, backgroundColor: color.bg },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingHorizontal: GUTTER - space.sm,
      paddingTop: space.sm,
      paddingBottom: space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: color.line,
    },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    search: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: color.surface,
      borderWidth: 1.5,
      borderColor: color.brand,
      borderRadius: radius.pill,
      paddingHorizontal: space.lg,
      minHeight: 50,
    },
    input: { flex: 1, fontSize: 16, fontFamily: font.sans, color: color.ink, paddingVertical: space.sm },
    list: { paddingHorizontal: GUTTER, paddingBottom: space.xxl },
    section: { paddingTop: space.lg, paddingBottom: space.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: 52,
      paddingVertical: space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: color.line,
    },
    custom: { borderBottomWidth: 0, marginTop: space.sm },
  })
);
