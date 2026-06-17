import { randomUUID } from 'node:crypto';
import type { RawNpmData } from '../../collection/readers/npm.js';
import type { NormalizedGraph } from '../../graph/ingester.js';
import type { Scan } from '../models/index.js';

export function normalizeNpm(raw: RawNpmData): NormalizedGraph {
  const scanId = randomUUID();
  const now = new Date().toISOString();

  const packages: NormalizedGraph['packages'] = [];
  const edges: NormalizedGraph['edges'] = [];
  const seenIds = new Set<string>();

  // Root pseudo-package
  const rootId = `${raw.projectName}@${raw.projectVersion}`;
  packages.push({
    id: rootId,
    name: raw.projectName,
    version: raw.projectVersion,
    ecosystem: 'npm',
    isDirect: false,
    isTransitive: false,
    isRoot: true,
    scope: 'production',
  });
  seenIds.add(rootId);

  // All packages from lockfile
  for (const [, entry] of raw.packages) {
    const id = `${entry.name}@${entry.version}`;
    const isDirect = raw.directDependencies.has(entry.name);
    if (!seenIds.has(id)) {
      packages.push({
        id,
        name: entry.name,
        version: entry.version,
        ecosystem: 'npm',
        isDirect,
        isTransitive: !isDirect,
        isRoot: false,
        scope: entry.scope,
        ...(entry.resolved !== undefined && { resolved: entry.resolved }),
        ...(entry.integrity !== undefined && { integrity: entry.integrity }),
      });
      seenIds.add(id);
    }
  }

  // Edges: root → direct dependencies
  for (const [name, { scope }] of raw.directDependencies) {
    const pkg = [...raw.packages.values()].find((p) => p.name === name);
    if (pkg) {
      edges.push({
        fromId: rootId,
        toId: `${pkg.name}@${pkg.version}`,
        type: 'direct',
        scope,
      });
    }
  }

  // Edges: package → its dependencies
  for (const [, entry] of raw.packages) {
    const fromId = `${entry.name}@${entry.version}`;
    for (const depName of entry.dependencies) {
      const depPkg = [...raw.packages.values()].find((p) => p.name === depName);
      if (depPkg) {
        const toId = `${depPkg.name}@${depPkg.version}`;
        edges.push({
          fromId,
          toId,
          type: 'transitive',
          scope: depPkg.scope,
        });
      }
    }
  }

  const directCount = [...raw.packages.values()].filter((p) =>
    raw.directDependencies.has(p.name),
  ).length;
  const devCount = [...raw.packages.values()].filter((p) => p.scope === 'development').length;
  const transitiveCount = packages.length - directCount - 1; // exclude root

  const scan: Scan = {
    id: scanId,
    startedAt: now,
    projectName: raw.projectName,
    projectPath: raw.projectPath,
    packageCount: packages.length - 1, // exclude root
    directCount,
    transitiveCount,
    devCount,
    enriched: false,
  };

  return {
    project: {
      path: raw.projectPath,
      name: raw.projectName,
      version: raw.projectVersion,
      ecosystem: 'npm',
      scannedAt: now,
    },
    packages,
    edges,
    scan,
  };
}
