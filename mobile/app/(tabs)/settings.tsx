import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, SectionTitle } from '../../src/components/Button';
import { useSession } from '../../src/auth/session';
import { API_BASE, fetchPrefs, updatePrefs } from '../../src/api/client';
import { syncOnOpen, pushToRemote } from '../../src/items/sync';
import { addItem, getItems, makeItem } from '../../src/items/store';
import { parseInventoryCsv } from '../../src/items/csvImport';
import { DEFAULT_PLACEMENTS } from '../../src/items/types';
import {
  isDailyExpiryDigestScheduled,
  notifyExpiringSoonNow,
  registerDailyExpiryDigest,
  unregisterDailyExpiryDigest,
} from '../../src/notifications/expiryAlerts';
import { PRODUCE_CATALOG } from '../../src/produce/catalog';
import { colors, spacing } from '../../src/theme/colors';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bratislava';
  } catch {
    return 'Europe/Bratislava';
  }
}

export default function SettingsScreen() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const count = getItems().length;
  const [pushOn, setPushOn] = useState(false);
  const [emailOn, setEmailOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    setPushOn(await isDailyExpiryDigestScheduled());
    if (!session) {
      setEmailOn(false);
      return;
    }
    const prefs = await fetchPrefs();
    if (!prefs.error) setEmailOn(!!prefs.emailDigest);
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onEnablePush() {
    setBusy(true);
    setStatus('');
    const res = await registerDailyExpiryDigest();
    setBusy(false);
    if (!res.ok) {
      setStatus(res.error ?? 'Could not enable notifications');
      return;
    }
    await notifyExpiringSoonNow();
    setPushOn(true);
    setStatus('Daily expiry notification set for 8:00 (local).');
  }

  async function onDisablePush() {
    setBusy(true);
    await unregisterDailyExpiryDigest();
    setBusy(false);
    setPushOn(false);
    setStatus('Local expiry notifications turned off.');
  }

  async function onToggleEmail() {
    if (!session) {
      setStatus('Sign in to register for the daily email recap.');
      return;
    }
    setBusy(true);
    setStatus('');
    const next = !emailOn;
    const res = await updatePrefs({ emailDigest: next, timezone: deviceTimezone() });
    setBusy(false);
    if (res.error) {
      setStatus(res.error);
      return;
    }
    setEmailOn(next);
    setStatus(
      next
        ? `Email recap on — ~8:00 ${deviceTimezone()}, items expiring within 7 days.`
        : 'Email recap turned off.',
    );
  }

  async function onImportCsv() {
    setBusy(true);
    setStatus('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) {
        setBusy(false);
        return;
      }
      const asset = picked.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri);
      const { rows, skipped } = parseInventoryCsv(text);
      if (!rows.length) {
        setStatus(`No rows imported${skipped ? ` (${skipped} skipped)` : ''}.`);
        setBusy(false);
        return;
      }

      const placementMeta = Object.fromEntries(
        DEFAULT_PLACEMENTS.map(p => [p.id, p]),
      );

      for (const row of rows) {
        const meta = placementMeta[row.placement || ''] ?? {
          emoji: '🥗',
          color: '#6B7280',
        };
        addItem(
          makeItem({
            name: row.name,
            productName: row.name,
            number: '',
            format: 'MANUAL',
            category: row.placement || 'grocery',
            notes: row.notes,
            expiryDate: row.expiryDate,
            placement: row.placement,
            color: meta.color,
            emoji: meta.emoji,
            quantity: row.quantity,
            unit: row.unit,
            source: 'manual',
          }),
        );
      }
      await pushToRemote();
      setStatus(`Imported ${rows.length} item(s)${skipped ? `, skipped ${skipped}` : ''}.`);
      Alert.alert('Import complete', `Added ${rows.length} items from CSV.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed');
    }
    setBusy(false);
  }

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

      <SectionTitle>Reminders</SectionTitle>
      <Text style={styles.muted}>
        Push: local 8:00 reminder for items expiring within 7 days. Email: Worker
        digest to your account address (requires sign-in + sync).
      </Text>
      {pushOn ? (
        <Button title="Disable expiry notifications" variant="secondary" loading={busy} onPress={() => void onDisablePush()} />
      ) : (
        <Button title="Enable expiry notifications" loading={busy} onPress={() => void onEnablePush()} />
      )}
      <Button
        title={emailOn ? 'Daily email recap · on' : 'Register daily email recap'}
        variant="secondary"
        loading={busy}
        onPress={() => void onToggleEmail()}
      />

      <SectionTitle>Data</SectionTitle>
      <Button title="Import inventúra CSV" loading={busy} onPress={() => void onImportCsv()} />
      <Text style={styles.muted}>
        CSV columns: jedlo, koľko, miesto, dátum — e.g. 2x oatly,1 l,pantry,6.6.2027
      </Text>
      {!!status && <Text style={styles.status}>{status}</Text>}

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
  status: { color: colors.fresh, lineHeight: 20 },
  mono: {
    color: colors.accent,
    fontFamily: 'monospace',
    backgroundColor: colors.bgElevated,
    padding: spacing.sm,
    borderRadius: 8,
  },
});
