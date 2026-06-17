import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RawRustData {
  projectName: string;
  projectVersion: string;
  projectPath: string;
  packages: Map<
    string,
    { name: string; version: string; scope: 'production' | 'development' | 'build'; dependencies: string[] }
  >;
  directDependencies: Set<string>;
}

interface CargoLockPackage {
  name: string;
  version: string;
  source?: string;
  checksum?: string;
  dependencies?: string[];
}

interface CargoLock {
  package?: CargoLockPackage[];
}

export class RustReader {
  async read(projectPath: string): Promise<RawRustData> {
    const packages = new Map<
      string,
      { name: string; version: string; scope: 'production' | 'development' | 'build'; dependencies: string[] }
    >();
    const directDependencies = new Set<string>();
    let projectName = 'rust-project';
    let projectVersion = '0.0.0';

    const cargoTomlPath = join(projectPath, 'Cargo.toml');
    if (existsSync(cargoTomlPath)) {
      const content = readFileSync(cargoTomlPath, 'utf-8');
      const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
      const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m);
      if (nameMatch?.[1]) projectName = nameMatch[1];
      if (versionMatch?.[1]) projectVersion = versionMatch[1];

      // Extract direct deps from [dependencies], [dev-dependencies], [build-dependencies]
      const depSections: Array<{ regex: RegExp; scope: 'production' | 'development' | 'build' }> =
        [
          { regex: /^\[dependencies\]([\s\S]*?)(?=^\[|\z)/m, scope: 'production' },
          { regex: /^\[dev-dependencies\]([\s\S]*?)(?=^\[|\z)/m, scope: 'development' },
          { regex: /^\[build-dependencies\]([\s\S]*?)(?=^\[|\z)/m, scope: 'build' },
        ];

      for (const { regex, scope: _scope } of depSections) {
        const match = content.match(regex);
        if (match?.[1]) {
          const depLines = match[1].split('\n');
          for (const line of depLines) {
            const depMatch = line.match(/^([a-z0-9_-]+)\s*=/);
            if (depMatch?.[1]) {
              directDependencies.add(depMatch[1]);
            }
          }
        }
      }
    }

    const cargoLockPath = join(projectPath, 'Cargo.lock');
    if (existsSync(cargoLockPath)) {
      // Simple TOML parser for Cargo.lock
      const lock = this.parseCargoLock(readFileSync(cargoLockPath, 'utf-8'));
      for (const pkg of lock.package ?? []) {
        const key = `${pkg.name}@${pkg.version}`;
        const scope = directDependencies.has(pkg.name) ? 'production' : 'production';
        packages.set(key, {
          name: pkg.name,
          version: pkg.version,
          scope,
          dependencies: (pkg.dependencies ?? []).map((d) => d.split(' ')[0] ?? d),
        });
      }
    }

    return { projectName, projectVersion, projectPath, packages, directDependencies };
  }

  private parseCargoLock(content: string): CargoLock {
    const packages: CargoLockPackage[] = [];
    const packageBlocks = content.split(/^\[\[package\]\]/m).slice(1);

    for (const block of packageBlocks) {
      const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
      const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);
      const sourceMatch = block.match(/^source\s*=\s*"([^"]+)"/m);
      const checksumMatch = block.match(/^checksum\s*=\s*"([^"]+)"/m);

      const depsMatch = block.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m);
      const dependencies: string[] = [];
      if (depsMatch?.[1]) {
        const depLines = depsMatch[1].split('\n');
        for (const line of depLines) {
          const dep = line.trim().replace(/^"|"$/g, '').trim();
          if (dep) dependencies.push(dep);
        }
      }

      if (nameMatch?.[1] && versionMatch?.[1]) {
        const source = sourceMatch?.[1];
        const checksum = checksumMatch?.[1];
        packages.push({
          name: nameMatch[1],
          version: versionMatch[1],
          ...(source !== undefined && { source }),
          ...(checksum !== undefined && { checksum }),
          ...(dependencies.length > 0 && { dependencies }),
        });
      }
    }

    return { package: packages };
  }
}
