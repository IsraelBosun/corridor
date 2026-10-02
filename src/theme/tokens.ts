/**
 * Design tokens.
 *
 * Deep teal and mint, from the logo, on a lot of white. Two rules the palette
 * enforces on its own: green is only ever "confirmed", red is only ever
 * "cancelled". Mint is the brand, so "confirmed" is a deeper, plainer green
 * and always comes with words or a tick, never colour alone.
 *
 * Light and dark are two palettes with the same keys. `color` is the live one:
 * the theme provider copies the right palette into it, and style sheets built
 * with themed() are rebuilt from it once per scheme.
 */
import { Platform, StyleSheet } from 'react-native';

export const TEAL = '#0E3B43';
export const MINT = '#7FE0C4';

const light = {
  /** Lots of white. Screens and the map sheet. */
  bg: '#FFFFFF',
  /** Cards and inputs, told apart from the page by a hairline. */
  surface: '#FFFFFF',
  /** Grouped rows, search fields, idle chips. */
  sunken: '#F1F6F5',

  /** Text. The logo teal, darkened a touch so long lines stay easy to read. */
  ink: '#0B2B31',
  inkMuted: '#4D6A6E',
  inkFaint: '#8EA5A7',

  line: '#E2ECEA',
  lineStrong: '#C3D6D3',

  /** The brand. Primary buttons, selection, the route. */
  brand: TEAL,
  brandSoft: '#E5F8F2',
  brandInk: TEAL,
  /** The strip behind the system status bar. */
  brandDeep: TEAL,

  /** Mint. Highlights, the "your stop" marker, gentle nudges. */
  accent: MINT,
  accentSoft: '#E5F8F2',
  accentInk: '#0A6E57',

  /** Confirmed, and nothing else. */
  go: '#15803D',
  goSoft: '#DCFCE7',

  /** Cancelled, and nothing else. */
  stop: '#DC2626',
  stopSoft: '#FEE2E2',

  /** Text and icons on a brand fill. */
  onInk: '#FFFFFF',

  shadow: TEAL,
  /** Land colour of the map style, so a tile still loading looks like map. */
  mapBg: '#F3EFE8',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#061A1E',
  surface: '#0C2A30',
  sunken: '#113740',

  ink: '#E8F5F2',
  inkMuted: '#9BB8B5',
  inkFaint: '#6B8A88',

  line: '#173F47',
  lineStrong: '#265A63',

  // On a dark page the mint carries the brand, with teal text on it.
  brand: MINT,
  brandSoft: '#123F3A',
  brandInk: MINT,
  brandDeep: TEAL,

  accent: MINT,
  accentSoft: '#123F3A',
  accentInk: MINT,

  go: '#4ADE80',
  goSoft: '#123D27',

  stop: '#F87171',
  stopSoft: '#3D1717',

  onInk: TEAL,

  shadow: '#000000',
  mapBg: '#1F2A2E',
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
 * colleague is always the same colour. Green and red are left out on purpose.
 */
const avatarsLight = [
  { bg: '#E5F8F2', fg: '#0A6E57' },
  { bg: '#E0EEFF', fg: '#1D4F91' },
  { bg: '#FDE7F0', fg: '#9D1B5A' },
  { bg: '#FFEEDB', fg: '#9A4A00' },
  { bg: '#FFF6CC', fg: '#7A5A00' },
  { bg: '#E3F4F8', fg: '#0E5866' },
];
const avatarsDark = [
  { bg: '#123F3A', fg: '#7FE0C4' },
  { bg: '#16304F', fg: '#9CC3FF' },
  { bg: '#41162B', fg: '#F7A8CB' },
  { bg: '#41270E', fg: '#FFC48A' },
  { bg: '#3B3110', fg: '#F5DC7A' },
  { bg: '#0F3640', fg: '#8FD3E3' },
];

export function avatarPalette() {
  return scheme === 'dark' ? avatarsDark : avatarsLight;
}

/**
 * Archivo throughout: a grotesque with a bit of width to it, which reads as
 * confident at the heavy weights the titles use. Android picks a weight by
 * family name rather than by fontWeight, so each weight is its own family and
 * the Text component chooses one from the weight a style asks for.
 */
export const font = {
  sans: 'Archivo_400Regular',
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
} as const;

export const fontByWeight: Record<string, string> = {
  '400': 'Archivo_400Regular',
  normal: 'Archivo_400Regular',
  '500': 'Archivo_500Medium',
  '600': 'Archivo_600SemiBold',
  '700': 'Archivo_700Bold',
  bold: 'Archivo_700Bold',
  '800': 'Archivo_800ExtraBold',
  '900': 'Archivo_900Black',
};

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.9 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: -0.6 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  small: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  /** Section labels. Small and quiet, no longer shouted in capitals. */
  eyebrow: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.1 },
  data: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  dataLarge: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 } as const;

/** Screens keep a single consistent side gutter. */
export const GUTTER = 20;

/** Floating things over the map: search pill, round buttons, the sheet. */
export const elevation = {
  shadowColor: TEAL,
  shadowOpacity: 0.14,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 5,
} as const;
