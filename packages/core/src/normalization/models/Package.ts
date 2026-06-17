import type { Ecosystem } from './Project.js';

export type PackageScope = 'production' | 'development' | 'peer' | 'optional' | 'build';

/**
 * A single dependency package in the graph.
 */
export interface Package {
  /** Unique identifier: `{name}@{version}` */
  id: string;

  /** Package name as registered in the ecosystem registry. */
  name: string;

  /** Resolved, pinned version string. */
  version: string;

  /** Ecosystem this package belongs to. */
  ecosystem: Ecosystem;

  /** Whether this is a direct dependency listed in the manifest. */
  isDirect: boolean;

  /** Whether this only appears in the lockfile (not the manifest). */
  isTransitive: boolean;

  /** Whether this is the root project pseudo-package. */
  isRoot: boolean;

  /** Dependency scope as declared by the consumer. */
  scope: PackageScope;

  /** Resolved URL from the lockfile (npm). */
  resolved?: string;

  /** Integrity hash from the lockfile. */
  integrity?: string;

  /** SPDX license identifier (set after enrichment). */
  license?: string;

  /** Homepage or npm registry URL. */
  homepage?: string;

  /** Description from the registry. */
  description?: string;

  /** Bundle size in raw bytes (set after bundle analysis). */
  bundleSize?: number;

  /** Bundle size gzipped in bytes (set after bundle analysis). */
  bundleSizeGzip?: number;

  /** Composite health score 0–100 (set after health enrichment). */
  healthScore?: number;

  /** Human-readable health label. */
  healthLabel?: 'healthy' | 'watch' | 'caution' | 'risky';

  /** Highest CVE severity found (set after vulnerability enrichment). */
  cveSeverity?: 'critical' | 'high' | 'medium' | 'low';

  /** All CVE IDs affecting this package. */
  cveIds?: string[];

  /** ISO date of last publish to the registry. */
  lastPublished?: string;

  /** Number of active maintainers. */
  maintainerCount?: number;

  /** Whether the source repository has been archived. */
  repoArchived?: boolean;
}
