import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { LIME, NIGHT, PINE, radius, space, themed } from '@/theme/tokens';
import { ArrowIcon } from './icons';
import { useStatusBand } from './status-band';
import { Text } from './text';

/*
  The intro is always at night, whatever the theme: it is the first thing
  anyone sees, and it is drawn like the map they are about to use.
*/
const INK = '#F5F5F2';
const MUTED = '#A9B5AE';
const FAINT = '#6E7C74';
const CARD = '#16231E';
const GRID = '#22332C';
const BAND = '#24493A';

/**
 * The three slide intro. Shown once on a phone's first open, and again from
 * Account. Each slide is a drawing and two lines; the drawings are plain SVG
 * so they stay sharp at any size.
 */
const SLIDES = [
  {
    key: 'ride',
    lead: 'Seats to work and home',
    hi: 'with people going your way.',
    body: 'Car owners heading your way post a ride to work in the morning and home after work. Grab a free seat and travel together.',
    Art: RouteArt,
  },
  {
    key: 'route',
    lead: 'Dropped off',
    hi: 'along the way.',
    body: 'Set where you get off once. You see the rides whose road passes close to it, and car owners see every stop in order.',
    Art: StopArt,
  },
  {
    key: 'trust',
    lead: 'Only verified',
    hi: 'company emails.',
    body: 'Everyone confirms their company email with a code, and it is checked again every 60 days. Rides are free unless the car owner asks for a fixed fuel contribution, paid to them directly.',
    Art: TrustArt,
  },
] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const ref = useAnimatedRef<Animated.ScrollView>();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  // The intro is at night in both themes, and so is the strip above it.
  useStatusBand(NIGHT);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  function next() {
    if (last) return onDone();
    const to = index + 1;
    ref.current?.scrollTo({ x: to * width, animated: true });
    setIndex(to);
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.top}>
        <Text variant="small" style={s.count}>
          {pad(index + 1)} / {pad(SLIDES.length)}
        </Text>
        {!last ? (
          <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
            <Text variant="body" style={s.skip}>
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={s.flex}>
        {SLIDES.map((slide, i) => (
          <Slide key={slide.key} i={i} width={width} scrollX={scrollX} slide={slide} />
        ))}
      </Animated.ScrollView>

      <View style={s.bottom}>
        <View style={s.dots}>
          {SLIDES.map((slide, i) => (
            <Dot key={slide.key} i={i} width={width} scrollX={scrollX} />
          ))}
        </View>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          style={({ pressed }) => [s.button, last && s.buttonWide, pressed && s.pressed]}>
          <Text variant="heading" style={s.buttonText}>
            {last ? 'Get started' : 'Next'}
          </Text>
          <ArrowIcon size={18} tint={PINE} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Slide({
  i,
  width,
  scrollX,
  slide,
}: {
  i: number;
  width: number;
  scrollX: SharedValue<number>;
  slide: (typeof SLIDES)[number];
}) {
  const range = [(i - 1) * width, i * width, (i + 1) * width];
  // The drawing drifts slower than the page and settles in at full size.
  const art = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(scrollX.value, range, [width * 0.25, 0, -width * 0.25], Extrapolation.CLAMP) },
      { scale: interpolate(scrollX.value, range, [0.9, 1, 0.9], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
  }));
  const words = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollX.value, range, [16, 0, 16], Extrapolation.CLAMP) }],
  }));
  const { Art } = slide;
  const { height } = useWindowDimensions();
  // Wide enough to fill the page, short enough to leave room for the words.
  // A short phone gives the drawing less and sets the title smaller, so the
  // words are never clipped at the bottom.
  const short = height < 720;
  const size = Math.min(width - space.xl * 2, 360, (height * (short ? 0.34 : 0.44)) / 1.13);

  return (
    <View style={[s.slide, { width }]}>
      <Animated.View style={[s.art, art]}>
        <View style={[s.card, { width: size, height: size * 1.13 }]}>
          <Art size={size} />
        </View>
      </Animated.View>
      <Animated.View style={words}>
        <Text variant="display" style={[s.title, short && s.titleShort]}>
          {slide.lead}
          {'\n'}
          <Text variant="display" style={[s.hi, short && s.titleShort]}>
            {slide.hi}
          </Text>
        </Text>
        <Text variant="body" style={s.body}>
          {slide.body}
        </Text>
      </Animated.View>
    </View>
  );
}

