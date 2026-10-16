import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { USING_LOCAL } from '@/data/backend';
import { useSession } from '@/data/session';
import { hasOnboarded, markOnboarded } from '@/lib/onboarding';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AuthScreen } from '@/ui/auth-hero';
import { EyeIcon } from '@/ui/icons';
import { LocalAccounts } from '@/ui/local-accounts';
import { Onboarding } from '@/ui/onboarding';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/text';

const MIN_PASSWORD = 8;

/**
 * Personal email and password, or the test account picker in local mode.
 * The very first time the app is opened on a phone, the intro comes first.
 * Never again after that, unless asked for from Account.
 */
export default function SignInScreen() {
  const [intro, setIntro] = useState<boolean | null>(null);

  useEffect(() => {
    hasOnboarded().then((seen) => setIntro(!seen));
  }, []);

  if (intro === null) return <View style={s.blank} />;
  if (intro) {
    return (
      <Onboarding
        onDone={() => {
          markOnboarded();
          setIntro(false);
        }}
      />
    );
  }
  return USING_LOCAL ? <LocalAccounts /> : <EmailSignIn />;
}

/**
 * The login is personal on purpose. It is the same account the project's
 * other apps use, and it survives a change of job. Whether someone belongs to
 * the corridor is asked next, on its own screen, by a code sent to their work
 * email.
 *
 * Accounts are made by hand for now: there is no mail server to send a
 * confirmation link, so a sign up from here would wait for an email that never
 * comes. Set SELF_SIGN_UP once mail is set up.
 */
const SELF_SIGN_UP = false;

function EmailSignIn() {
  const { signIn, signUp } = useSession();
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState(false);
  const passwordField = useRef<TextInput>(null);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const ready = emailOk && password.length >= (creating ? MIN_PASSWORD : 1);

  async function onSubmit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    if (creating) {
      const result = await signUp(email, password);
      setBusy(false);
      if (!result.ok) setError(result.error);
      else if (result.needsConfirm) setCheckInbox(true);
      return;
    }
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) setError(result.error);
    // On success the session appears and the root layout moves on by itself.
  }

  function switchMode() {
    setCreating((v) => !v);
    setError(null);
    setCheckInbox(false);
  }

  return (
    <AuthScreen
      title={creating ? 'Create your account.' : 'Welcome back.'}
      body={creating ? 'Use your personal email.' : 'Sign in with your personal email.'}
      footer={
        <>
          <Button
            label={busy ? (creating ? 'Creating' : 'Signing in') : creating ? 'Create account' : 'Sign in'}
            onPress={onSubmit}
            disabled={!ready || busy}
            arrow={!busy}
          />
          {SELF_SIGN_UP ? (
            <Pressable onPress={switchMode} accessibilityRole="button" hitSlop={8} style={s.switch}>
              <Text variant="small" tone="muted">
                {creating ? 'Have an account? ' : 'New to Corridor? '}
                <Text variant="small" tone="brand" style={s.bold}>
                  {creating ? 'Sign in' : 'Create an account'}
                </Text>
              </Text>
            </Pressable>
          ) : (
            <Text variant="small" tone="muted" center style={s.switch}>
              New to Corridor? Ask the person who shared it with you for an account.
            </Text>
          )}
        </>
      }>
      <Text variant="eyebrow" style={s.label}>
        Email
      </Text>
      <TextInput
        value={email}
        onChangeText={(t) => {
          setEmail(t.replace(/\s/g, ''));
          if (error) setError(null);
        }}
        onFocus={() => setFocus('email')}
        onBlur={() => setFocus(null)}
        style={[s.field, s.input, focus === 'email' && s.fieldFocus]}
        placeholder="you@email.com"
        placeholderTextColor={color.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordField.current?.focus()}
        accessibilityLabel="Email"
      />

      <Text variant="eyebrow" style={s.label}>
        Password
      </Text>
      <View style={[s.field, s.row, focus === 'password' && s.fieldFocus]}>
        <TextInput
          ref={passwordField}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (error) setError(null);
          }}
          onFocus={() => setFocus('password')}
          onBlur={() => setFocus(null)}
          style={[s.input, s.flex]}
          placeholder={creating ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
          placeholderTextColor={color.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={creating ? 'new-password' : 'current-password'}
          textContentType={creating ? 'newPassword' : 'password'}
          secureTextEntry={!showPassword}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          accessibilityLabel="Password"
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide the password' : 'Show the password'}
          style={({ pressed }) => pressed && s.pressed}>
          <EyeIcon size={20} off={!showPassword} tint={color.inkFaint} />
        </Pressable>
      </View>

      {error ? (
        <Text variant="small" tone="stop" style={s.note}>
          {error}
        </Text>
      ) : checkInbox ? (
        <Text variant="small" tone="go" style={s.note}>
          Check {email.trim()} for a confirmation link, then sign in.
        </Text>
      ) : null}
    </AuthScreen>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    blank: { flex: 1, backgroundColor: color.bg },
    bold: { fontWeight: '700' },
    pressed: { opacity: 0.6 },
    label: { marginBottom: space.sm },
    field: {
      backgroundColor: color.surface,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: color.line,
      paddingHorizontal: space.lg,
      marginBottom: space.lg,
    },
    fieldFocus: { borderColor: color.brand },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    input: {
      paddingVertical: space.lg,
      fontSize: 16,
      fontFamily: font.sans,
      color: color.ink,
    },
    note: { marginTop: space.xs, paddingHorizontal: space.xs },
    switch: { alignSelf: 'center', paddingVertical: space.md },
  })
);
