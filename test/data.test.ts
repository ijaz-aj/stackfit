import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateDataTree } from '../scripts/lib/validate-data';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = validateDataTree(join(REPO_ROOT, 'data'));

describe('committed data/ tree', () => {
  it('validates with no issues', () => {
    // Printed in full rather than asserted on length alone, so a failure names
    // the file and field instead of just a count.
    expect(result.issues).toEqual([]);
  });

  it('has a seed catalog covering at least 8 products across at least 3 categories', () => {
    expect(result.productCount).toBeGreaterThanOrEqual(8);
    expect(result.catalogFileCount).toBeGreaterThanOrEqual(3);
  });

  it('has frameworks for every control the catalog claims', () => {
    // validateDataTree reports an issue for any unresolved control id, so a
    // clean issue list already proves this. Asserted separately to say so.
    expect(result.controlCount).toBeGreaterThan(0);
    expect(result.issues.filter((issue) => issue.message.includes('controlsCovered'))).toEqual([]);
  });

  it('lists every placeholder-priced tier so none can hide', () => {
    // Not a failure — placeholders are legitimate and expected. This exists so
    // the count changing is visible in a diff, and so docs/STATUS.md can be
    // checked against it. Currently empty: every seeded price is sourced.
    expect(
      result.placeholders.map((entry) => `${entry.productId}/${entry.tierId}`).sort(),
    ).toMatchInlineSnapshot(`[]`);
  });
});
