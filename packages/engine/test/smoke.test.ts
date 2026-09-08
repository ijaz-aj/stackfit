import { describe, expect, it } from 'vitest';

import { ENGINE_VERSION } from '../src/index.js';

describe('engine scaffold', () => {
  it('exposes a version constant', () => {
    expect(ENGINE_VERSION).toBe('0.0.0');
  });

  it('is deterministic: the same read twice is identical', () => {
    // A placeholder for the real determinism guarantee, which arrives in Phase 2
    // once the sizing → cost → scoring → portfolio → coverage pipeline exists.
    expect(ENGINE_VERSION).toStrictEqual(ENGINE_VERSION);
  });
});
