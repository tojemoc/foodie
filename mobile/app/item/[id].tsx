import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { getCards, removeCard, touchCard, updateCard } from '../../src/cards/store';
import { pushToRemote } from '../../src/cards/sync';
import { daysUntilExpiry, getExpiryStatus } from '../../src/cards/types';
import { colors, spacing } from '../../src/theme/colors';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const card = getCards().find((c) => c.id === id);

  if (!card) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Item not found.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const status = getExpiryStatus(card.expiryDate);
  const days = daysUntilExpiry(card.expiryDate);

  return (
    <View style={styles.screen}>
      <Text style={styles.emoji}>{card.emoji || '🍽️'}</Text>
      <Text style={styles.name}>{card.productName || card.name}</Text>
      {!!card.brand && <Text style={styles.muted}>{card.brand}</Text>}
      <Text style={styles.meta}>
        {[card.placement, card.quantity ? `${card.quantity} ${card.unit ?? ''}`.trim() : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text style={styles.meta}>
        Expiry: {card.expiryDate ?? '—'} ({status}
        {days !== null ? `, ${days}d` : ''})
      </Text>
      {!!card.number && <Text style={styles.muted}>Barcode {card.number}</Text>}
      {!!card.lookupSource && <Text style={styles.muted}>Lookup: {card.lookupSource}</Text>}
      {!!card.notes && <Text style={styles.notes}>{card.notes}</Text>}

      <Button
        title="Mark used / delete"
        variant="danger"
        onPress={() => {
          removeCard(card.id);
          void pushToRemote();
          router.replace('/');
        }}
      />
      <Button
        title="Bump updated time"
        variant="ghost"
        onPress={() => {
          updateCard(touchCard(card));
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
