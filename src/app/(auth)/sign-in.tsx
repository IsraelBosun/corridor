import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { USING_LOCAL } from '@/data/backend';
import { useSession } from '@/data/session';
import { cleanEmail, emailProblem } from '@/lib/email';
import { hasOnboarded, markOnboarded } from '@/lib/onboarding';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AuthScreen } from '@/ui/auth-hero';
import { EyeIcon } from '@/ui/icons';
import { LocalAccounts } from '@/ui/local-accounts';
import { Onboarding } from '@/ui/onboarding';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/text';

const MIN_PASSWORD = 8;
/** Supabase sends 6 digits by default; the dashboard can raise it to 10. */
const CODE_MIN = 6;
const CODE_MAX = 10;

/**
 * Personal email and password, or the test account picker in local mode.
 * The very first time the app is opened on a phone, the intro comes first.
 * Never again after that, unless asked for from Account.
 */
export default function SignInScreen() {
  const [intro, setIntro] = useState<boolean | null>(null);
  // Whoever just sat through the intro is almost always new, so they land on
  // create account. Everyone else lands on sign in.
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    hasOnboarded().then((seen) => setIntro(!seen));
  }, []);

  if (intro === null) return <View style={s.blank} />;
  if (intro) {
    return (
      <Onboarding
        onDone={() => {
          markOnboarded();
          setFresh(true);
          setIntro(false);
        }}
      />
    );
  }
  return USING_LOCAL ? <LocalAccounts /> : <EmailSignIn startCreating={fresh} />;
}

/**
 * The login is personal on purpose. It is the same account the project's
 * other apps use, and it survives a change of job. Whether someone belongs to
 * the corridor is asked next, on its own screen, by a code sent to their work
 * email.
 *
 * Sign up needs Supabase Auth to send the confirmation link, which it does
 * through the custom SMTP set in the dashboard (Authentication, Emails). If
 * that is ever removed, set SELF_SIGN_UP back to false: Supabase's own mailer
 * only reaches the project's team, so everyone else would wait forever.
 */
const SELF_SIGN_UP = true;

function EmailSignIn({ startCreating }: { startCreating: boolean }) {
  const { signIn, signUp } = useSession();
  const [creating, setCreating] = useState(SELF_SIGN_UP && startCreating);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What is wrong with the email, shown under its box once the button is tapped.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState(false);
  const [resetting, setResetting] = useState(false);
  const passwordField = useRef<TextInput>(null);

  const ready = email.length > 0 && password.length >= (creating ? MIN_PASSWORD : 1);

  async function onSubmit() {
    if (!ready || busy) return;
    const problem = emailProblem(email);
    setEmailError(problem);
    if (problem) return;
    setBusy(true);
    setError(null);
    if (creating) {
      const result = await signUp(cleanEmail(email), password);
      setBusy(false);
      if (!result.ok) setError(result.error);
      else if (result.needsConfirm) setCheckInbox(true);
      return;
    }
    const result = await signIn(cleanEmail(email), password);
    setBusy(false);
    if (!result.ok) setError(result.error);
    // On success the session appears and the root layout moves on by itself.
  }

  function switchMode() {
    setCreating((v) => !v);
    setError(null);
    setEmailError(null);
    setCheckInbox(false);
  }

  if (resetting) {
    return (
      <ResetPassword
        initialEmail={email}
        onBack={() => {
          setResetting(false);
          setError(null);
        }}
      />
    );
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
          if (emailError) setEmailError(null);
        }}
        onFocus={() => setFocus('email')}
        onBlur={() => setFocus(null)}
        style={[s.field, s.input, focus === 'email' && s.fieldFocus, emailError && s.fieldBad]}
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
      {emailError ? (
        <Text variant="small" tone="stop" style={s.emailError}>
          {emailError}
        </Text>
      ) : null}

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

      {!creating ? (
        <Pressable
          onPress={() => setResetting(true)}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [s.forgot, pressed && s.pressed]}>
          <Text variant="small" tone="brand" style={s.bold}>
            Forgot your password?
          </Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text variant="small" tone="stop" style={s.note}>
          {error}
        </Text>
      ) : checkInbox ? (
        <Text variant="small" tone="go" style={s.note}>
          Check {cleanEmail(email)} for a confirmation link. Open it on this phone and
          Corridor signs you in. Opened anywhere else, it still confirms you: come
          back here and sign in.
        </Text>
      ) : null}
    </AuthScreen>
  );
}

