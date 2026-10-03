import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

type IconProps = { size?: number; tint?: string };

/** The corridor: a route with a stop on it. */
export function CorridorIcon({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="3" x2="12" y2="21" stroke={tint} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="12" cy="8" r="3.2" stroke={tint} strokeWidth="1.8" fill="none" />
      <Circle cx="12" cy="20" r="1.6" fill={tint} />
    </Svg>
  );
}

export function PlusIcon({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={tint} strokeWidth="1.8" />
      <Line x1="12" y1="8" x2="12" y2="16" stroke={tint} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="8" y1="12" x2="16" y2="12" stroke={tint} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function PersonIcon({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.6" stroke={tint} strokeWidth="1.8" />
      <Path d="M4.5 20c0-4 3.4-6 7.5-6s7.5 2 7.5 6" stroke={tint} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function BellIcon({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9a6 6 0 1 1 12 0c0 4 1.4 5.4 1.4 5.4H4.6S6 13 6 9Z"
        stroke={tint}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <Path d="M10 18a2 2 0 0 0 4 0" stroke={tint} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function ShieldIcon({ size = 18, tint = color.inkMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 2.5v6c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5v-6L12 3Z"
        stroke={tint}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LockIcon({ size = 18, tint = color.inkMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="10" width="14" height="10" rx="2.5" stroke={tint} strokeWidth="1.7" />
      <Path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke={tint} strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function AlertIcon({ size = 20, tint = color.stop }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={tint} strokeWidth="1.8" />
      <Line x1="12" y1="7.5" x2="12" y2="13" stroke={tint} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="12" cy="16.3" r="1.1" fill={tint} />
    </Svg>
  );
}

export function CheckIcon({ size = 18, tint = color.go }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={tint} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ArrowIcon({ size = 20, tint = color.onInk }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="12" x2="19" y2="12" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      <Path d="M13.5 6.5L19 12l-5.5 5.5" stroke={tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronIcon({ size = 20, tint = color.inkFaint }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BackIcon({ size = 24, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="20" y1="12" x2="5" y2="12" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      <Path d="M10.5 6.5L5 12l5.5 5.5" stroke={tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Show or hide a code. One icon with two states rather than two icons, so the
 * eye stays in exactly the same place when it is tapped.
 */
export function EyeIcon({ size = 22, tint = color.inkMuted, off = false }: IconProps & { off?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"
        stroke={tint}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="3" stroke={tint} strokeWidth="1.7" fill="none" />
      {off ? (
        <Line x1="4" y1="20" x2="20" y2="4" stroke={tint} strokeWidth="1.7" strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}

export function SearchIcon({ size = 20, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="10.5" cy="10.5" r="6.5" stroke={tint} strokeWidth="2" />
      <Line x1="15.5" y1="15.5" x2="20" y2="20" stroke={tint} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** A drop pin. Where you get off, never where you live. */
export function PinIcon({ size = 20, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z"
        stroke={tint}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="9.8" r="2.4" fill={tint} />
    </Svg>
  );
}

export function CloseIcon({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="6" y1="6" x2="18" y2="18" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      <Line x1="18" y1="6" x2="6" y2="18" stroke={tint} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** Frame the whole route again. A target, not a location arrow: there is no GPS. */
export function FrameIcon({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      <Path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      <Path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      <Path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      <Circle cx="12" cy="12" r="2.5" fill={tint} />
    </Svg>
  );
}

export function ChatIcon({ size = 20, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5Z"
        stroke={tint}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CarIcon({ size = 20, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 16v-3.5l1.8-4.6A2 2 0 0 1 7.7 6.6h8.6a2 2 0 0 1 1.9 1.3l1.8 4.6V16"
        stroke={tint}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <Rect x="3" y="12.5" width="18" height="4.5" rx="1.5" stroke={tint} strokeWidth="1.9" />
      <Circle cx="7.5" cy="19" r="1.5" fill={tint} />
      <Circle cx="16.5" cy="19" r="1.5" fill={tint} />
    </Svg>
  );
}

export function ClockIcon({ size = 18, tint = color.inkMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={tint} strokeWidth="1.9" />
      <Path d="M12 7.5V12l3 2" stroke={tint} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A play button in a ring, for "How Corridor works". */
export function PlayIcon({ size = 20, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={tint} strokeWidth="1.9" />
      <Path d="M10.2 8.8v6.4l5-3.2-5-3.2Z" fill={tint} stroke={tint} strokeWidth="1.2" strokeLinejoin="round" />
    </Svg>
  );
}

/** A door with an arrow leaving it. */
export function SignOutIcon({ size = 20, tint = color.stop }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" stroke={tint} strokeWidth="1.9" strokeLinecap="round" />
      <Path d="M14 8l4 4-4 4M18 12H9" stroke={tint} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * The Route C mark: the drive home drawn as a C, a dashed road down its
 * middle, ending at your stop. `road` is the C, `ground` shows through the
 * dashes, `stop` is the dot at the end.
 */
export function RouteMark({
  size = 32,
  road,
  ground,
  stop = '#FFFFFF',
}: {
  size?: number;
  road: string;
  ground: string;
  stop?: string;
}) {
  // Centre 24,24, radius 14, open on the right between -50 and 50 degrees.
  const arc = 'M33 13.3 A14 14 0 1 0 33 34.7';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d={arc} stroke={road} strokeWidth="8.5" strokeLinecap="round" />
      <Path d={arc} stroke={ground} strokeWidth="1.6" strokeDasharray="3 3" strokeLinecap="round" />
      <Circle cx="33" cy="34.7" r="3.6" fill={stop} stroke={ground} strokeWidth="1.6" />
    </Svg>
  );
}

/** A crosshair round a dot, for "show where I am". */
export function LocateIcon({ size = 20, tint = color.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="6.5" stroke={tint} strokeWidth="1.9" />
      <Circle cx="12" cy="12" r="2.4" fill={tint} />
      <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke={tint} strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}
