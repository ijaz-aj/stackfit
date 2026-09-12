// The names enums take in a sentence.
//
// These are not cosmetic. Every string here is printed verbatim into a results
// page, an HTML preview, a DOCX and a PDF that a client reads, and the failures
// they fix were all visible on screen: "vulnerability_management" in a list of
// what a managed service does not cover, "1260 endpoint(s)" in a rate-card
// explanation, and "Microsoft Entra ID Entra ID Free" in the reasons a product
// was ruled out.

import { describe, expect, it } from 'vitest';

import {
  CATEGORY_LABELS,
  EFFORT_CONFIDENCE_LABELS,
  PRICING_CONFIDENCE_LABELS,
  SERVICE_LEVEL_LABELS,
  article,
  formatCount,
  listOf,
  plural,
  skuName,
} from '../src/labels';

describe('CATEGORY_LABELS', () => {
  it('names every category without an underscore or a bare acronym in lower case', () => {
    // The map is keyed by the schema enum, so a new category fails to compile
    // rather than falling through to its own id. What this checks is that no
    // *value* was filled in by pasting the key.
    for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
      expect(label, `${category} is unlabelled`).not.toBe(category);
      expect(label, `${category} kept its underscore`).not.toContain('_');
      expect(label.length, `${category} has an empty label`).toBeGreaterThan(1);
    }
  });
});

describe('the confidence and service-level labels', () => {
  it('never leave an enum value to be read as prose', () => {
    const maps = [PRICING_CONFIDENCE_LABELS, EFFORT_CONFIDENCE_LABELS, SERVICE_LEVEL_LABELS];
    for (const map of maps) {
      for (const [key, label] of Object.entries(map)) {
        expect(label, `${key} is unlabelled`).not.toBe(key);
        expect(label).not.toContain('_');
      }
    }
  });

  it('spells out mdr, which is the one that read as a typo', () => {
    // `Managed alternative at the "mdr" service level` was the sentence.
    expect(SERVICE_LEVEL_LABELS.mdr).toBe('Managed detection and response');
  });
});

describe('listOf', () => {
  it('writes a list the way a person does', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['SIEM'])).toBe('SIEM');
    expect(listOf(['SIEM', 'EDR'])).toBe('SIEM and EDR');
    expect(listOf(['SIEM', 'EDR', 'Identity'])).toBe('SIEM, EDR and Identity');
  });
});

describe('plural', () => {
  it('agrees with its count instead of hedging with (s)', () => {
    expect(plural(1, 'endpoint')).toBe('1 endpoint');
    expect(plural(0, 'endpoint')).toBe('0 endpoints');
    expect(plural(2, 'endpoint')).toBe('2 endpoints');
  });

  it('groups the digits, because this lands mid-sentence', () => {
    // "Base platform fee, plus 1260 endpoint(s)" was the line.
    expect(plural(1260, 'endpoint')).toBe('1,260 endpoints');
  });

  it('takes an irregular plural when one is given', () => {
    expect(plural(3, 'appliance', 'appliances')).toBe('3 appliances');
  });
});

describe('formatCount', () => {
  it('separates thousands and keeps a fractional part where there is one', () => {
    expect(formatCount(3465)).toBe('3,465');
    expect(formatCount(120.33)).toBe('120.33');
    expect(formatCount(0)).toBe('0');
  });
});

describe('article', () => {
  it('picks the article the next word actually takes', () => {
    // "well inside the 120-day allowance for a analyst estimate" was on screen
    // against every analyst-estimated price in the bundle.
    expect(article('analyst estimate')).toBe('an');
    expect(article('public list price')).toBe('a');
    expect(article('vendor quote')).toBe('a');
  });

  it('applies to every grade this is actually used on', () => {
    // The point of the helper is that no call site hardcodes "a" again, so the
    // sweep is over the real inputs rather than invented ones.
    for (const label of Object.values(PRICING_CONFIDENCE_LABELS)) {
      const lower = label.toLowerCase();
      const expected = 'aeiou'.includes(lower[0]!) ? 'an' : 'a';
      expect(article(lower), `"${lower}" got the wrong article`).toBe(expected);
    }
  });
});

describe('skuName', () => {
  it('elides a vendor name the tier repeats', () => {
    // Both observed on the results page, in "Products ruled out for this
    // client", where they read as a stutter rather than a product.
    expect(skuName('Microsoft Entra ID', 'Entra ID Free')).toBe('Microsoft Entra ID Free');
    expect(skuName('Cisco Duo', 'Duo Free')).toBe('Cisco Duo Free');
  });

  it('leaves a tier that adds a real word alone', () => {
    expect(skuName('TheHive', 'Community Edition')).toBe('TheHive Community Edition');
    expect(skuName('runZero', 'Community Edition')).toBe('runZero Community Edition');
    expect(skuName('Sublime Platform', 'Self-hosted (Docker)')).toBe(
      'Sublime Platform Self-hosted (Docker)',
    );
  });

  it('collapses a tier that is only the product name', () => {
    expect(skuName('Velociraptor', 'Velociraptor')).toBe('Velociraptor');
  });

  it('matches on whole words, so a shared prefix is not a shared word', () => {
    // The trap: naive substring elision turns Tenable's two SKUs into
    // "Tenable Expert", losing the product entirely. "Nessus" ends the product
    // name and begins the tier name, but only as part of the longer word
    // "Nessuses" would that be wrong. This is the case that proves the
    // boundary check, not the elision.
    expect(skuName('Tenable Nessus', 'Nessus Expert')).toBe('Tenable Nessus Expert');
    expect(skuName('Tenable', 'Nessus Expert')).toBe('Tenable Nessus Expert');
  });

  it('ignores case when deciding two words are the same word', () => {
    expect(skuName('Elastic Security', 'security Basic')).toBe('Elastic Security Basic');
  });

  it('prefers the longest overlap, not the first one it finds', () => {
    // "ID" alone would match too and leave "Microsoft Entra ID Entra Free".
    expect(skuName('Microsoft Entra ID', 'Entra ID Premium P2')).toBe(
      'Microsoft Entra ID Premium P2',
    );
  });
});
