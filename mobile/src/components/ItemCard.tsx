import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Card } from '../cards/types';
import { daysUntilExpiry, getExpiryStatus } from '../cards/types';
import { colors, spacing } from '../theme/colors';

interface Props {
  card: Card;
  onPress: () => void;
}

export function ItemCard({ card, onPress }: Props) {
  const status = getExpiryStatus(card.expiryDate);
  const days = daysUntilExpiry(card.expiryDate);
  const statusColor =
    status === 'expired'
      ? colors.expired
      : status === 'expiring-soon'
        ? colors.expiring
        : status === 'fresh'
          ? colors.fresh
          : colors.unknown;

  let expiryLabel = 'No expiry set';
  if (days !== null) {
    if (days < 0) expiryLabel = `Expired ${Math.abs(days)}d ago`;
    else if (days === 0) expiryLabel = 'Expires today';
    else if (days === 1) expiryLabel = 'Expires tomorrow';
    else expiryLabel = `${days} days left`;
  }

  const qty =
    card.quantity && card.quantity > 0
      ? `${card.quantity}${card.unit ? ` ${card.unit}` : ''}`
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={[styles.stripe, { backgroundColor: statusColor }]} />
      <View style={styles.body}>
        <Text style={styles.emoji}>{card.emoji || '🍽️'}</Text>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {card.productName || card.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[card.placement, qty, card.brand].filter(Boolean).join(' · ') || 'Unplaced'}
          </Text>
          <Text style={[styles.expiry, { color: statusColor }]}>{expiryLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  stripe: { width: 5 },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  emoji: { fontSize: 28 },
  meta: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  expiry: { fontSize: 13, fontWeight: '600', marginTop: 4 },
});
