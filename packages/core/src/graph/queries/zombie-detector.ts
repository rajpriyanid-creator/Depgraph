import { runReadQuery } from '../db.js';
import { scanImports } from '../../collection/import-scanner.js';

export type ZombieClassification =
  | 'definitelyUnused'
  | 'scriptOnly'
  | 'typeOnly'
  | 'ambiguous';

export interface Zombie {
  name: string;
  version: string;
  size?: number;
  classification: ZombieClassification;
  installedDays?: number;
}

export async function findZombies(
  projectName: string,
  projectPath: string,
): Promise<Zombie[]> {
  // Load all direct dependencies from Neo4j
  const directPkgs = await runReadQuery<{
    name: string;
    version: string;
    size?: number;
    lastPublished?: string;
  }>(
    `MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON {type: 'direct'}]->(p:Package)
     WHERE p.scope <> 'development'
     RETURN p.name AS name, p.version AS version, p.bundleSizeGzip AS size, p.lastPublished AS lastPublished`,
    { projectName },
  );

  if (directPkgs.length === 0) return [];

  // Scan source files for imports
  const importMap = await scanImports(projectPath);

  const zombies: Zombie[] = [];

  for (const pkg of directPkgs) {
    if (importMap[pkg.name] && importMap[pkg.name]!.count > 0) continue;

    let classification: ZombieClassification = 'definitelyUnused';

    if (pkg.name.startsWith('@types/')) {
      classification = 'typeOnly';
    } else if (/eslint|prettier|husky|lint-staged|commitlint/.test(pkg.name)) {
      classification = 'scriptOnly';
    } else if (!importMap[pkg.name]) {
      // Could be loaded dynamically or via non-standard means
      classification = 'ambiguous';
    }

    const installedDays = pkg.lastPublished
      ? Math.floor((Date.now() - new Date(pkg.lastPublished).getTime()) / 86_400_000)
      : undefined;

    zombies.push({
      name: pkg.name,
      version: pkg.version,
      ...(pkg.size !== undefined && { size: pkg.size }),
      classification,
      ...(installedDays !== undefined && { installedDays }),
    });
  }

  return zombies.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
}
