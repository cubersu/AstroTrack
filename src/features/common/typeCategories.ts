import type { DsoType } from '../../astro/objectTypes';

export const TYPE_CATEGORIES: Record<'galaxies' | 'nebulae' | 'planetary' | 'clusters', DsoType[]> =
  {
    galaxies: ['galaxy', 'galaxy-group'],
    nebulae: [
      'emission-nebula',
      'hii-region',
      'reflection-nebula',
      'emission-reflection-nebula',
      'nebula',
      'cluster-nebula',
      'dark-nebula',
      'supernova-remnant',
    ],
    planetary: ['planetary-nebula'],
    clusters: ['open-cluster', 'globular-cluster', 'star-cloud'],
  };
export type TypeCategory = keyof typeof TYPE_CATEGORIES;
export const CATEGORY_KEYS = Object.keys(TYPE_CATEGORIES) as TypeCategory[];

export function typesForCategories(cats: TypeCategory[]): DsoType[] | undefined {
  if (cats.length === 0) return undefined;
  return cats.flatMap((c) => TYPE_CATEGORIES[c]);
}