function Dot({ i, width, scrollX }: { i: number; width: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const range = [(i - 1) * width, i * width, (i + 1) * width];
    return {
      width: interpolate(scrollX.value, range, [6, 28, 6], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, range, [0.3, 1, 0.3], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[s.dot, style]} />;
}

/* Drawings. 300 by 340, on a dark map card with a faint street grid. */

function Grid() {
  return (
    <Path
      d="M0 100 H300 M0 200 H300 M0 300 H300 M70 0 V340 M155 0 V340 M240 0 V340"
      stroke={GRID}
      strokeWidth="1.5"
    />
  );
}

/** The office, the road home with two drop offs on it, and the end of the line. */
function RouteArt({ size }: { size: number }) {
  const road = 'M86 248 C 130 248, 140 200, 152 178 S 196 120, 226 112 S 262 90, 268 60';
  return (
    <Svg width={size} height={size * 1.13} viewBox="0 0 300 340">
      <Grid />

      {/* The office, with lights on. */}
      <Rect x="28" y="100" width="58" height="140" rx="10" fill="#1F5A45" />
      {[0, 1, 2, 3, 4].map((r) =>
        [0, 1].map((c) => (
          <Rect
            key={`${r}-${c}`}
            x={42 + c * 22}
            y={116 + r * 24}
            width="10"
            height="10"
            rx="2"
            fill={LIME}
            opacity={(r * 2 + c) % 3 === 0 ? 0.95 : 0.25}
          />
        ))
      )}

      <Path d={road} stroke={BAND} strokeWidth="16" strokeLinecap="round" fill="none" />
      <Path d={road} stroke={LIME} strokeWidth="6" strokeLinecap="round" fill="none" />

      {/* The pickup, wherever the driver starts. */}
      <Circle cx="86" cy="248" r="9" fill={NIGHT} stroke={LIME} strokeWidth="4" />

      {[
        { x: 152, y: 178, n: '1' },
        { x: 226, y: 112, n: '2' },
      ].map((d) => (
        <G key={d.n}>
          <Circle cx={d.x} cy={d.y} r="14" fill={LIME} />
          <SvgText x={d.x} y={d.y + 5} fontSize="14" fontFamily="Manrope_800ExtraBold" fill={PINE} textAnchor="middle">
            {d.n}
          </SvgText>
        </G>
      ))}

      {/* The end of the line. */}
      <Path d="M268 64 C 256 50, 252 42, 252 34 A 16 16 0 0 1 284 34 C 284 42, 280 50, 268 64 Z" fill={INK} />
      <Circle cx="268" cy="34" r="6" fill={PINE} />

      {/* "3 people heading your way" */}
      <Rect x="20" y="282" width="218" height="36" rx="12" fill={INK} />
      <Circle cx="40" cy="300" r="5" fill="#2E9C6E" />
      <SvgText x="54" y="305" fontSize="13" fontFamily="Manrope_700Bold" fill={PINE}>
        3 people heading your way
      </SvgText>
    </Svg>
  );
}

/** One road, the car on it, and your stop lit up beside it. */
function StopArt({ size }: { size: number }) {
  const road = 'M-10 250 C 80 250, 110 180, 170 170 S 260 120, 320 96';
  return (
    <Svg width={size} height={size * 1.13} viewBox="0 0 300 340">
      <Grid />
      <Path d={road} stroke={BAND} strokeWidth="26" strokeLinecap="round" fill="none" />
      <Path d={road} stroke={LIME} strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" fill="none" />

      {/* Stops you are not getting off at. */}
      <Circle cx="70" cy="238" r="6" fill={INK} />
      <Circle cx="268" cy="116" r="6" fill={INK} />

      {/* The car, seen from above. */}
      <G transform="translate(120 196) rotate(-30)">
        <Rect x="-20" y="-11" width="40" height="22" rx="7" fill={INK} />
        <Rect x="4" y="-7" width="9" height="14" rx="2" fill={PINE} />
        <Rect x="-14" y="-7" width="8" height="14" rx="2" fill={PINE} opacity="0.6" />
      </G>

      {/* Your stop. */}
      <Circle cx="196" cy="156" r="26" fill={LIME} opacity="0.16" />
      <Circle cx="196" cy="156" r="11" fill={LIME} stroke={NIGHT} strokeWidth="4" />
      <Rect x="150" y="96" width="92" height="32" rx="10" fill={LIME} />
      <SvgText x="196" y="117" fontSize="13" fontFamily="Manrope_800ExtraBold" fill={PINE} textAnchor="middle">
        Your stop
      </SvgText>

      {/* The order the driver sees. */}
      <Rect x="20" y="262" width="260" height="56" rx="14" fill={CARD} stroke={GRID} strokeWidth="1.5" />
      <Circle cx="44" cy="290" r="11" fill={LIME} />
      <SvgText x="44" y="295" fontSize="12" fontFamily="Manrope_800ExtraBold" fill={PINE} textAnchor="middle">
        1
      </SvgText>
      <SvgText x="64" y="295" fontSize="13" fontFamily="Manrope_700Bold" fill={INK}>
        First drop off on the road
      </SvgText>
    </Svg>
  );
}

/** A shield with a tick, people around it, and the company email that proves it. */
function TrustArt({ size }: { size: number }) {
  const people = [
    { x: 62, y: 100, bg: LIME, fg: PINE, t: 'AO' },
    { x: 238, y: 120, bg: '#DCE7F7', fg: '#1D4F91', t: 'TK' },
    { x: 70, y: 230, bg: '#F8E3EC', fg: '#9D1B5A', t: 'IB' },
  ];
  return (
    <Svg width={size} height={size * 1.13} viewBox="0 0 300 340">
      <Grid />

      {/* Dashed ring linking everyone. */}
      <Circle cx="150" cy="166" r="98" stroke={LIME} strokeWidth="2" strokeDasharray="4 9" fill="none" opacity="0.4" />

      {/* Shield. */}
      <Path d="M150 74 L206 94 V150 C 206 188, 182 216, 150 232 C 118 216, 94 188, 94 150 V94 Z" fill="#1F5A45" />
      <Path d="M126 154 L144 172 L176 136" stroke={LIME} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {people.map((p) => (
        <G key={p.t}>
          <Rect x={p.x - 22} y={p.y - 22} width="44" height="44" rx="13" fill={p.bg} />
          <SvgText x={p.x} y={p.y + 5} fontSize="14" fontFamily="Manrope_800ExtraBold" fill={p.fg} textAnchor="middle">
            {p.t}
          </SvgText>
        </G>
      ))}

      {/* Company email with a tick. */}
      <G transform="translate(196 222)">
        <Rect x="0" y="0" width="60" height="42" rx="9" fill={INK} />
        <Path d="M6 8 L30 26 L54 8" stroke={PINE} strokeWidth="3" fill="none" strokeLinejoin="round" />
        <Circle cx="58" cy="2" r="12" fill={LIME} stroke={NIGHT} strokeWidth="3" />
        <Path d="M52 2 L56 6 L63 -2" stroke={PINE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>

      <SvgText x="150" y="312" fontSize="13" fontFamily="Manrope_700Bold" fill={MUTED} textAnchor="middle">
        Checked every 60 days
      </SvgText>
    </Svg>
  );
}

const s = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: NIGHT },
    flex: { flex: 1 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.xl,
      paddingTop: space.md,
      height: 52,
    },
    count: { color: FAINT, fontWeight: '800', letterSpacing: 1.5 },
    skip: { color: MUTED, fontWeight: '700' },
    slide: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'center' },
    art: { alignItems: 'center', marginBottom: space.xl },
    card: { backgroundColor: CARD, borderRadius: 28, overflow: 'hidden' },
    title: { color: INK, marginBottom: space.md },
    titleShort: { fontSize: 30, lineHeight: 34 },
    hi: { color: LIME },
    body: { color: MUTED, fontSize: 16, lineHeight: 24 },
    bottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.xl,
      paddingBottom: space.lg,
      paddingTop: space.md,
      gap: space.lg,
    },
    dots: { flexDirection: 'row', gap: 6 },
    dot: { height: 6, borderRadius: 3, backgroundColor: LIME },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: LIME,
      borderRadius: radius.lg,
      paddingHorizontal: space.xl,
      paddingVertical: space.lg,
    },
    buttonText: { color: PINE },
    buttonWide: { paddingHorizontal: space.xxl },
  })
);
