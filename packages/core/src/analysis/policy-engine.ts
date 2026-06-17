import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runReadQuery } from '../graph/db.js';
import { classifyLicense } from '../enrichment/license-classifier.js';

export interface Policy {
  security?: {
    block_on_severity?: string;
    warn_on_severity?: string;
    max_vulnerability_age_days?: number;
  };
  licenses?: {
    allowed?: string[];
    blocked?: string[];
  };
  health?: {
    min_health_score?: number;
    block_abandoned_days?: number;
  };
  supply_chain?: {
    typosquatting_check?: boolean;
    ownership_change_alert?: boolean;
  };
}

export interface PolicyViolation {
  type: 'security' | 'license' | 'health' | 'supply_chain';
  packageName: string;
  packageVersion: string;
  message: string;
  severity: 'blocking' | 'warning';
}

export interface PolicyResult {
  passed: boolean;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
  summary: string;
}

export function loadPolicy(projectPath: string): Policy {
  const policyPath = join(projectPath, '.depgraph.yml');
  if (!existsSync(policyPath)) {
    return {};
  }
  return (yaml.load(readFileSync(policyPath, 'utf-8')) as Policy) ?? {};
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

export async function evaluatePolicy(
  projectName: string,
  policy: Policy,
): Promise<PolicyResult> {
  const violations: PolicyViolation[] = [];
  const warnings: PolicyViolation[] = [];

  // Security checks
  if (policy.security) {
    const blockLevel = policy.security.block_on_severity ?? 'critical';
    const warnLevel = policy.security.warn_on_severity ?? 'high';

    const vulnPkgs = await runReadQuery<{
      name: string;
      version: string;
      severity: string;
    }>(
      `MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON*1..20]->(p:Package)-[:HAS_VULNERABILITY]->(v:Vulnerability)
       RETURN DISTINCT p.name AS name, p.version AS version, v.severity AS severity`,
      { projectName },
    );

    for (const pkg of vulnPkgs) {
      const pkgSeverityLevel = SEVERITY_ORDER[pkg.severity] ?? 0;
      const blockSeverityLevel = SEVERITY_ORDER[blockLevel] ?? 4;
      const warnSeverityLevel = SEVERITY_ORDER[warnLevel] ?? 3;

      if (pkgSeverityLevel >= blockSeverityLevel) {
        violations.push({
          type: 'security',
          packageName: pkg.name,
          packageVersion: pkg.version,
          message: `Package has ${pkg.severity} vulnerability (policy blocks on: ${blockLevel})`,
          severity: 'blocking',
        });
      } else if (pkgSeverityLevel >= warnSeverityLevel) {
        warnings.push({
          type: 'security',
          packageName: pkg.name,
          packageVersion: pkg.version,
          message: `Package has ${pkg.severity} vulnerability`,
          severity: 'warning',
        });
      }
    }
  }

  // License checks
  if (policy.licenses) {
    const licensedPkgs = await runReadQuery<{ name: string; version: string; license: string }>(
      `MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON*1..20]->(p:Package)
       WHERE p.license IS NOT NULL
       RETURN DISTINCT p.name AS name, p.version AS version, p.license AS license`,
      { projectName },
    );

    for (const pkg of licensedPkgs) {
      const classification = classifyLicense(pkg.license);

      if (policy.licenses.blocked?.includes(pkg.license)) {
        violations.push({
          type: 'license',
          packageName: pkg.name,
          packageVersion: pkg.version,
          message: `License ${pkg.license} is explicitly blocked by policy`,
          severity: 'blocking',
        });
      } else if (policy.licenses.allowed && !policy.licenses.allowed.includes(pkg.license)) {
        if (classification.type === 'strong-copyleft' || classification.type === 'proprietary') {
          violations.push({
            type: 'license',
            packageName: pkg.name,
            packageVersion: pkg.version,
            message: `License ${pkg.license} (${classification.type}) is not in the allowed list`,
            severity: 'blocking',
          });
        }
      }
    }
  }

  // Health checks
  if (policy.health) {
    const { min_health_score, block_abandoned_days } = policy.health;

    if (min_health_score !== undefined) {
      const unhealthyPkgs = await runReadQuery<{ name: string; version: string; healthScore: number }>(
        `MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON*1..20]->(p:Package)
         WHERE p.healthScore IS NOT NULL AND p.healthScore < $minScore
         RETURN DISTINCT p.name AS name, p.version AS version, p.healthScore AS healthScore
         ORDER BY p.healthScore ASC LIMIT 20`,
        { projectName, minScore: min_health_score },
      );

      for (const pkg of unhealthyPkgs) {
        warnings.push({
          type: 'health',
          packageName: pkg.name,
          packageVersion: pkg.version,
          message: `Health score ${pkg.healthScore} is below minimum ${min_health_score}`,
          severity: 'warning',
        });
      }
    }

    if (block_abandoned_days !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - block_abandoned_days);

      const abandonedPkgs = await runReadQuery<{ name: string; version: string; lastPublished: string }>(
        `MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON*1..20]->(p:Package)
         WHERE p.lastPublished IS NOT NULL AND p.lastPublished < $cutoff
         RETURN DISTINCT p.name AS name, p.version AS version, p.lastPublished AS lastPublished
         LIMIT 20`,
        { projectName, cutoff: cutoff.toISOString() },
      );

      for (const pkg of abandonedPkgs) {
        warnings.push({
          type: 'health',
          packageName: pkg.name,
          packageVersion: pkg.version,
          message: `Package last published ${pkg.lastPublished} — possibly abandoned`,
          severity: 'warning',
        });
      }
    }
  }

  const passed = violations.length === 0;
  const summary = passed
    ? `✅ Policy check passed (${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`
    : `❌ Policy check FAILED: ${violations.length} violation${violations.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`;

  return { passed, violations, warnings, summary };
}
