import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { getItems, removeItem, touchItem, updateItem } from '../../src/items/store';
import { pushToRemote } from '../../src/items/sync';
import { daysUntilExpiry, getExpiryStatus } from '../../src/items/types';
import { colors, spacing } from '../../src/theme/colors';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const item = getItems().find((c) => c.id === id);

  if (!item) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Item not found.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const status = getExpiryStatus(item.expiryDate);
  const days = daysUntilExpiry(item.expiryDate);

  return (
    <View style={styles.screen}>
      <Text style={styles.emoji}>{item.emoji || '🍽️'}</Text>
      <Text style={styles.name}>{item.productName || item.name}</Text>
      {!!item.brand && <Text style={styles.muted}>{item.brand}</Text>}
      <Text style={styles.meta}>
        {[item.placement, item.quantity ? `${item.quantity} ${item.unit ?? ''}`.trim() : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text style={styles.meta}>
        Expiry: {item.expiryDate ?? '—'} ({status}
        {days !== null ? `, ${days}d` : ''})
      </Text>
      {!!item.number && <Text style={styles.muted}>Barcode {item.number}</Text>}
      {!!item.lookupSource && <Text style={styles.muted}>Lookup: {item.lookupSource}</Text>}
      {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}

      <Button
        title="Mark used / delete"
        variant="danger"
        onPress={() => {
          removeItem(item.id);
          void pushToRemote();
          router.replace('/');
        }}
      />
      <Button
        title="Bump updated time"
        variant="ghost"
        onPress={() => {
          updateItem(touchItem(item));
          void pushToRemote();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  emoji: { fontSize: 48 },
  name: { color: colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: colors.text, fontSize: 15 },
  muted: { color: colors.textMuted },
  notes: { color: colors.textMuted, marginVertical: spacing.md },
});
