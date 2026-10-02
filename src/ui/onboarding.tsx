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
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { color, MINT, radius, space, TEAL, themed } from '@/theme/tokens';
import { ArrowIcon } from './icons';
import { Text } from './text';

/**
 * The three slide intro. Shown once on a phone's first open, and again from
 * Account. Each slide is a drawing and two lines; the drawings are plain SVG
 * so they stay sharp and follow light and dark.
 */
const SLIDES = [
  {
    key: 'ride',
    title: 'Seats home with colleagues',
    body: 'Drivers heading your way post a ride after work. Grab a free seat and leave the office together.',
    Art: CarArt,
  },
  {
    key: 'route',
    title: 'Dropped off along the way',
    body: 'Set where you get off once. You see the rides whose road passes close to it, and drivers see every stop in order.',
    Art: RouteArt,
  },
  {
    key: 'trust',
    title: 'Only people you work with',
    body: 'Everyone confirms a work email, checked again every 60 days. No money changes hands, ever.',
    Art: TrustArt,
  },
] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const ref = useAnimatedRef<Animated.ScrollView>();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  function next() {
    if (last) return onDone();
    const to = index + 1;
    ref.current?.scrollTo({ x: to * width, animated: true });
    setIndex(to);
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.top}>
        <Text variant="small" tone="faint" style={s.count}>
          {index + 1} / {SLIDES.length}
        </Text>
        {!last ? (
          <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
            <Text variant="body" tone="muted" style={s.bold}>
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
          <Text variant="body" tone="onInk" style={s.bold}>
            {last ? 'Get started' : 'Next'}
          </Text>
          <ArrowIcon size={18} tint={color.onInk} />
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
      { scale: interpolate(scrollX.value, range, [0.85, 1, 0.85], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
  }));
  const words = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollX.value, range, [16, 0, 16], Extrapolation.CLAMP) }],
  }));
  const { Art } = slide;
  const size = Math.min(width - space.xl * 2, 340);

  return (
    <View style={[s.slide, { width }]}>
      <Animated.View style={[s.art, art]}>
        <Art size={size} />
      </Animated.View>
      <Animated.View style={words}>
        <Text variant="display" style={s.title}>
          {slide.title}
        </Text>
        <Text variant="body" tone="muted" style={s.body}>
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
      width: interpolate(scrollX.value, range, [8, 28, 8], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, range, [0.35, 1, 0.35], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[s.dot, style]} />;
}

/* Drawings. 300 by 260, on a soft brand circle, in the app's two colours. */

/** A car on the road home, office tower behind. */
function CarArt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 0.87} viewBox="0 0 300 260">
      <Circle cx="150" cy="128" r="118" fill={color.brandSoft} />

      {/* Office tower and a smaller block. */}
      <Rect x="46" y="38" width="62" height="150" rx="8" fill={TEAL} />
      {[0, 1, 2, 3, 4, 5].map((r) =>
        [0, 1, 2].map((c) => (
          <Rect
            key={`${r}-${c}`}
            x={56 + c * 16}
            y={52 + r * 20}
            width="10"
            height="12"
            rx="2"
            fill={MINT}
            opacity={(r + c) % 3 === 0 ? 0.95 : 0.35}
          />
        ))
      )}
      <Rect x="112" y="98" width="36" height="90" rx="6" fill={TEAL} opacity="0.75" />

      {/* Sun going down. */}
      <Circle cx="232" cy="62" r="20" fill={MINT} opacity="0.55" />

      {/* Road. */}
      <Rect x="14" y="188" width="272" height="40" rx="20" fill={TEAL} />
      <Line x1="34" y1="208" x2="270" y2="208" stroke={MINT} strokeWidth="3" strokeDasharray="12 10" strokeLinecap="round" opacity="0.8" />

      {/* Car. */}
      <G>
        <Path d="M140 172 L160 146 Q164 141 171 141 H214 Q221 141 226 147 L244 172 Z" fill={MINT} />
        <Path d="M152 170 L166 151 Q168 148 172 148 H188 V170 Z" fill={TEAL} opacity="0.85" />
        <Path d="M194 170 V148 H212 Q216 148 219 151 L234 170 Z" fill={TEAL} opacity="0.85" />
        <Rect x="122" y="166" width="140" height="28" rx="12" fill={MINT} />
        <Rect x="250" y="174" width="10" height="7" rx="3.5" fill="#FFE08A" />
        <Rect x="124" y="174" width="8" height="7" rx="3.5" fill="#FF8A80" />
        <Circle cx="158" cy="194" r="14" fill={TEAL} />
        <Circle cx="158" cy="194" r="5.5" fill={MINT} />
        <Circle cx="228" cy="194" r="14" fill={TEAL} />
        <Circle cx="228" cy="194" r="5.5" fill={MINT} />
      </G>

      {/* Speed lines. */}
      <Line x1="84" y1="160" x2="112" y2="160" stroke={TEAL} strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <Line x1="96" y1="176" x2="114" y2="176" stroke={TEAL} strokeWidth="4" strokeLinecap="round" opacity="0.25" />
    </Svg>
  );
}

