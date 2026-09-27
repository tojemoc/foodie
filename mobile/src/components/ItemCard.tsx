import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Item } from '../items/types';
import { daysUntilExpiry, getExpiryStatus } from '../items/types';
import { colors, spacing } from '../theme/colors';

interface Props {
  item: Item;
  onPress: () => void;
}

export function ItemCard({ item, onPress }: Props) {
  const status = getExpiryStatus(item.expiryDate);
  const days = daysUntilExpiry(item.expiryDate);
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
    item.quantity && item.quantity > 0
      ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={[styles.stripe, { backgroundColor: statusColor }]} />
      <View style={styles.body}>
        <Text style={styles.emoji}>{item.emoji || '🍽️'}</Text>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {item.productName || item.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[item.placement, qty, item.brand].filter(Boolean).join(' · ') || 'Unplaced'}
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
