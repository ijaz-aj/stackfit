import { describe, expect, it } from 'vitest';

import { SCHEMA_PACKAGE_VERSION } from '../src/index.js';

describe('schema scaffold', () => {
  it('exposes a version constant', () => {
    expect(SCHEMA_PACKAGE_VERSION).toBe('0.0.0');
  });
});
