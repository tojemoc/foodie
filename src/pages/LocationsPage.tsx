import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Location, FoodItem } from '../types';

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');

  const loadData = async () => {
    const [locs, allItems] = await Promise.all([
      db.locations.toArray(),
      db.items.toArray(),
    ]);
    setLocations(locs);
    setItems(allItems);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [locs, allItems] = await Promise.all([
        db.locations.toArray(),
        db.items.toArray(),
      ]);
      if (!cancelled) {
        setLocations(locs);
        setItems(allItems);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function addLocation() {
    if (!newName.trim()) return;
    await db.locations.add({ name: newName.trim(), icon: newIcon });
    setNewName('');
    setNewIcon('📦');
    loadData();
  }

  async function deleteLocation(id: number) {
    const itemCount = await db.items.where('locationId').equals(id).count();
    if (itemCount > 0) {
      alert(`Cannot delete \u2014 ${itemCount} items are stored here`);
      return;
    }
    await db.locations.delete(id);
    loadData();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Locations</h1>
      </div>

      {locations.map((loc) => {
        const count = items.filter((i) => i.locationId === loc.id).length;
        return (
          <div key={loc.id} className="item-card">
            <div className="item-icon">{loc.icon}</div>
            <div className="item-info">
              <div className="item-name">{loc.name}</div>
              <div className="item-location">{count} item{count !== 1 ? 's' : ''}</div>
            </div>
            <button className="delete-btn" onClick={() => deleteLocation(loc.id!)}>✕</button>
          </div>
        );
      })}

      <div className="card" style={{ marginTop: 20 }}>
        <p className="section-title">Add Location</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {['🧊', '❄️', '🗄️', '🍎', '🏠', '📦', '🧺', '🥫'].map((icon) => (
            <button
              key={icon}
              style={{
                fontSize: '1.3rem',
                padding: '6px 8px',
                borderRadius: 8,
                background: newIcon === icon ? 'var(--primary)' : 'var(--bg)',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setNewIcon(icon)}
            >
              {icon}
            </button>
          ))}
        </div>
        <div className="form-group">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Location name"
            onKeyDown={(e) => e.key === 'Enter' && addLocation()}
          />
        </div>
        <button className="btn btn-primary" onClick={addLocation} disabled={!newName.trim()}>
          Add Location
        </button>
      </div>
    </div>
  );
}
