import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMyLocation } from '@/lib/location';
import type { LngLat } from '@/lib/mapbox';
import { nameForPoint, searchPlaces, type Place } from '@/lib/places';
import { color, font, GUTTER, radius, space, themed } from '@/theme/tokens';
import { BackIcon, CloseIcon, LocateIcon, PinIcon, SearchIcon } from './icons';
import { Text } from './text';

const LAGOS: LngLat = { lat: 6.5, lng: 3.4 };
/** Mapbox is not asked about anything shorter, so neither is "nothing found" said. */
const MIN_QUERY = 3;

/**
 * Search for a place in Lagos.
 *
 * Used for where a rider gets off and where a driver is going. It picks a
 * place and hands it back; what happens to it is the caller's business.
 */
export function PlaceSearch({
  placeholder,
  intro,
  current,
  onPick,
  onBack,
  after,
  privacy,
  offerHere,
}: {
  placeholder: string;
  /** Shown before anything is typed. */
  intro: string;
  /** Name of the place already chosen, marked in the list. */
  current?: string;
  onPick: (p: Place) => void;
  onBack: () => void;
  /** Below the results, such as a way to clear the current choice. */
  after?: ReactNode;
  privacy: string;
  /** Offer "use my current location" above the results. */
  offerHere?: boolean;
}) {
  const me = useMyLocation();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Where the phone is now, named after the nearest place or street, never a
  // house number. The driver sees the name before anything is posted.
  async function pickHere() {
    if (!me || locating) return;
    setLocating(true);
    setError(null);
    try {
      onPick(await nameForPoint(me));
    } catch {
      setError('Could not name where you are. Search for it instead.');
    } finally {
      setLocating(false);
    }
  }

  // Results lean towards where the phone is, or the middle of Lagos when that
  // is not known. The first fix only: a moving dot must not rerun the search.
  const [near, setNear] = useState<LngLat>(me ?? LAGOS);
  const [located, setLocated] = useState(me !== null);
  useEffect(() => {
    if (me && !located) {
      setNear(me);
      setLocated(true);
    }
  }, [me, located]);

  // One request per pause in typing. The one in flight is abandoned on the
  // next keystroke rather than allowed to land out of order.
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (query.trim().length < MIN_QUERY) {
      setRemote([]);
      setBusy(false);
      return;
    }
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      setError(null);
      try {
        setRemote(await searchPlaces(query, near, controller.signal));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError('Search is not reachable right now.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, near]);

  const q = query.trim().toLowerCase();
  const results = q ? remote : [];

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.bar}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" style={s.back}>
          <BackIcon />
        </Pressable>
        <View style={s.field}>
          <SearchIcon size={18} tint={color.brand} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor={color.inkFaint}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
          />
          {busy ? <ActivityIndicator color={color.inkFaint} /> : null}
          {query && !busy ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear">
              <CloseIcon size={18} tint={color.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
        {offerHere && !q ? (
          <Pressable
            onPress={pickHere}
            disabled={!me || locating}
            accessibilityRole="button"
            accessibilityState={{ disabled: !me || locating }}
            style={({ pressed }) => [s.result, !me && s.off, pressed && s.pressed]}>
            <View style={[s.pin, s.herePin]}>
              <LocateIcon size={18} tint={color.onInk} />
            </View>
            <View style={s.flex}>
              <Text variant="body" style={s.name}>
                {locating ? 'Finding where you are' : 'Use my current location'}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={1}>
                {me ? 'Riders meet you where you are standing now' : 'Turn on location to use this'}
              </Text>
            </View>
            {locating ? <ActivityIndicator color={color.inkFaint} /> : null}
          </Pressable>
        ) : null}

        {!q ? (
          <>
            <Text variant="small" tone="muted" style={s.label}>
              {intro}
            </Text>
            {current ? (
              <Text variant="small" tone="brand" style={[s.label, s.name]}>
                Now: {current}
              </Text>
            ) : null}
          </>
        ) : null}

        {results.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => onPick(p)}
            accessibilityRole="button"
            style={({ pressed }) => [s.result, pressed && s.pressed]}>
            <View style={s.pin}>
              <PinIcon size={18} tint={color.accentInk} />
            </View>
            <View style={s.flex}>
              <Text variant="body" style={s.name}>
                {p.name}
              </Text>
              {p.context ? (
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {p.context}
                </Text>
              ) : null}
            </View>
            {current === p.name ? (
              <Text variant="small" tone="accent" style={s.current}>
                Current
              </Text>
            ) : null}
          </Pressable>
        ))}

        {q.length >= MIN_QUERY && !busy && !error && results.length === 0 ? (
          <Text variant="small" tone="muted" style={s.note}>
            Nothing by that name in Lagos. Try the estate, bus stop or landmark nearest to it.
          </Text>
        ) : null}
        {error ? (
          <Text variant="small" tone="muted" style={s.note}>
            {error}
          </Text>
        ) : null}

        {after}

        <Text variant="small" tone="faint" style={s.privacy}>
          {privacy}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = themed(() =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
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
  field: {
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
  label: { paddingTop: space.lg, paddingBottom: space.xs },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontWeight: '600' },
  herePin: { backgroundColor: color.brand },
  off: { opacity: 0.5 },
  current: { fontWeight: '600' },
  note: { paddingTop: space.lg },
  privacy: { paddingTop: space.lg },
  })
);
