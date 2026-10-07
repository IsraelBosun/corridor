// One import per weight, so only the weights the type scale uses are bundled
// rather than every file the packages ship.
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';

import { SessionProvider, useSession } from '@/data/session';
import { StoreProvider } from '@/data/store';
import { backendReady } from '@/data/backend';
import { justSwitchedTheme, ThemeProvider } from '@/theme/theme';
import { color, space, themed } from '@/theme/tokens';
import { OtaUpdates } from '@/lib/updates';
import { DialogHost } from '@/ui/dialog';
import { StatusBand } from '@/ui/status-band';
import { Text } from '@/ui/text';

SplashScreen.preventAutoHideAsync();

/*
  When the phone does not draw edge to edge (Expo Go on some Android builds),
  the status bar is an opaque system strip that defaults to black and no React
  view can reach it. Colouring it directly covers that case. Under edge to edge
  these calls do nothing and StatusBand below does the job instead.
*/
if (Platform.OS === 'android') {
  NativeStatusBar.setBackgroundColor(color.brandDeep, false);
  NativeStatusBar.setBarStyle('light-content', false);
}

export default function RootLayout() {
  // Every weight the type scale uses. The splash stays up until they are in,
  // so no screen is ever drawn in a fallback face and then reflowed.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    // The theme provider paints the window behind the app (SystemUI) in the
    // page colour too, so an edge to edge status bar never shows black.
    <ThemeProvider>
      {(scheme) =>
        !backendReady ? (
          <NotConfigured />
        ) : (
          // The map reads pan and pinch, and gesture handler needs this at the
          // root or the gestures are silently never delivered on Android.
          <GestureHandlerRootView style={s.flex}>
            <SessionProvider>
              <StatusBar style="light" />
              <Gate scheme={scheme} />
              <StatusBand />
              <DialogHost />
              <OtaUpdates />
            </SessionProvider>
          </GestureHandlerRootView>
        )
      }
    </ThemeProvider>
  );
}

/**
 * Metro inlines EXPO_PUBLIC_* at build time, which means a running dev server
 * keeps serving a bundle compiled before the file existed. Saying that plainly
 * is worth a screen, because the symptom otherwise looks like broken code.
 */
function NotConfigured() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={s.setup}>
      <StatusBar style="light" />
      <StatusBand />
      <Text variant="title">Not configured yet.</Text>
      <Text variant="body" tone="muted" style={s.gap}>
        The Supabase keys did not make it into this build. Copy app/.env.example
        to app/.env, fill in EXPO_PUBLIC_SUPABASE_URL and
        EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.
      </Text>
      <Text variant="data" tone="accent" style={s.gap}>
        npx expo start --clear
      </Text>
      <Text variant="small" tone="faint" style={s.gap}>
        The --clear matters. These values are baked in when the bundle is built,
        so a hot reload will keep serving the old one.
      </Text>
    </View>
  );
}

/**
 * Four states, and the person is only ever in one of them: signed out, signed
 * in but not yet shown to be a colleague, a colleague not yet introduced, or in.
 *
 * Stack.Protected removes the screens a person is not entitled to rather than
 * bouncing them off it. There is no moment where a signed out person is on the
 * corridor and being redirected away, because for them the corridor does not
 * exist as a route at all.
 */
function Gate({ scheme }: { scheme: string }) {
  const { loading, session, me, membership, member } = useSession();

  useEffect(() => {
    // The splash stays up until the keychain has been read back, so nobody
    // sees a sign in screen flash past on their way to a live session.
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  const signedIn = session !== null;
  // Just signed in, membership not read yet. A blank frame beats flashing the
  // work email screen at someone who verified last week.
  if (signedIn && membership === null) return null;
  // Four states, one at a time: signed out; signed in but not shown to be a
  // colleague (no work email verified in the last 60 days); a colleague with
  // no profile yet; in.
  const verified = signedIn && member;
  const introduced = verified && me !== null;

  return (
    <StoreProvider>
      {/*
        Keyed by scheme: switching light and dark rebuilds every screen from
        the new palette. The store above keeps its data, so nothing reloads.
      */}
      <Stack
        key={scheme}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
        }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)/sign-in" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !verified}>
          <Stack.Screen name="(auth)/work" />
        </Stack.Protected>

        <Stack.Protected guard={verified && !introduced}>
          <Stack.Screen name="(auth)/profile" />
        </Stack.Protected>

        {/*
          No tab bar. Home is the map, the way ride hailing apps work, and
          everything else is pushed from it. Offering a ride and choosing where
          you get off are tasks you finish and close, so they slide up.
        */}
        <Stack.Protected guard={introduced}>
          <Stack.Screen name="index" />
          <Stack.Screen name="find" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="post" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          {/*
            Instant right after a theme switch, so the rebuilt Account page is
            simply there again in its new colours instead of sliding in.
          */}
          <Stack.Screen name="you" options={() => ({ animation: justSwitchedTheme() ? 'none' : 'default' })} />
          <Stack.Screen name="trip/[id]" />
          <Stack.Screen name="pickup/[id]" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </StoreProvider>
  );
}

const s = themed(() =>
  StyleSheet.create({
  flex: { flex: 1 },
  setup: {
    flex: 1,
    backgroundColor: color.bg,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  gap: { marginTop: space.lg },
  })
);
