import Dexie, { type EntityTable } from 'dexie';
import type { FoodItem, Location } from '../types';

const db = new Dexie('FoodieDB') as Dexie & {
  items: EntityTable<FoodItem, 'id'>;
  locations: EntityTable<Location, 'id'>;
};

db.version(1).stores({
  items: '++id, name, ean, expiryDate, locationId, createdAt, updatedAt',
  locations: '++id, name',
});

export async function seedDefaultLocations() {
  const count = await db.locations.count();
  if (count === 0) {
    await db.locations.bulkAdd([
      { name: 'Fridge', icon: '🧊' },
      { name: 'Freezer', icon: '❄️' },
      { name: 'Pantry', icon: '🗄️' },
      { name: 'Counter', icon: '🍎' },
    ]);
  }
}

export { db };
