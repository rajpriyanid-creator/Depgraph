import { describe, it, expect } from 'vitest';
import { classifyLicense } from '../enrichment/license-classifier.js';
import type { Policy } from '../analysis/policy-engine.js';

// We test the pure logic of policy evaluation without Neo4j

describe('Policy configuration shape', () => {
  it('accepts a valid policy object', () => {
    const policy: Policy = {
      security: {
        block_on_severity: 'critical',
        warn_on_severity: 'high',
        max_vulnerability_age_days: 30,
      },
      licenses: {
        allowed: ['MIT', 'Apache-2.0', 'ISC'],
        blocked: ['GPL-3.0', 'AGPL-3.0'],
      },
      health: {
        min_health_score: 30,
        block_abandoned_days: 365,
      },
      supply_chain: {
        typosquatting_check: true,
        ownership_change_alert: true,
      },
    };
    expect(policy.security?.block_on_severity).toBe('critical');
    expect(policy.licenses?.allowed).toContain('MIT');
  });
});

describe('License policy integration', () => {
  it('GPL-3.0 is classified as commercially risky (should be blocked)', () => {
    const c = classifyLicense('GPL-3.0');
    expect(c.isCommerciallyRisky).toBe(true);
  });

  it('MIT passes commercial use check', () => {
    const c = classifyLicense('MIT');
    expect(c.isCommerciallyRisky).toBe(false);
  });

  it('Apache-2.0 passes commercial use check', () => {
    const c = classifyLicense('Apache-2.0');
    expect(c.isCommerciallyRisky).toBe(false);
  });

  it('blocked license detection works via type classification', () => {
    const blockedLicenses = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'SSPL-1.0'];
    for (const lic of blockedLicenses) {
      const c = classifyLicense(lic);
      expect(c.type).toBe('strong-copyleft');
    }
  });
});
