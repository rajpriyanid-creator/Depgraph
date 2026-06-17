import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export type PackageScope = 'production' | 'development' | 'peer' | 'optional';

export interface RawPackageEntry {
  name: string;
  version: string;
  scope: PackageScope;
  resolved?: string;
  integrity?: string;
  dependencies: string[];
  peerDependencies?: string[];
}

export interface RawNpmData {
  projectName: string;
  projectVersion: string;
  projectPath: string;
  packages: Map<string, RawPackageEntry>;
  directDependencies: Map<string, { version: string; scope: PackageScope }>;
}

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface LockfileV2Package {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  peer?: boolean;
  optional?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackageLockV2 {
  lockfileVersion: number;
  packages?: Record<string, LockfileV2Package>;
  dependencies?: Record<string, { version: string; resolved?: string; integrity?: string; requires?: Record<string, string>; dev?: boolean; optional?: boolean }>;
}

interface PnpmLockPackage {
  version?: string;
  resolution?: { integrity?: string; tarball?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface PnpmLock {
  lockfileVersion?: string | number;
  importers?: Record<string, { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
  packages?: Record<string, PnpmLockPackage>;
}

export class NpmReader {
  async read(projectPath: string): Promise<RawNpmData> {
    const pkgJsonPath = join(projectPath, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      throw new Error(`No package.json found at ${projectPath}`);
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as PackageJson;
    const projectName = pkgJson.name ?? 'unknown';
    const projectVersion = pkgJson.version ?? '0.0.0';

    const directDependencies = this.extractDirectDeps(pkgJson);
    const packages = new Map<string, RawPackageEntry>();

    if (existsSync(join(projectPath, 'package-lock.json'))) {
      this.parseLockfileV2(
        JSON.parse(readFileSync(join(projectPath, 'package-lock.json'), 'utf-8')) as PackageLockV2,
        directDependencies,
        packages,
        projectName,
      );
    } else if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
      this.parsePnpmLock(
        yaml.load(readFileSync(join(projectPath, 'pnpm-lock.yaml'), 'utf-8')) as PnpmLock,
        directDependencies,
        packages,
        projectName,
      );
    } else {
      // Fallback: only direct dependencies known
      for (const [name, { version, scope }] of directDependencies) {
        const key = `${name}@${version}`;
        packages.set(key, {
          name,
          version,
          scope,
          dependencies: [],
        });
      }
    }

    return { projectName, projectVersion, projectPath, packages, directDependencies };
  }

  private extractDirectDeps(
    pkgJson: PackageJson,
  ): Map<string, { version: string; scope: PackageScope }> {
    const map = new Map<string, { version: string; scope: PackageScope }>();
    for (const [name, version] of Object.entries(pkgJson.dependencies ?? {})) {
      map.set(name, { version, scope: 'production' });
    }
    for (const [name, version] of Object.entries(pkgJson.devDependencies ?? {})) {
      map.set(name, { version, scope: 'development' });
    }
    for (const [name, version] of Object.entries(pkgJson.peerDependencies ?? {})) {
      map.set(name, { version, scope: 'peer' });
    }
    for (const [name, version] of Object.entries(pkgJson.optionalDependencies ?? {})) {
      map.set(name, { version, scope: 'optional' });
    }
    return map;
  }

  private parseLockfileV2(
    lock: PackageLockV2,
    directDeps: Map<string, { version: string; scope: PackageScope }>,
    packages: Map<string, RawPackageEntry>,
    _projectName: string,
  ): void {
    if (lock.lockfileVersion >= 2 && lock.packages) {
      for (const [rawPath, entry] of Object.entries(lock.packages)) {
        if (!rawPath || rawPath === '') continue; // skip root
        // Strip "node_modules/" prefix and handle nested
        const name = rawPath.replace(/^.*node_modules\//, '');
        const version = entry.version ?? 'unknown';
        const key = `${name}@${version}`;

        const directInfo = directDeps.get(name);
        let scope: PackageScope = 'production';
        if (directInfo) {
          scope = directInfo.scope;
        } else if (entry.dev) {
          scope = 'development';
        } else if (entry.peer) {
          scope = 'peer';
        } else if (entry.optional) {
          scope = 'optional';
        }

        if (!packages.has(key)) {
          packages.set(key, {
            name,
            version,
            scope,
            ...(entry.resolved !== undefined && { resolved: entry.resolved }),
            ...(entry.integrity !== undefined && { integrity: entry.integrity }),
            dependencies: Object.keys(entry.dependencies ?? {}),
            peerDependencies: Object.keys(entry.peerDependencies ?? {}),
          });
        }
      }
    } else if (lock.dependencies) {
      // v1 format
      const processV1 = (
        deps: PackageLockV2['dependencies'],
        _parentScope?: PackageScope,
      ): void => {
        if (!deps) return;
        for (const [name, entry] of Object.entries(deps)) {
          const version = entry.version;
          const key = `${name}@${version}`;
          const directInfo = directDeps.get(name);
          const scope: PackageScope = directInfo?.scope ?? (entry.dev ? 'development' : 'production');

          if (!packages.has(key)) {
            packages.set(key, {
              name,
              version,
              scope,
              ...(entry.resolved !== undefined && { resolved: entry.resolved }),
              ...(entry.integrity !== undefined && { integrity: entry.integrity }),
              dependencies: Object.keys(entry.requires ?? {}),
            });
          }
        }
      };
      processV1(lock.dependencies);
    }
  }

  private parsePnpmLock(
    lock: PnpmLock,
    directDeps: Map<string, { version: string; scope: PackageScope }>,
    packages: Map<string, RawPackageEntry>,
    _projectName: string,
  ): void {
    if (!lock.packages) return;

    for (const [pkgKey, entry] of Object.entries(lock.packages)) {
      // pnpm key format: /name@version or /name/version
      const match = pkgKey.match(/^\/?(@?[^/]+\/[^/@]+|[^/@]+)[@/](.+)$/);
      if (!match) continue;
      const name = match[1] ?? pkgKey.replace(/^\//, '').split('@')[0] ?? 'unknown';
      const version = entry.version ?? match[2] ?? 'unknown';
      const key = `${name}@${version}`;

      const directInfo = directDeps.get(name);
      const scope: PackageScope = directInfo?.scope ?? 'production';

      const allDeps = [
        ...Object.keys(entry.dependencies ?? {}),
        ...Object.keys(entry.optionalDependencies ?? {}),
      ];

      if (!packages.has(key)) {
        const tarball = entry.resolution?.tarball;
        const integrity = entry.resolution?.integrity;
        packages.set(key, {
          name,
          version,
          scope,
          ...(tarball !== undefined && { resolved: tarball }),
          ...(integrity !== undefined && { integrity }),
          dependencies: allDeps,
          peerDependencies: Object.keys(entry.peerDependencies ?? {}),
        });
      }
    }
  }
}
