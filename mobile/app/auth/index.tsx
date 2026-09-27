import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { useSession } from '../../src/auth/session';
import { colors, spacing } from '../../src/theme/colors';

export default function AuthScreen() {
  const { sendMagicLink, continueOffline } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSend() {
    setLoading(true);
    setError('');
    const res = await sendMagicLink(email);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not send magic link');
      return;
    }
    setSent(true);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Foodie</Text>
      <Text style={styles.lead}>
        Passwordless sign-in. We email a one-time link — open it on this device to sync
        your inventory.
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
          Link sent. Open it on this phone, or paste the token on the verify screen.
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
