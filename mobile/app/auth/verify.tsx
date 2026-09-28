import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { useSession } from '../../src/auth/session';
import { credentialFromAuthUrl, normalizeMagicCredential } from '../../src/auth/magicCredential';
import { colors, spacing } from '../../src/theme/colors';

export default function VerifyScreen() {
  const { verifyMagicToken } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; magic?: string; t?: string }>();
  const paramCredential = [params.token, params.magic, params.t]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean) ?? '';
  const [token, setToken] = useState(paramCredential);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const verifyingRef = useRef(false);
  const autoTriedRef = useRef<string | null>(null);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      const t = credentialFromAuthUrl(url);
      if (t) setToken(t);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const t = credentialFromAuthUrl(url);
      if (t) setToken(t);
    });
    return () => sub.remove();
  }, []);

  async function onVerify(value = token) {
    const credential = normalizeMagicCredential(value);
    if (!credential || verifyingRef.current) return;
    verifyingRef.current = true;
    setLoading(true);
    setError('');
    // Reflect normalized value (e.g. extracted from a pasted URL).
    if (credential !== value.trim()) setToken(credential);
    const res = await verifyMagicToken(credential);
    verifyingRef.current = false;
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Verification failed');
      return;
    }
    router.replace('/');
  }

  useEffect(() => {
    if (!paramCredential) return;
    if (autoTriedRef.current === paramCredential) return;
    autoTriedRef.current = paramCredential;
    void onVerify(paramCredential);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramCredential]);

  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>
        Paste the 6-digit passcode from the email, the magic-link token, or open
        foodie://auth/verify so it deep-links into Foodie.
      </Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="Passcode or magic-link token"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
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
