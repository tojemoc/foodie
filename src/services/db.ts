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

db.on('populate', (tx) => {
  tx.table('locations').bulkAdd([
    { name: 'Fridge', icon: '🧊' },
    { name: 'Freezer', icon: '❄️' },
    { name: 'Pantry', icon: '🗄️' },
    { name: 'Counter', icon: '🍎' },
  ]);
});

let seedPromise: Promise<void> | null = null;

export function seedDefaultLocations(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const count = await db.locations.count();
      if (count === 0) {
        await db.locations.bulkAdd([
          { name: 'Fridge', icon: '🧊' },
          { name: 'Freezer', icon: '❄️' },
          { name: 'Pantry', icon: '🗄️' },
          { name: 'Counter', icon: '🍎' },
        ]);
      }
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

export { db };
