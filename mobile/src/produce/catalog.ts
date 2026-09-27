export interface ProduceEntry {
  id: string;
  name: string;
  emoji: string;
  /** Default fridge/counter shelf life in days when unmarked. */
  shelfLifeDays: number;
  defaultPlacement: 'fridge' | 'freezer' | 'pantry' | 'counter';
  defaultUnit: 'pc' | 'bunch' | 'g' | 'kg';
  /** Dominant hue degrees (0–360) for colour matching. */
  hues: number[];
  /** Relative saturation / value bands 0–1. */
  saturation: [number, number];
  value: [number, number];
  /** Keywords / ML-label aliases for on-device classifiers. */
  aliases: string[];
  /** Typical count when photographed as a small pile. */
  typicalQuantity: number;
}

/**
 * Curated offline produce database.
 * Used for photo recognition without calling an LLM.
 * Users' corrections are layered on top at runtime.
 */
export const PRODUCE_CATALOG: ProduceEntry[] = [
  {
    id: 'banana',
    name: 'Banana',
    emoji: '🍌',
    shelfLifeDays: 5,
    defaultPlacement: 'counter',
    defaultUnit: 'pc',
    hues: [45, 55, 65],
    saturation: [0.45, 1],
    value: [0.45, 0.95],
    aliases: ['banana', 'bananas', 'plantain'],
    typicalQuantity: 5,
  },
  {
    id: 'apple',
    name: 'Apple',
    emoji: '🍎',
    shelfLifeDays: 21,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [0, 10, 350, 35, 100, 120],
    saturation: [0.4, 1],
    value: [0.35, 0.9],
    aliases: ['apple', 'apples', 'granny smith', 'fuji'],
    typicalQuantity: 4,
  },
  {
    id: 'orange',
    name: 'Orange',
    emoji: '🍊',
    shelfLifeDays: 14,
    defaultPlacement: 'counter',
    defaultUnit: 'pc',
    hues: [20, 30, 40],
    saturation: [0.55, 1],
    value: [0.45, 0.95],
    aliases: ['orange', 'oranges', 'citrus'],
    typicalQuantity: 4,
  },
  {
    id: 'lemon',
    name: 'Lemon',
    emoji: '🍋',
    shelfLifeDays: 21,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [50, 58, 62],
    saturation: [0.5, 1],
    value: [0.55, 1],
    aliases: ['lemon', 'lemons'],
    typicalQuantity: 3,
  },
  {
    id: 'lime',
    name: 'Lime',
    emoji: '🍋',
    shelfLifeDays: 14,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [90, 100, 110],
    saturation: [0.45, 1],
    value: [0.35, 0.85],
    aliases: ['lime', 'limes'],
    typicalQuantity: 4,
  },
  {
    id: 'strawberry',
    name: 'Strawberry',
    emoji: '🍓',
    shelfLifeDays: 4,
    defaultPlacement: 'fridge',
    defaultUnit: 'g',
    hues: [0, 5, 355],
    saturation: [0.55, 1],
    value: [0.35, 0.85],
    aliases: ['strawberry', 'strawberries'],
    typicalQuantity: 250,
  },
  {
    id: 'blueberry',
    name: 'Blueberry',
    emoji: '🫐',
    shelfLifeDays: 7,
    defaultPlacement: 'fridge',
    defaultUnit: 'g',
    hues: [220, 240, 260],
    saturation: [0.3, 0.9],
    value: [0.15, 0.55],
    aliases: ['blueberry', 'blueberries'],
    typicalQuantity: 200,
  },
  {
    id: 'grape',
    name: 'Grape',
    emoji: '🍇',
    shelfLifeDays: 7,
    defaultPlacement: 'fridge',
    defaultUnit: 'g',
    hues: [280, 300, 120],
    saturation: [0.3, 0.9],
    value: [0.2, 0.7],
    aliases: ['grape', 'grapes'],
    typicalQuantity: 400,
  },
  {
    id: 'tomato',
    name: 'Tomato',
    emoji: '🍅',
    shelfLifeDays: 7,
    defaultPlacement: 'counter',
    defaultUnit: 'pc',
    hues: [0, 8, 15, 350],
    saturation: [0.55, 1],
    value: [0.35, 0.9],
    aliases: ['tomato', 'tomatoes'],
    typicalQuantity: 4,
  },
  {
    id: 'cucumber',
    name: 'Cucumber',
    emoji: '🥒',
    shelfLifeDays: 7,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [100, 115, 130],
    saturation: [0.35, 0.95],
    value: [0.25, 0.7],
    aliases: ['cucumber', 'cucumbers'],
    typicalQuantity: 1,
  },
  {
    id: 'carrot',
    name: 'Carrot',
    emoji: '🥕',
    shelfLifeDays: 21,
    defaultPlacement: 'fridge',
    defaultUnit: 'g',
    hues: [18, 25, 32],
    saturation: [0.6, 1],
    value: [0.45, 0.95],
    aliases: ['carrot', 'carrots'],
    typicalQuantity: 500,
  },
  {
    id: 'broccoli',
    name: 'Broccoli',
    emoji: '🥦',
    shelfLifeDays: 5,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [110, 125, 140],
    saturation: [0.35, 0.9],
    value: [0.2, 0.55],
    aliases: ['broccoli'],
    typicalQuantity: 1,
  },
  {
    id: 'avocado',
    name: 'Avocado',
    emoji: '🥑',
    shelfLifeDays: 4,
    defaultPlacement: 'counter',
    defaultUnit: 'pc',
    hues: [80, 95, 40],
    saturation: [0.25, 0.8],
    value: [0.15, 0.55],
    aliases: ['avocado', 'avocados'],
    typicalQuantity: 2,
  },
  {
    id: 'potato',
    name: 'Potato',
    emoji: '🥔',
    shelfLifeDays: 30,
    defaultPlacement: 'pantry',
    defaultUnit: 'kg',
    hues: [30, 40, 50],
    saturation: [0.15, 0.55],
    value: [0.35, 0.75],
    aliases: ['potato', 'potatoes'],
    typicalQuantity: 1,
  },
  {
    id: 'onion',
    name: 'Onion',
    emoji: '🧅',
    shelfLifeDays: 30,
    defaultPlacement: 'pantry',
    defaultUnit: 'pc',
    hues: [25, 35, 45],
    saturation: [0.25, 0.7],
    value: [0.4, 0.85],
    aliases: ['onion', 'onions'],
    typicalQuantity: 3,
  },
  {
    id: 'garlic',
    name: 'Garlic',
    emoji: '🧄',
    shelfLifeDays: 60,
    defaultPlacement: 'pantry',
    defaultUnit: 'pc',
    hues: [45, 55],
    saturation: [0.05, 0.35],
    value: [0.7, 1],
    aliases: ['garlic'],
    typicalQuantity: 1,
  },
  {
    id: 'pepper',
    name: 'Bell pepper',
    emoji: '🫑',
    shelfLifeDays: 7,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [0, 10, 110, 55],
    saturation: [0.55, 1],
    value: [0.35, 0.9],
    aliases: ['bell pepper', 'pepper', 'capsicum'],
    typicalQuantity: 2,
  },
  {
    id: 'lettuce',
    name: 'Lettuce',
    emoji: '🥬',
    shelfLifeDays: 5,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [95, 110, 125],
    saturation: [0.3, 0.9],
    value: [0.35, 0.85],
    aliases: ['lettuce', 'salad', 'romaine', 'iceberg'],
    typicalQuantity: 1,
  },
  {
    id: 'mushroom',
    name: 'Mushroom',
    emoji: '🍄',
    shelfLifeDays: 5,
    defaultPlacement: 'fridge',
    defaultUnit: 'g',
    hues: [25, 35],
    saturation: [0.1, 0.45],
    value: [0.35, 0.75],
    aliases: ['mushroom', 'mushrooms'],
    typicalQuantity: 250,
  },
  {
    id: 'egg',
    name: 'Eggs',
    emoji: '🥚',
    shelfLifeDays: 28,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [40, 50],
    saturation: [0.05, 0.4],
    value: [0.7, 1],
    aliases: ['egg', 'eggs'],
    typicalQuantity: 6,
  },
  {
    id: 'bread',
    name: 'Bread',
    emoji: '🍞',
    shelfLifeDays: 5,
    defaultPlacement: 'counter',
    defaultUnit: 'pc',
    hues: [30, 40],
    saturation: [0.2, 0.6],
    value: [0.45, 0.85],
    aliases: ['bread', 'loaf', 'baguette'],
    typicalQuantity: 1,
  },
  {
    id: 'milk',
    name: 'Milk',
    emoji: '🥛',
    shelfLifeDays: 7,
    defaultPlacement: 'fridge',
    defaultUnit: 'pc',
    hues: [0],
    saturation: [0, 0.15],
    value: [0.85, 1],
    aliases: ['milk', 'dairy'],
    typicalQuantity: 1,
  },
  {
    id: 'cheese',
    name: 'Cheese',
    emoji: '🧀',
    shelfLifeDays: 14,
    defaultPlacement: 'fridge',
    defaultUnit: 'g',
    hues: [40, 50],
    saturation: [0.45, 0.95],
    value: [0.55, 0.95],
    aliases: ['cheese'],
    typicalQuantity: 200,
  },
];

export function findProduceById(id: string): ProduceEntry | undefined {
  return PRODUCE_CATALOG.find((p) => p.id === id);
}

export function findProduceByAlias(label: string): ProduceEntry | undefined {
  const needle = label.trim().toLowerCase();
  if (!needle) return undefined;
  return PRODUCE_CATALOG.find((p) => {
    if (p.name.toLowerCase() === needle) return true;
    return p.aliases.some((a) => {
      const alias = a.toLowerCase();
      return alias === needle || wholeWordMatch(needle, alias);
    });
  });
}

/** True when `alias` appears as a whole word inside `label`. */
function wholeWordMatch(label: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(label);
}
