import type { FoodItem, Location } from '../types';
import { getExpiryStatus, daysUntilExpiry } from '../types';

interface Props {
  item: FoodItem;
  location?: Location;
  onDelete: (id: number) => void;
}

function formatExpiry(days: number): string {
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days}d left`;
}

export default function ItemCard({ item, location, onDelete }: Props) {
  const status = getExpiryStatus(new Date(item.expiryDate));
  const days = daysUntilExpiry(new Date(item.expiryDate));

  return (
    <div className="item-card">
      <div className="item-icon">
        {location?.icon || '🍽️'}
      </div>
      <div className="item-info">
        <div className="item-name">{item.name}</div>
        <div className="item-location">
          {location?.name || 'Unknown'} &middot; {new Date(item.expiryDate).toLocaleDateString()}
        </div>
      </div>
      <span className={`expiry-badge ${status}`}>
        {formatExpiry(days)}
      </span>
      <button className="delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(item.id!); }} title="Delete">
        ✕
      </button>
    </div>
  );
}
