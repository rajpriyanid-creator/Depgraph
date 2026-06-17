/**
 * Represents a scanned software project (the root node of the dependency graph).
 */
export interface Project {
  /** Unique identifier — usually the absolute filesystem path. */
  path: string;

  /** Project name from the manifest file (e.g. package.json "name"). */
  name: string;

  /** Project version from the manifest. */
  version: string;

  /** Detected ecosystem: npm, python, rust, java. */
  ecosystem: Ecosystem;

  /** ISO timestamp of when this project was first seen. */
  scannedAt: string;
}

export type Ecosystem = 'npm' | 'python' | 'rust' | 'java';
