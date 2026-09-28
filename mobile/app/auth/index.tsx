import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { useSession } from '../../src/auth/session';
import { colors, spacing } from '../../src/theme/colors';

const LAST_EMAIL_KEY = 'foodie_last_magic_email';

export default function AuthScreen() {
  const { sendMagicLink, continueOffline } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSend() {
    setLoading(true);
    setError('');
    setDevCode('');
    const normalized = email.trim().toLowerCase();
    const res = await sendMagicLink(normalized);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not send magic link');
      return;
    }
    try {
      await AsyncStorage.setItem(LAST_EMAIL_KEY, normalized);
    } catch {
      // Still show send confirmation — email was already delivered.
    }
    setSent(true);
    if (res.code) setDevCode(res.code);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Foodie</Text>
      <Text style={styles.lead}>
        Passwordless sign-in. We email a one-time link and a 6-digit passcode —
        open the foodie:// link on this device, or paste the passcode on Verify.
      </Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
        value={email}
        onChangeText={setEmail}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {sent ? (
        <Text style={styles.ok}>
          {devCode
            ? `Dev / no-email mode — passcode ${devCode}. Use Paste / open verify.`
            : 'Link sent. Open the foodie:// link or enter the 6-digit passcode on Verify. Do not open the web link in a browser first if you want the app session.'}
        </Text>
      ) : (
        <Button title="Email magic link" onPress={() => void onSend()} loading={loading} disabled={!email.includes('@')} />
      )}
      <Button title="Paste / open verify" variant="secondary" onPress={() => router.push('/auth/verify')} />
      <Button
        title="Continue offline"
        variant="ghost"
        onPress={() => {
          continueOffline();
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.accent, fontSize: 36, fontWeight: '900', marginBottom: spacing.sm },
  lead: { color: colors.textMuted, lineHeight: 22, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  error: { color: colors.danger },
  ok: { color: colors.fresh, lineHeight: 22 },
});
