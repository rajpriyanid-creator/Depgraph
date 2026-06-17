import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export interface RawPythonData {
  projectName: string;
  projectVersion: string;
  projectPath: string;
  packages: Map<string, { name: string; version: string; dependencies: string[] }>;
  directDependencies: Set<string>;
}

interface PoetryLock {
  package?: Array<{
    name: string;
    version: string;
    dependencies?: Record<string, string | { version: string }>;
  }>;
}

interface PipfileLock {
  default?: Record<string, { version?: string }>;
  develop?: Record<string, { version?: string }>;
}

export class PythonReader {
  async read(projectPath: string): Promise<RawPythonData> {
    const packages = new Map<string, { name: string; version: string; dependencies: string[] }>();
    const directDependencies = new Set<string>();
    let projectName = 'python-project';
    let projectVersion = '0.0.0';

    // Try pyproject.toml (Poetry / PEP 517)
    const pyprojectPath = join(projectPath, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      const content = readFileSync(pyprojectPath, 'utf-8');
      const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
      const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m);
      if (nameMatch?.[1]) projectName = nameMatch[1];
      if (versionMatch?.[1]) projectVersion = versionMatch[1];
    }

    // Poetry lockfile
    const poetryLockPath = join(projectPath, 'poetry.lock');
    if (existsSync(poetryLockPath)) {
      const lock = yaml.load(readFileSync(poetryLockPath, 'utf-8')) as PoetryLock;
      for (const pkg of lock.package ?? []) {
        const key = `${pkg.name}@${pkg.version}`;
        const deps = Object.keys(pkg.dependencies ?? {});
        packages.set(key, { name: pkg.name, version: pkg.version, dependencies: deps });
        directDependencies.add(pkg.name);
      }
      return { projectName, projectVersion, projectPath, packages, directDependencies };
    }

    // Pipfile.lock
    const pipfileLockPath = join(projectPath, 'Pipfile.lock');
    if (existsSync(pipfileLockPath)) {
      const lock = JSON.parse(readFileSync(pipfileLockPath, 'utf-8')) as PipfileLock;
      for (const [name, entry] of Object.entries(lock.default ?? {})) {
        const version = (entry.version ?? '==0.0.0').replace('==', '');
        const key = `${name}@${version}`;
        packages.set(key, { name, version, dependencies: [] });
        directDependencies.add(name);
      }
      for (const [name, entry] of Object.entries(lock.develop ?? {})) {
        const version = (entry.version ?? '==0.0.0').replace('==', '');
        const key = `${name}@${version}`;
        packages.set(key, { name, version, dependencies: [] });
      }
      return { projectName, projectVersion, projectPath, packages, directDependencies };
    }

    // requirements.txt fallback
    const requirementsPath = join(projectPath, 'requirements.txt');
    if (existsSync(requirementsPath)) {
      const lines = readFileSync(requirementsPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Za-z0-9_.-]+)==([^\s]+)/);
        if (match && match[1] && match[2]) {
          const [, name, version] = match;
          const key = `${name}@${version}`;
          packages.set(key, { name, version, dependencies: [] });
          directDependencies.add(name);
        }
      }
    }

    return { projectName, projectVersion, projectPath, packages, directDependencies };
  }
}
