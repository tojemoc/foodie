import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { ItemCard } from '../../src/components/ItemCard';
import { getItems, subscribe } from '../../src/items/store';
import { onSyncStatus } from '../../src/items/sync';
import type { Item, SyncStatus } from '../../src/items/types';
import { getExpiryStatus } from '../../src/items/types';
import { useSession } from '../../src/auth/session';
import { colors, spacing } from '../../src/theme/colors';

type Filter = 'all' | 'expiring' | 'expired';

export default function InventoryScreen() {
  const router = useRouter();
  const { session, ready } = useSession();
  const [items, setItemsState] = useState<Item[]>(getItems());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [syncLabel, setSyncLabel] = useState('Local');

  useEffect(() => subscribe(() => setItemsState(getItems())), []);
  useEffect(
    () =>
      onSyncStatus((_s: SyncStatus, message?: string) => {
        if (message) setSyncLabel(message);
      }),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((c) => {
        if (filter === 'expiring') return getExpiryStatus(c.expiryDate) === 'expiring-soon';
        if (filter === 'expired') return getExpiryStatus(c.expiryDate) === 'expired';
        return true;
      })
      .filter((c) => {
        if (!q) return true;
        return [c.name, c.productName, c.brand, c.placement, c.notes]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const ae = a.expiryDate ?? '9999';
        const be = b.expiryDate ?? '9999';
        return ae.localeCompare(be);
      });
  }, [items, query, filter]);

  const onPressItem = useCallback(
    (id: string) => {
      router.push(`/item/${id}`);
    },
    [router],
  );

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <Text style={styles.sync}>{syncLabel}</Text>
        {!session ? (
          <Link href="/auth" asChild>
            <Pressable>
              <Text style={styles.link}>Sign in</Text>
            </Pressable>
          </Link>
        ) : (
          <Text style={styles.muted}>{session.username}</Text>
        )}
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search inventory"
        placeholderTextColor={colors.textMuted}
        style={styles.search}
      />

      <View style={styles.filters}>
        {(['all', 'expiring', 'expired'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All' : f === 'expiring' ? 'Soon' : 'Expired'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.muted}>
              Scan a barcode, snap produce, or add an item manually.
            </Text>
            <Link href="/add" asChild>
              <Pressable style={styles.cta}>
                <Text style={styles.ctaText}>Add item</Text>
              </Pressable>
            </Link>
          </View>
        }
        renderItem={({ item }) => (
          <ItemCard item={item} onPress={() => onPressItem(item.id)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  sync: { color: colors.textMuted, fontSize: 12 },
  link: { color: colors.accent, fontWeight: '700' },
  muted: { color: colors.textMuted },
  search: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
  },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: colors.text },
  list: { paddingBottom: spacing.xl },
  empty: { alignItems: 'center', paddingTop: 48, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cta: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaText: { color: colors.bg, fontWeight: '800' },
});
