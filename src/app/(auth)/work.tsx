import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { useSession } from '@/data/session';
import { WORK_DOMAIN } from '@/lib/config';
import { color, font, radius, space, themed } from '@/theme/tokens';
import { AuthHero } from '@/ui/auth-hero';
import { Button, Screen } from '@/ui/primitives';
import { Text } from '@/ui/text';

const CODE_LENGTH = 6;
const RESEND_AFTER_S = 60;

/**
 * Prove you are a colleague: a code to your work inbox, typed back in.
 *
 * Shown after sign in whenever there is no verified work email, or the last
 * one is more than 60 days old. Someone who has left can no longer read that
 * inbox, so they stop at this screen, and their account is untouched.
 */
export default function WorkEmailScreen() {
  const { membership, sendWorkCode, verifyWorkCode, signOut } = useSession();
  const lapsed = Boolean(membership?.workEmail);

  const [handle, setHandle] = useState(membership?.workEmail?.split('@')[0] ?? '');
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
    if (busy || handle.trim().length < 2) return;
    setBusy(true);
    setError(null);
    const result = await sendWorkCode(handle);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentTo(`${handle.trim().toLowerCase()}@${WORK_DOMAIN}`);
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
    <Screen
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
              disabled={busy || handle.trim().length < 2}
              arrow={!busy}
            />
          )}
          <Button label="Sign out" kind="quiet" onPress={signOut} />
        </>
      }>
      <AuthHero
        title={lapsed ? 'Quick check' : 'Confirm your work email'}
        body={
          lapsed
            ? 'Every 60 days we check you still work here.'
            : 'Corridor is for colleagues only. We will send you a code.'
        }
      />

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
          {/*
            The domain is shown, not typed. It makes the closed group visible
            and removes the commonest way to mistype an address. It comes from
            the environment so the employer's name never enters the repo.
          */}
          <View style={[s.inputRow, error ? s.inputRowError : null]}>
            <TextInput
              value={handle}
              onChangeText={(t) => {
                // People paste the whole address; keep the part before the @.
                setHandle(t.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, ''));
                if (error) setError(null);
              }}
              style={s.input}
              placeholder="first.last"
              placeholderTextColor={color.inkFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={send}
              accessibilityLabel="The first part of your work email address"
            />
            <Text variant="data" tone="faint" style={s.domain}>
              @{WORK_DOMAIN}
            </Text>
          </View>
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
        Only used to confirm you are a colleague. Nobody else sees it.
      </Text>
    </Screen>
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
      backgroundColor: color.sunken,
      borderWidth: 1.5,
      borderColor: 'transparent',
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
    domain: { paddingLeft: space.xs },
    spinner: { marginTop: space.md },
    spacer: { flex: 1, minHeight: space.xl },
    privacy: { textAlign: 'center' },
  })
);