/** A route on a map card: pickup, two numbered drop offs, the destination. */
function RouteArt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 0.87} viewBox="0 0 300 260">
      <Circle cx="150" cy="128" r="118" fill={color.brandSoft} />

      <Rect x="44" y="30" width="212" height="200" rx="26" fill={color.surface} stroke={color.line} strokeWidth="2" />
      {/* Faint streets. */}
      <Path d="M44 92 H256 M44 168 H256 M110 30 V230 M196 30 V230" stroke={color.line} strokeWidth="6" />

      {/* The road. */}
      <Path d="M78 200 C 120 200, 104 132, 150 128 S 196 70, 226 62" stroke={MINT} strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.45" />
      <Path d="M78 200 C 120 200, 104 132, 150 128 S 196 70, 226 62" stroke={TEAL} strokeWidth="6" strokeLinecap="round" fill="none" />

      {/* Pickup. */}
      <Circle cx="78" cy="200" r="10" fill={color.surface} stroke={TEAL} strokeWidth="5" />

      {/* Numbered drop offs. */}
      <Circle cx="124" cy="150" r="14" fill={MINT} stroke={color.surface} strokeWidth="3" />
      <SvgText x="124" y="155" fontSize="14" fontWeight="bold" fill={TEAL} textAnchor="middle">
        1
      </SvgText>
      <Circle cx="186" cy="96" r="14" fill={MINT} stroke={color.surface} strokeWidth="3" />
      <SvgText x="186" y="101" fontSize="14" fontWeight="bold" fill={TEAL} textAnchor="middle">
        2
      </SvgText>

      {/* Destination pin. */}
      <Path d="M226 70 C 214 56, 212 50, 212 44 A 14 14 0 0 1 240 44 C 240 50, 238 56, 226 70 Z" fill={TEAL} />
      <Circle cx="226" cy="44" r="5" fill={MINT} />

      {/* A small car on the road, seen from above. */}
      <G transform="translate(150 128) rotate(-28)">
        <Rect x="-15" y="-9" width="30" height="18" rx="6" fill={TEAL} />
        <Rect x="3" y="-6" width="7" height="12" rx="2" fill={MINT} />
        <Rect x="-11" y="-6" width="6" height="12" rx="2" fill={MINT} opacity="0.6" />
      </G>
    </Svg>
  );
}

/** A shield with a tick, colleagues around it, and a work email envelope. */
function TrustArt({ size }: { size: number }) {
  const people = [
    { x: 64, y: 82, bg: '#FFD8C2', fg: '#8A3B12', t: 'AO' },
    { x: 238, y: 100, bg: '#D9D3FF', fg: '#3B2E8A', t: 'TK' },
    { x: 78, y: 196, bg: MINT, fg: TEAL, t: 'IB' },
  ];
  return (
    <Svg width={size} height={size * 0.87} viewBox="0 0 300 260">
      <Circle cx="150" cy="128" r="118" fill={color.brandSoft} />

      {/* Dashed orbit linking everyone. */}
      <Circle cx="150" cy="134" r="92" stroke={TEAL} strokeWidth="2" strokeDasharray="6 8" fill="none" opacity="0.35" />

      {/* Shield. */}
      <Path d="M150 46 L206 66 V122 C 206 160, 182 188, 150 204 C 118 188, 94 160, 94 122 V66 Z" fill={TEAL} />
      <Path d="M126 126 L144 144 L176 108" stroke={MINT} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {people.map((p) => (
        <G key={p.t}>
          <Circle cx={p.x} cy={p.y} r="22" fill={p.bg} stroke={color.surface} strokeWidth="4" />
          <SvgText x={p.x} y={p.y + 5} fontSize="14" fontWeight="bold" fill={p.fg} textAnchor="middle">
            {p.t}
          </SvgText>
        </G>
      ))}

      {/* Work email envelope with a tick. */}
      <G transform="translate(196 176)">
        <Rect x="0" y="0" width="58" height="40" rx="8" fill={color.surface} stroke={TEAL} strokeWidth="3" />
        <Path d="M4 6 L29 24 L54 6" stroke={TEAL} strokeWidth="3" fill="none" strokeLinejoin="round" />
        <Circle cx="56" cy="2" r="11" fill={MINT} stroke={color.surface} strokeWidth="3" />
        <Path d="M51 2 L55 6 L61 -2" stroke={TEAL} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </Svg>
  );
}

const s = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    flex: { flex: 1 },
    bold: { fontWeight: '700' },
    pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.xl,
      paddingTop: space.md,
      height: 52,
    },
    count: { fontWeight: '600', letterSpacing: 1 },
    slide: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'center' },
    art: { alignItems: 'center', marginBottom: space.xxl },
    title: { marginBottom: space.md },
    body: { fontSize: 17, lineHeight: 25 },
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
    dot: { height: 8, borderRadius: 4, backgroundColor: color.brand },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: color.brand,
      borderRadius: radius.pill,
      paddingHorizontal: space.xl,
      paddingVertical: space.lg,
    },
    buttonWide: { paddingHorizontal: space.xxl },
  })
);
