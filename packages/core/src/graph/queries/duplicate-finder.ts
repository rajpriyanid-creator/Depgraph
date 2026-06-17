import { runReadQuery } from '../db.js';

export interface DuplicateGroup {
  name: string;
  allVersions: string[];
  versionDetails: Array<{
    version: string;
    bundleSize?: number;
    requiredBy: string[];
  }>;
  totalWastedBytes: number;
  canDeduplicate: boolean;
  safeVersion?: string;
  severity: 'critical' | 'high' | 'medium';
}

const CRITICAL_PACKAGES = new Set(['react', 'vue', 'angular', '@angular/core', 'svelte']);
const HIGH_PACKAGES = new Set(['lodash', 'moment', 'rxjs', 'core-js', 'tslib', 'axios']);

export async function findDuplicates(_projectName: string): Promise<DuplicateGroup[]> {
  const rows = await runReadQuery<{
    name: string;
    allVersions: string[];
    versionDetails: Array<{ version: string; bundleSize?: number; requiredBy: string[] }>;
  }>(
    `MATCH (p:Package)
     WITH p.name AS name, collect(p) AS versions
     WHERE size(versions) > 1
     RETURN
       name,
       [v IN versions | v.version] AS allVersions,
       [v IN versions | {
         version: v.version,
         bundleSize: v.bundleSize,
         requiredBy: [(req)-[:DEPENDS_ON]->(v) | req.name]
       }] AS versionDetails
     ORDER BY size(versions) DESC
     LIMIT 100`,
    {},
  );

  return rows.map((row) => {
    const sizes = row.versionDetails.map((v) => v.bundleSize ?? 0);
    const maxSize = Math.max(...sizes, 0);
    const totalWastedBytes = sizes.reduce((sum, s) => sum + s, 0) - maxSize;

    let severity: DuplicateGroup['severity'] = 'medium';
    if (CRITICAL_PACKAGES.has(row.name)) severity = 'critical';
    else if (HIGH_PACKAGES.has(row.name) || maxSize > 100_000) severity = 'high';

    return {
      name: row.name,
      allVersions: row.allVersions,
      versionDetails: row.versionDetails,
      totalWastedBytes: Math.max(0, totalWastedBytes),
      canDeduplicate: false as const, // Requires semver range analysis
      severity,
    };
  });
}
