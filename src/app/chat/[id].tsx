import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTripChat } from '@/data/chat';
import { endName, useStore, useTrip } from '@/data/store';
import { hhmm } from '@/lib/time';
import { color, font, GUTTER, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ArrowIcon, LockIcon } from '@/ui/icons';
import { Avatar, Callout, ScreenHeader } from '@/ui/primitives';
import { Text } from '@/ui/text';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { person, me } = useStore();
  const trip = useTrip(id);
  const { messages, loading, error, send, clearError } = useTripChat(id, me?.id);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    // New message, so follow it down. Chat that does not do this makes people
    // think it is broken.
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length]);

  async function onSend() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = await send(draft);
    setSending(false);
    if (ok) setDraft('');
  }

  if (!trip) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <View style={s.pad}>
          <ScreenHeader eyebrow="Trip chat" />
          <Text variant="title">This trip is gone.</Text>
          <Text variant="body" tone="muted" style={s.gap}>
            The chat went with it. Nothing is kept once a trip is over.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const onThisTrip = me ? trip.driverId === me.id || trip.riders.includes(me.id) : false;

  if (!onThisTrip) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <View style={s.pad}>
          <ScreenHeader eyebrow={`Trip ${trip.code}`} />
          <Text variant="title">Not your chat.</Text>
          <Text variant="body" tone="muted" style={s.gap}>
            A trip chat is only the driver and the people holding a seat. Take a
            seat on this trip and it opens.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <View style={s.pad}>
          <ScreenHeader eyebrow={`Trip ${trip.code}`} />
        </View>

        <ScrollView
          ref={scroller}
          style={s.flex}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}>
          <Callout icon={<LockIcon />}>
            <Text variant="small" tone="muted">
              Only {person(trip.driverId).name.split(' ')[0]} and the people
              holding a seat can read this. It disappears with the trip tonight,
              and phone numbers cannot be sent here.
            </Text>
          </Callout>

          {loading ? (
            <Text variant="small" tone="faint" style={s.status}>
              Loading
            </Text>
          ) : messages.length === 0 ? (
            <Text variant="small" tone="faint" style={s.status}>
              Nothing said yet. Most trips never need a word, which is the point.
            </Text>
          ) : null}

          {messages.map((m) => {
            const mine = m.authorId === me?.id;
            const who = person(m.authorId);
            return (
              <View key={m.id} style={[s.row, mine ? s.rowMine : null]}>
                {!mine ? <Avatar initials={who.initials} size={34} /> : null}
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                  {!mine ? (
                    <Text variant="small" tone="faint" style={s.who}>
                      {who.name.split(' ')[0]}
                      {trip.driverId === m.authorId ? ', driving' : ''}
                    </Text>
                  ) : null}
                  <Text variant="body" tone={mine ? 'onInk' : 'ink'}>
                    {m.body}
                  </Text>
                  <Text
                    variant="small"
                    tone={mine ? 'onInk' : 'faint'}
                    style={[s.time, m.pending ? s.pending : null]}>
                    {m.pending ? 'sending' : hhmm(m.atMin)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {error ? (
          <Pressable onPress={clearError} style={s.errorBar}>
            <AlertIcon />
            <Text variant="small" tone="muted" style={s.flex}>
              {error}
            </Text>
          </Pressable>
        ) : null}

        <View style={s.composer}>
          <TextInput
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              if (error) clearError();
            }}
            style={s.input}
            placeholder={`Running late? Tell ${person(trip.driverId).name.split(' ')[0]}`}
            placeholderTextColor={color.inkFaint}
            multiline
            maxLength={500}
            accessibilityLabel="Your message"
          />
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [
              s.sendButton,
              (!draft.trim() || sending) && s.sendDisabled,
              pressed && s.pressed,
            ]}>
            <ArrowIcon tint={color.onInk} />
          </Pressable>
        </View>

        <Text variant="small" tone="faint" style={s.footNote}>
          Closes when the trip reaches {endName(trip)}.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: GUTTER },
  gap: { marginTop: space.md },
  list: { paddingHorizontal: GUTTER, paddingBottom: space.lg, gap: space.md },
  status: { marginTop: space.xl, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, padding: space.md },
  bubbleTheirs: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  bubbleMine: { backgroundColor: color.brand },
  who: { marginBottom: space.xs },
  time: { marginTop: space.xs, opacity: 0.7 },
  pending: { fontStyle: 'italic' },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.stopSoft,
    paddingHorizontal: GUTTER,
    paddingVertical: space.md,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: GUTTER,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 16,
    fontFamily: font.sans,
    color: color.ink,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.3 },
  pressed: { opacity: 0.7 },
  footNote: { paddingHorizontal: GUTTER, paddingVertical: space.md },
  })
);
