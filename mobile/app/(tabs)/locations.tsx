import { StyleSheet, Text, View } from 'react-native';
import { getItems, subscribe } from '../../src/items/store';
import { DEFAULT_PLACEMENTS } from '../../src/items/types';
import { colors, spacing } from '../../src/theme/colors';
import { useEffect, useState } from 'react';

export default function LocationsScreen() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const recompute = () => {
      const next: Record<string, number> = {};
      for (const p of DEFAULT_PLACEMENTS) next[p.name] = 0;
      for (const c of getItems()) {
        const key = c.placement || 'Unplaced';
        next[key] = (next[key] ?? 0) + 1;
      }
      setCounts(next);
    };
    recompute();
    return subscribe(recompute);
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>Placement buckets used when adding items.</Text>
      {DEFAULT_PLACEMENTS.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.emoji}>{p.emoji}</Text>
          <View style={styles.meta}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.muted}>{counts[p.name] ?? 0} items</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  lead: { color: colors.textMuted, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emoji: { fontSize: 28 },
  meta: { flex: 1 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.textMuted, marginTop: 2 },
});
