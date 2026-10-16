import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { useSession } from '@/data/session';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AuthScreen } from '@/ui/auth-hero';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/text';

const CODE_LENGTH = 6;
const RESEND_AFTER_S = 60;
// Shape only. Whether the domain counts as work email is the server's call.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Prove you have a job: a code to your work inbox, typed back in. Any work
 * domain is accepted; personal and throwaway providers are refused by the
 * server.
 *
 * Shown after sign in whenever there is no verified work email, or the last
 * one is more than 60 days old. Someone who has left can no longer read that
 * inbox, so they stop at this screen, and their account is untouched.
 */
export default function WorkEmailScreen() {
  const { membership, sendWorkCode, verifyWorkCode, signOut } = useSession();
  const lapsed = Boolean(membership?.workEmail);

  const [email, setEmail] = useState(membership?.workEmail ?? '');
  const ready = LOOKS_LIKE_EMAIL.test(email.trim());
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeField = useRef<TextInput>(null);

  // A second ticker for "send again", so nobody hammers a colleague's inbox.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    const result = await sendWorkCode(email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentTo(email.trim().toLowerCase());
    setCode('');
    setWait(RESEND_AFTER_S);
    setTimeout(() => codeField.current?.focus(), 300);
  }

  async function verify() {
    if (busy || code.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    const result = await verifyWorkCode(code);
    setBusy(false);
    if (!result.ok) setError(result.error);
    // On success membership turns true and the root layout moves on.
  }

  return (
    <AuthScreen
      title={lapsed ? 'Quick check.' : 'Confirm your work email.'}
      body={
        lapsed
          ? 'Every 60 days we check your work email still works.'
          : 'Corridor is for people with a verified work email. We will send you a code.'
      }
      footer={
        <>
          {sentTo ? (
            <Button
              label={busy ? 'Checking' : 'Confirm'}
              onPress={verify}
              disabled={busy || code.length !== CODE_LENGTH}
              arrow={!busy}
            />
          ) : (
            <Button
              label={busy ? 'Sending' : 'Send me a code'}
              onPress={send}
              disabled={busy || !ready}
              arrow={!busy}
            />
          )}
          <Button label="Sign out" kind="quiet" onPress={signOut} />
        </>
      }>
      {sentTo ? (
        <>
          <Text variant="body" tone="muted" style={s.lead}>
            We sent a {CODE_LENGTH} digit code to{' '}
            <Text variant="body" style={s.bold}>
              {sentTo}
            </Text>
            . It works for 10 minutes.
          </Text>
          <View style={[s.inputRow, error ? s.inputRowError : null]}>
            <TextInput
              ref={codeField}
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH));
                if (error) setError(null);
              }}
              style={[s.input, s.codeInput]}
              placeholder="000000"
              placeholderTextColor={color.lineStrong}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              returnKeyType="go"
              onSubmitEditing={verify}
              accessibilityLabel="The code from your work email"
            />
          </View>
          <View style={s.row}>
            <Button
              label={wait > 0 ? `Send again in ${wait}s` : 'Send again'}
              kind="secondary"
              disabled={wait > 0 || busy}
              onPress={send}
              style={s.flex}
            />
            <Button
              label="Change email"
              kind="quiet"
              onPress={() => {
                setSentTo(null);
                setError(null);
              }}
              style={s.flex}
            />
          </View>
          <Text variant="small" tone="faint" style={s.hint}>
            Not there? Check your junk folder.
          </Text>
        </>
      ) : (
        <>
          <View style={[s.inputRow, error ? s.inputRowError : null]}>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t.replace(/\s/g, ''));
                if (error) setError(null);
              }}
              style={s.input}
              placeholder="you@yourcompany.com"
              placeholderTextColor={color.inkFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={send}
              accessibilityLabel="Your work email address"
            />
          </View>
          <Text variant="small" tone="faint" style={s.hint}>
            Personal addresses like Gmail or Yahoo will not work.
          </Text>
        </>
      )}

      {error ? (
        <Text variant="small" tone="stop" style={s.hint}>
          {error}
        </Text>
      ) : null}

      {busy ? <ActivityIndicator style={s.spinner} color={color.inkFaint} /> : null}

      <View style={s.spacer} />

      <Text variant="small" tone="faint" style={s.privacy}>
        Only used to confirm where you work. Nobody else sees it.
      </Text>
    </AuthScreen>
  );
}

const s = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '700' },
    lead: { marginBottom: space.lg },
    label: { marginBottom: space.sm },
    row: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
    hint: { marginTop: space.xs },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: color.surface,
      borderWidth: 1.5,
      borderColor: color.line,
      borderRadius: radius.lg,
      paddingHorizontal: space.lg,
      marginBottom: space.md,
    },
    inputRowError: { borderColor: color.stop },
    input: {
      flex: 1,
      paddingVertical: space.lg,
      fontSize: 16,
      fontFamily: font.sans,
      color: color.ink,
    },
    codeInput: { letterSpacing: 8, fontSize: 24, fontFamily: font.mono, textAlign: 'center' },
    spinner: { marginTop: space.md },
    spacer: { flex: 1, minHeight: space.xl },
    privacy: { textAlign: 'center' },
  })
);
