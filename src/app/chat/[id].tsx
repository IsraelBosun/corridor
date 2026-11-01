import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTripChat } from '@/data/chat';
import { bookable, seatsOpen, useStore, useTrip } from '@/data/store';
import { naira } from '@/lib/config';
import { setOpenChat } from '@/lib/reminders';
import { clock } from '@/lib/time';
import { color, font, GUTTER, radius, space, themed } from '@/theme/tokens';
import { AlertIcon, ArrowIcon, LockIcon } from '@/ui/icons';
import { Avatar, Button, Callout, ScreenHeader } from '@/ui/primitives';
import { Text } from '@/ui/text';

export default function ChatScreen() {
  // "with" is the rider whose questions these are. Without it, a rider who
  // has not booked is asking, and everyone else is in the group chat.
  const { id, with: withId } = useLocalSearchParams<{ id: string; with?: string }>();
  const router = useRouter();
  const { person, me, role, dropOff, reserve, loading: tripsLoading } = useStore();
  const trip = useTrip(id);
  const onThisTrip = trip && me ? trip.driverId === me.id || trip.riders.includes(me.id) : false;
  const askerId = withId || (trip && me && !onThisTrip ? me.id : undefined);
  const { messages, loading, error, send, clearError } = useTripChat(id, me?.id, askerId);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookFailed, setBookFailed] = useState(false);
  const scroller = useRef<ScrollView>(null);

  // While this chat is on screen, its new messages arrive here, not as a push banner.
  const chatKey = askerId ? `${id}?with=${askerId}` : id;
  useFocusEffect(
    useCallback(() => {
      setOpenChat(chatKey);
      return () => setOpenChat(null);
    }, [chatKey]),
  );

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
          {/* Opened cold, the rides have not arrived yet. That is not "gone". */}
          {tripsLoading ? (
            <ActivityIndicator color={color.inkFaint} />
          ) : (
            <>
              <Text variant="title">This trip is gone.</Text>
              <Text variant="body" tone="muted" style={s.gap}>
                It is no longer on the map.
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const driverFirst = person(trip.driverId).name.split(' ')[0];
  const question = Boolean(askerId);
  const iAmAsking = question && askerId === me?.id;
  const askerFirst = askerId ? person(askerId).name.split(' ')[0] : '';
  const allowed = question ? iAmAsking || trip.driverId === me?.id : onThisTrip;
  const closed = question && trip.status !== 'posted' && trip.status !== 'boarding';
  // A rider asking can book from here, once the answer is what they hoped.
  const canBookHere =
    iAmAsking && !trip.riders.includes(me!.id) && role !== 'driver' && bookable(trip) && seatsOpen(trip) > 0;

  async function onBook() {
    setBooking(true);
    setBookFailed(false);
    const ok = await reserve(trip!.id);
    setBooking(false);
    if (ok) router.replace({ pathname: '/trip/[id]', params: { id: trip!.id } });
    else setBookFailed(true);
  }

  if (!allowed) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <View style={s.pad}>
          <ScreenHeader eyebrow={`Trip ${trip.code}`} />
          <Text variant="title">Not your chat.</Text>
          <Text variant="body" tone="muted" style={s.gap}>
            A trip chat is only the car owner and the people holding a seat. Take a
            seat on this trip and it opens.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      {/*
        Padding on both platforms. The app draws edge to edge, so on Android
        the window no longer shrinks for the keyboard and the composer would
        sit underneath it.
      */}
      <KeyboardAvoidingView style={s.flex} behavior="padding">
        <View style={s.pad}>
          <ScreenHeader eyebrow={question ? (iAmAsking ? `Ask ${driverFirst}` : `Question from ${askerFirst}`) : `Trip ${trip.code}`} />
        </View>

        <ScrollView
          ref={scroller}
          style={s.flex}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}>
          <Callout icon={<LockIcon />} flush>
            <Text variant="small" tone="muted">
              {question
                ? `Only you and ${iAmAsking ? driverFirst : askerFirst} can read this. Phone numbers cannot be sent here.`
                : `Only ${driverFirst} and the people holding a seat can read this. Phone numbers cannot be sent here.`}
            </Text>
          </Callout>

          {loading ? (
            <Text variant="small" tone="faint" style={s.status}>
              Loading
            </Text>
          ) : messages.length === 0 ? (
            <Text variant="small" tone="faint" style={s.status}>
              {iAmAsking
                ? 'Ask about the pickup spot, the time, or anything else before you book.'
                : 'Nothing said yet. Most trips never need a word, which is the point.'}
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
                      {trip.driverId === m.authorId ? ', car owner' : ''}
                    </Text>
                  ) : null}
                  <Text variant="body" tone={mine ? 'onInk' : 'ink'}>
                    {m.body}
                  </Text>
                  <Text
                    variant="small"
                    tone={mine ? 'onInk' : 'faint'}
                    style={[s.time, m.pending ? s.pending : null]}>
                    {m.pending ? 'sending' : clock(m.atMin)}
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

        {canBookHere ? (
          <View style={s.book}>
            {bookFailed ? (
              <Text variant="small" tone="muted" center>
                That seat could not be reserved. Open the ride to see why.
              </Text>
            ) : null}
            {dropOff ? (
              <Button
                label={
                  booking
                    ? 'Reserving'
                    : trip.contributionNaira
                      ? `Reserve a seat, ${naira(trip.contributionNaira)}`
                      : 'Reserve a seat'
                }
                kind="secondary"
                onPress={onBook}
                disabled={booking}
              />
            ) : (
              <Button label="Set your place to book" kind="secondary" onPress={() => router.push('/find')} />
            )}
          </View>
        ) : null}

        {closed ? (
          <Text variant="small" tone="faint" center style={s.closed}>
            This ride has left, so questions about it are closed.
          </Text>
        ) : (
        <View style={s.composer}>
          <TextInput
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              if (error) clearError();
            }}
            style={s.input}
            placeholder={
              question
                ? iAmAsking
                  ? `Ask ${driverFirst} about the ride`
                  : `Reply to ${askerFirst}`
                : `Running late? Tell ${driverFirst}`
            }
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
        )}
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
  book: { paddingHorizontal: GUTTER, paddingTop: space.md, gap: space.sm },
  closed: { paddingHorizontal: GUTTER, paddingVertical: space.lg },
  pressed: { opacity: 0.7 },
  })
);
