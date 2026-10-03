/**
 * Design tokens.
 *
 * Pine and lime on a warm off-white, with the map always at night. Pine is the
 * brand: headers, selection, the shield. Lime is the one loud thing on a
 * screen, the main action and the route, with pine text on it. Two rules the
 * palette still enforces: green is only ever "confirmed", red is only ever
 * "cancelled", and neither is carried by colour alone.
 *
 * Light and dark are two palettes with the same keys. `color` is the live one:
 * the theme provider copies the right palette into it, and style sheets built
 * with themed() are rebuilt from it once per scheme.
 */
import { Platform, StyleSheet } from 'react-native';

export const PINE = '#123B2F';
export const LIME = '#C8E86B';
/** The night the map and the intro sit in. */
export const NIGHT = '#0D1814';

const light = {
  /** Warm off-white. Screens and the map sheet. */
  bg: '#F5F5F2',
  /** Cards and inputs, white on the off-white page. */
  surface: '#FFFFFF',
  /** Segmented controls, quiet buttons, the strip inside a card. */
  sunken: '#E9ECE8',

  ink: '#15211C',
  inkMuted: '#5D6A63',
  inkFaint: '#949F98',

  line: '#E3E6E1',
  lineStrong: '#C9D0CA',

  /** The brand. Headers, selection, outlined buttons. */
  brand: PINE,
  brandSoft: '#E1EBE5',
  /** Pine as text: links, eyebrows, small labels. A touch lighter to read. */
  brandInk: '#1D5A45',
  /** The strip behind the system status bar, unless a screen asks otherwise. */
  brandDeep: NIGHT,

  /** Lime. The main action, the route, "your stop". */
  accent: LIME,
  accentSoft: '#EAF5C7',
  accentInk: '#3D5A12',
  /** Text and icons on lime, in both themes. */
  onAccent: '#13241C',

  /** Confirmed, and nothing else. */
  go: '#16803F',
  goSoft: '#DCF3E3',

  /** Cancelled, and nothing else. */
  stop: '#C2392B',
  stopSoft: '#FBE4E0',

  /** Text and icons on a brand fill. */
  onInk: '#FFFFFF',

  shadow: '#0F2A20',
  /** Land colour of the map style, so a tile still loading looks like map. */
  mapBg: '#F2F2EF',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0E1512',
  surface: '#17211D',
  sunken: '#202C27',

  ink: '#EDF2EE',
  inkMuted: '#A2AFA8',
  inkFaint: '#6D7B74',

  line: '#24312C',
  lineStrong: '#35443D',

  // On a dark page lime carries the brand, with pine text on it.
  brand: LIME,
  brandSoft: '#1E2E25',
  brandInk: LIME,
  brandDeep: NIGHT,

  accent: LIME,
  accentSoft: '#2A3A1C',
  accentInk: LIME,
  onAccent: '#13241C',

  go: '#4ADE80',
  goSoft: '#143A24',

  stop: '#F2766A',
  stopSoft: '#3D1915',

  onInk: '#13241C',

  shadow: '#000000',
  mapBg: '#1B2421',
};

export type Scheme = 'light' | 'dark';

let scheme: Scheme = 'light';

/** The live palette. Read it at render time, never copy it into a constant. */
export const color: Palette = { ...light };

export function currentScheme(): Scheme {
  return scheme;
}

/** Called by the theme provider, before anything renders in the new scheme. */
export function applyScheme(next: Scheme) {
  scheme = next;
  Object.assign(color, next === 'dark' ? dark : light);
}

/**
 * A style sheet that follows the theme.
 *
 * Wrap the usual StyleSheet.create call in a function. The sheet is built from
 * `color` the first time it is read in each scheme and cached, so a style
 * reads exactly like before (`s.card`) and costs nothing after the first use.
 */
export function themed<T extends StyleSheet.NamedStyles<T>>(make: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  return new Proxy({} as T, {
    get(_, key) {
      const sheet = (cache[scheme] ??= make());
      return sheet[key as keyof T];
    },
  });
}

/**
 * Avatar colours, one per person, picked from their initials so the same
 * colleague is always the same colour. Pine and lime lead; green and red are
 * left out on purpose.
 */
const avatarsLight = [
  { bg: PINE, fg: LIME },
  { bg: LIME, fg: PINE },
  { bg: '#DCE7F7', fg: '#1D4F91' },
  { bg: '#F8E3EC', fg: '#9D1B5A' },
  { bg: '#FBE9D6', fg: '#9A4A00' },
  { bg: '#E1EBE5', fg: '#1D5A45' },
];
const avatarsDark = [
  { bg: LIME, fg: PINE },
  { bg: '#24463A', fg: LIME },
  { bg: '#16304F', fg: '#9CC3FF' },
  { bg: '#41162B', fg: '#F7A8CB' },
  { bg: '#41270E', fg: '#FFC48A' },
  { bg: '#1E2E25', fg: '#B9D7C6' },
];

export function avatarPalette() {
  return scheme === 'dark' ? avatarsDark : avatarsLight;
}

/**
 * Two faces. Bricolage Grotesque for anything meant to be read at a glance
 * (titles, times, names, buttons) and Manrope for everything read as words.
 * Android picks a weight by family name rather than by fontWeight, so each
 * weight is its own family and the Text component chooses one from the weight
 * a style asks for.
 */
export const font = {
  sans: 'Manrope_400Regular',
  display: 'BricolageGrotesque_700Bold',
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
} as const;

export const fontByWeight: Record<string, string> = {
  '400': 'Manrope_400Regular',
  normal: 'Manrope_400Regular',
  '500': 'Manrope_500Medium',
  '600': 'Manrope_600SemiBold',
  '700': 'Manrope_700Bold',
  bold: 'Manrope_700Bold',
  '800': 'Manrope_800ExtraBold',
  '900': 'Manrope_800ExtraBold',
};

export const displayByWeight: Record<string, string> = {
  '400': 'BricolageGrotesque_500Medium',
  normal: 'BricolageGrotesque_500Medium',
  '500': 'BricolageGrotesque_500Medium',
  '600': 'BricolageGrotesque_600SemiBold',
  '700': 'BricolageGrotesque_700Bold',
  bold: 'BricolageGrotesque_700Bold',
  '800': 'BricolageGrotesque_800ExtraBold',
  '900': 'BricolageGrotesque_800ExtraBold',
};

export const type = {
  display: { fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1.2 },
  title: { fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  small: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  /** Field labels: small, firm, sentence case. */
  eyebrow: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  /** Section labels and kickers: small capitals, spaced out. */
  kicker: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  data: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  dataLarge: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5 },
} as const;

/** Variants set in the display face. Everything else is Manrope. */
export const DISPLAY_VARIANTS = new Set<keyof typeof type>(['display', 'title', 'heading', 'dataLarge']);

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Screens keep a single consistent side gutter. */
export const GUTTER = 20;

/** Floating things over the map: search pill, round buttons, the sheet. */
export const elevation = {
  shadowColor: '#0F2A20',
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 5,
} as const;
