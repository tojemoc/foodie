import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { useSession } from '../../src/auth/session';
import { colors, spacing } from '../../src/theme/colors';

function tokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const q = parsed.queryParams ?? {};
    const t = q.token ?? q.t;
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

export default function VerifyScreen() {
  const { verifyMagicToken } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      const t = tokenFromUrl(url);
      if (t) setToken(t);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const t = tokenFromUrl(url);
      if (t) setToken(t);
    });
    return () => sub.remove();
  }, []);

  async function onVerify(value = token) {
    if (!value.trim()) return;
    setLoading(true);
    setError('');
    const res = await verifyMagicToken(value.trim());
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Verification failed');
      return;
    }
    router.replace('/');
  }

  useEffect(() => {
    if (params.token) void onVerify(params.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>
        Paste the magic-link token, or open the email link so it deep-links into Foodie.
      </Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="Magic-link token"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button title="Verify" onPress={() => void onVerify()} loading={loading} disabled={!token.trim()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
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
});
