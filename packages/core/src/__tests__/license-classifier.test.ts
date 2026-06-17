import { describe, it, expect } from 'vitest';
import { classifyLicense } from '../enrichment/license-classifier.js';

describe('classifyLicense', () => {
  it('classifies MIT as permissive', () => {
    const result = classifyLicense('MIT');
    expect(result.type).toBe('permissive');
    expect(result.isCommerciallyRisky).toBe(false);
  });

  it('classifies Apache-2.0 as permissive', () => {
    const result = classifyLicense('Apache-2.0');
    expect(result.type).toBe('permissive');
  });

  it('classifies ISC as permissive', () => {
    const result = classifyLicense('ISC');
    expect(result.type).toBe('permissive');
  });

  it('classifies LGPL-2.1 as weak-copyleft', () => {
    const result = classifyLicense('LGPL-2.1');
    expect(result.type).toBe('weak-copyleft');
    expect(result.isCommerciallyRisky).toBe(false);
  });

  it('classifies GPL-3.0 as strong-copyleft and risky', () => {
    const result = classifyLicense('GPL-3.0');
    expect(result.type).toBe('strong-copyleft');
    expect(result.isCommerciallyRisky).toBe(true);
  });

  it('classifies AGPL-3.0 as strong-copyleft and risky', () => {
    const result = classifyLicense('AGPL-3.0');
    expect(result.type).toBe('strong-copyleft');
    expect(result.isCommerciallyRisky).toBe(true);
  });

  it('classifies SSPL-1.0 as strong-copyleft', () => {
    const result = classifyLicense('SSPL-1.0');
    expect(result.type).toBe('strong-copyleft');
  });

  it('handles undefined gracefully', () => {
    const result = classifyLicense(undefined);
    expect(result.type).toBe('unknown');
    expect(result.isCommerciallyRisky).toBe(false);
  });

  it('handles empty string', () => {
    const result = classifyLicense('');
    expect(result.type).toBe('unknown');
  });

  it('handles unknown SPDX expression', () => {
    const result = classifyLicense('LicenseRef-custom');
    // starts with LicenseRef — matches SPDX-like pattern
    expect(result.type).toBe('unknown');
  });

  it('preserves spdxId in result', () => {
    const result = classifyLicense('MIT');
    expect(result.spdxId).toBe('MIT');
  });
});