/**
 * A forgotten password, done by a code rather than a link. A link has to open
 * the app from the email, and people often read their email on a different
 * device. The code signs them in, then the new password is set, and the root
 * layout moves on like any sign in.
 */
function ResetPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const { sendPasswordReset, resetPassword } = useSession();
  const [email, setEmail] = useState(initialEmail.trim());
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<'email' | 'code' | 'password' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const codeField = useRef<TextInput>(null);
  const passwordField = useRef<TextInput>(null);

  const ready = sent ? code.length >= CODE_MIN && password.length >= MIN_PASSWORD : email.length > 0;

  async function onSend() {
    if (!email || busy) return;
    const problem = emailProblem(email);
    setEmailError(problem);
    if (problem) return;
    setBusy(true);
    setError(null);
    const result = await sendPasswordReset(cleanEmail(email));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    setCode('');
    setTimeout(() => codeField.current?.focus(), 300);
  }

  async function onReset() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const result = await resetPassword(cleanEmail(email), code, password);
    // On success this screen is already on its way out.
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  function clear() {
    if (error) setError(null);
  }

  return (
    <AuthScreen
      title={sent ? 'Check your email.' : 'Reset your password.'}
      body={
        sent
          ? `If there is an account for ${cleanEmail(email)}, a code is on its way. It works for one hour.`
          : 'We will email a code to your personal email.'
      }
      footer={
        <>
          <Button
            label={busy ? (sent ? 'Saving' : 'Sending') : sent ? 'Set new password' : 'Send me a code'}
            onPress={sent ? onReset : onSend}
            disabled={!ready || busy}
            arrow={!busy}
          />
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={s.switch}>
            <Text variant="small" tone="muted">
              Remembered it?{' '}
              <Text variant="small" tone="brand" style={s.bold}>
                Sign in
              </Text>
            </Text>
          </Pressable>
        </>
      }>
      {!sent ? (
        <>
          <Text variant="eyebrow" style={s.label}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t.replace(/\s/g, ''));
              clear();
              if (emailError) setEmailError(null);
            }}
            onFocus={() => setFocus('email')}
            onBlur={() => setFocus(null)}
            style={[s.field, s.input, focus === 'email' && s.fieldFocus, emailError && s.fieldBad]}
            placeholder="you@email.com"
            placeholderTextColor={color.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={onSend}
            accessibilityLabel="Email"
          />
          {emailError ? (
            <Text variant="small" tone="stop" style={s.emailError}>
              {emailError}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text variant="eyebrow" style={s.label}>
            Code
          </Text>
          <TextInput
            ref={codeField}
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/[^0-9]/g, '').slice(0, CODE_MAX));
              clear();
            }}
            onFocus={() => setFocus('code')}
            onBlur={() => setFocus(null)}
            style={[s.field, s.input, s.codeInput, focus === 'code' && s.fieldFocus]}
            placeholder="000000"
            placeholderTextColor={color.inkFaint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="next"
            onSubmitEditing={() => passwordField.current?.focus()}
            accessibilityLabel="The code from your email"
          />

          <Text variant="eyebrow" style={s.label}>
            New password
          </Text>
          <View style={[s.field, s.row, focus === 'password' && s.fieldFocus]}>
            <TextInput
              ref={passwordField}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                clear();
              }}
              onFocus={() => setFocus('password')}
              onBlur={() => setFocus(null)}
              style={[s.input, s.flex]}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              placeholderTextColor={color.inkFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={onReset}
              accessibilityLabel="New password"
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

          <Pressable
            onPress={onSend}
            disabled={busy}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [s.forgot, pressed && s.pressed]}>
            <Text variant="small" tone="brand" style={s.bold}>
              Send a new code
            </Text>
          </Pressable>
        </>
      )}

      {error ? (
        <Text variant="small" tone="stop" style={s.note}>
          {error}
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
    fieldBad: { borderColor: color.stop },
    emailError: { marginTop: -space.sm, marginBottom: space.lg, paddingHorizontal: space.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    input: {
      paddingVertical: space.lg,
      fontSize: 16,
      fontFamily: font.sans,
      color: color.ink,
    },
    note: { marginTop: space.xs, paddingHorizontal: space.xs },
    switch: { alignSelf: 'center', paddingVertical: space.md },
    forgot: { alignSelf: 'flex-end', marginTop: -space.sm, marginBottom: space.md, paddingHorizontal: space.xs },
    codeInput: { letterSpacing: 8, fontSize: 24, fontFamily: font.mono, textAlign: 'center' },
  })
);
