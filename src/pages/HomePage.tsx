import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { tryPushCloudSnapshotAfterMutation } from '../services/cloudSyncAuth';
import type { FoodItem, Location } from '../types';
import { getExpiryStatus } from '../types';
import ItemCard from '../components/ItemCard';

type FilterType = 'all' | 'fresh' | 'expiring-soon' | 'expired';

export default function HomePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FoodItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allItems, allLocs] = await Promise.all([
          db.items.toArray(),
          db.locations.toArray(),
        ]);
        if (!cancelled) {
          allItems.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
          setItems(allItems);
          setLocations(allLocs);
        }
      } catch (err) {
        console.error('Failed to load items:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleDelete(id: number) {
    try {
      await db.items.delete(id);
      await tryPushCloudSnapshotAfterMutation();
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Failed to delete item:', err);
      alert('Failed to delete item. Please try again.');
    }
  }

  const filtered = filter === 'all'
    ? items
    : items.filter((i) => getExpiryStatus(new Date(i.expiryDate)) === filter);

  const stats = {
    fresh: items.filter((i) => getExpiryStatus(new Date(i.expiryDate)) === 'fresh').length,
    expiring: items.filter((i) => getExpiryStatus(new Date(i.expiryDate)) === 'expiring-soon').length,
    expired: items.filter((i) => getExpiryStatus(new Date(i.expiryDate)) === 'expired').length,
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Foodie</h1>
      </div>

      <div className="stats-row">
        <div className="stat-card fresh">
          <span className="stat-num">{stats.fresh}</span>
          <span className="stat-label">Fresh</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-num">{stats.expiring}</span>
          <span className="stat-label">Expiring</span>
        </div>
        <div className="stat-card danger">
          <span className="stat-num">{stats.expired}</span>
          <span className="stat-label">Expired</span>
        </div>
      </div>

      <div className="filter-tabs">
        {(['all', 'fresh', 'expiring-soon', 'expired'] as FilterType[]).map((f) => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'expiring-soon' ? 'Expiring' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🛒</span>
          <h3>No items yet</h3>
          <p>Tap + to scan your first product</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <h3>No matches</h3>
          <p>No items match the selected filter</p>
        </div>
      ) : (
        filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            location={locations.find((l) => l.id === item.locationId)}
            onDelete={handleDelete}
          />
        ))
      )}

      <button className="fab" aria-label="Add item" onClick={() => navigate('/add')}>+</button>
    </div>
  );
}