import type { PackageScope } from './Package.js';

/**
 * A directed edge from one package (or the root project) to another.
 */
export interface DependencyEdge {
  /** ID of the parent package (`{name}@{version}`) or project path. */
  fromId: string;

  /** ID of the child package. */
  toId: string;

  /** Whether this is a first-level or transitive edge. */
  type: 'direct' | 'transitive';

  /** Scope inherited from the child package declaration. */
  scope: PackageScope;
}

/**
 * A resolved version range requirement.
 */
export interface Version {
  /** The range string as declared (e.g. `^1.2.3`). */
  range: string;

  /** The resolved pinned version. */
  resolved: string;
}

/**
 * A known security vulnerability affecting a package.
 */
export interface Vulnerability {
  /** CVE or GHSA identifier, e.g. CVE-2023-45857 or GHSA-xxx. */
  id: string;

  /** Short summary of the vulnerability. */
  summary: string;

  /** Severity classification. */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';

  /** CVSS numeric score (0.0–10.0). */
  cvssScore?: number;

  /** First version that contains a fix. */
  fixedInVersion?: string;

  /** SemVer range of affected versions. */
  affectedVersionRange?: string;

  /** ISO date when the advisory was published. */
  publishedAt?: string;

  /** Source of the advisory (osv, github). */
  source?: 'osv' | 'github';
}

/**
 * A software license node in the graph.
 */
export interface License {
  /** SPDX identifier, e.g. MIT, Apache-2.0. */
  spdxId: string;

  /** Broad classification of the license. */
  type: 'permissive' | 'weak-copyleft' | 'strong-copyleft' | 'proprietary' | 'unknown';
}

/**
 * A scan record — one complete analysis run of a project.
 */
export interface Scan {
  /** Unique scan identifier (UUID). */
  id: string;

  /** ISO timestamp of scan start. */
  startedAt: string;

  /** ISO timestamp of scan completion. */
  completedAt?: string;

  /** Name of the scanned project. */
  projectName: string;

  /** Filesystem path of the scanned project. */
  projectPath: string;

  /** Total number of packages (direct + transitive). */
  packageCount: number;

  /** Number of direct dependencies. */
  directCount: number;

  /** Number of transitive dependencies. */
  transitiveCount: number;

  /** Number of dev dependencies. */
  devCount: number;

  /** Whether vulnerability enrichment has been run. */
  enriched: boolean;
}
