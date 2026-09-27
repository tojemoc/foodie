import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, SectionTitle } from '../../src/components/Button';
import { useSession } from '../../src/auth/session';
import { API_BASE } from '../../src/api/client';
import { syncOnOpen } from '../../src/items/sync';
import { getItems } from '../../src/items/store';
import { PRODUCE_CATALOG } from '../../src/produce/catalog';
import { colors, spacing } from '../../src/theme/colors';

export default function SettingsScreen() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const count = getItems().length;

  return (
    <View style={styles.screen}>
      <SectionTitle>Account</SectionTitle>
      {session ? (
        <>
          <Text style={styles.body}>Signed in as {session.username}</Text>
          <Button title="Sync now" onPress={() => void syncOnOpen()} />
          <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Working offline. Sign in with a magic link to sync via the Foodie Worker.
          </Text>
          <Button title="Sign in" onPress={() => router.push('/auth')} />
        </>
      )}

      <SectionTitle>API</SectionTitle>
      <Text style={styles.mono}>{API_BASE}</Text>
      <Text style={styles.muted}>
        Set EXPO_PUBLIC_API_URL when building. Passkeys stay on the web client for now;
        native uses magic-link auth.
      </Text>

      <SectionTitle>On-device intelligence</SectionTitle>
      <Text style={styles.body}>
        Offline produce catalog: {PRODUCE_CATALOG.length} items. Product lookups hit Open
        Food Facts → Open Products Facts → Open Beauty Facts → UPCitemdb, then cache
        locally. Date OCR uses on-device text recognition + a multi-format parser — no LLM.
      </Text>
      <Text style={styles.muted}>Inventory items on device: {count}</Text>

      <SectionTitle>SideStore</SectionTitle>
      <Text style={styles.body}>
        Unsigned IPAs from GitHub Actions install through SideStore. Add the AltStore
        source from the project Pages URL after the first mobile release publish.
      </Text>
      <Button
        title="Open Foodie on GitHub"
        variant="ghost"
        onPress={() => void Linking.openURL('https://github.com/tojemoc/foodie')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  body: { color: colors.text, lineHeight: 22 },
  muted: { color: colors.textMuted, lineHeight: 20 },
  mono: {
    color: colors.accent,
    fontFamily: 'monospace',
    backgroundColor: colors.bgElevated,
    padding: spacing.sm,
    borderRadius: 8,
  },
});
