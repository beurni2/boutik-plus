import { CatalogSchema, type Catalog } from '@platform/i18n';
import rawCatalog from '../i18n/catalog.json';

/**
 * App strings live ONLY in the catalog (Contract §10.5) — never inline in
 * component code. The catalog is validated at load; the copy-lint CI gate
 * lints it on every PR.
 */
export const catalog: Catalog = CatalogSchema.parse(rawCatalog);

const byKey = new Map(catalog.map((entry) => [entry.key, entry]));

export function t(key: string): string {
  const entry = byKey.get(key);
  if (entry === undefined) {
    throw new Error(`missing catalog string: ${key}`);
  }
  return entry.fr;
}
