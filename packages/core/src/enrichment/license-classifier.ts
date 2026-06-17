import { runReadQuery } from '../graph/db.js';

export type LicenseType = 'permissive' | 'weak-copyleft' | 'strong-copyleft' | 'proprietary' | 'unknown';

const PERMISSIVE = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
  'Unlicense', 'CC0-1.0', '0BSD', 'WTFPL', 'Zlib', 'BlueOak-1.0.0',
  'BSD-4-Clause', 'AFL-3.0', 'ECL-2.0', 'MS-PL',
]);

const WEAK_COPYLEFT = new Set([
  'LGPL-2.0', 'LGPL-2.0-only', 'LGPL-2.0-or-later',
  'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
  'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  'MPL-2.0', 'EUPL-1.2', 'CDDL-1.0', 'EPL-1.0', 'EPL-2.0',
  'EUPL-1.1', 'LGPL-3.0-linking-exception',
]);

const STRONG_COPYLEFT = new Set([
  'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later',
  'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'AGPL-1.0', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
  'SSPL-1.0', 'BUSL-1.1', 'EUPL-1.0',
  'OSL-3.0', 'RPL-1.5',
]);

export interface LicenseClassification {
  spdxId: string;
  type: LicenseType;
  isCommerciallyRisky: boolean;
}

export function classifyLicense(spdxId?: string | null): LicenseClassification {
  if (!spdxId || spdxId === '' || spdxId.toUpperCase() === 'SEE LICENSE IN FILE' || spdxId === 'CUSTOM') {
    return { spdxId: spdxId ?? 'unknown', type: 'unknown', isCommerciallyRisky: false };
  }

  const normalized = spdxId.trim();

  if (PERMISSIVE.has(normalized)) {
    return { spdxId: normalized, type: 'permissive', isCommerciallyRisky: false };
  }
  if (WEAK_COPYLEFT.has(normalized)) {
    return { spdxId: normalized, type: 'weak-copyleft', isCommerciallyRisky: false };
  }
  if (STRONG_COPYLEFT.has(normalized)) {
    return { spdxId: normalized, type: 'strong-copyleft', isCommerciallyRisky: true };
  }
  // Heuristic: if it looks like a known SPDX expression but isn't in our lists
  if (/^[A-Za-z0-9._+-]+$/.test(normalized)) {
    return { spdxId: normalized, type: 'unknown', isCommerciallyRisky: false };
  }
  // Non-SPDX = proprietary
  return { spdxId: normalized, type: 'proprietary', isCommerciallyRisky: true };
}

export interface LicenseViolation {
  packageName: string;
  packageVersion: string;
  license: string;
  licenseType: string;
  path: string[];
}

export async function traceLicenseContamination(
  projectName: string,
): Promise<LicenseViolation[]> {
  const rows = await runReadQuery<{
    chain: string[];
    pkgName: string;
    pkgVersion: string;
    license: string;
  }>(
    `MATCH path = (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON*1..20]->(p:Package)
     WHERE p.license IS NOT NULL
     WITH p, [n IN nodes(path) | n.name] AS chain
     RETURN chain, p.name AS pkgName, p.version AS pkgVersion, p.license AS license`,
    { projectName },
  );

  const violations: LicenseViolation[] = [];
  for (const row of rows) {
    const classification = classifyLicense(row.license);
    if (classification.type === 'strong-copyleft') {
      violations.push({
        packageName: row.pkgName,
        packageVersion: row.pkgVersion,
        license: row.license,
        licenseType: classification.type,
        path: row.chain,
      });
    }
  }
  return violations;
}
