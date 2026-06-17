import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

export interface RawJavaData {
  projectName: string;
  projectVersion: string;
  projectPath: string;
  packages: Map<
    string,
    {
      name: string;
      version: string;
      groupId: string;
      artifactId: string;
      scope: 'production' | 'development' | 'build';
      dependencies: string[];
    }
  >;
  directDependencies: Set<string>;
}

interface PomDependency {
  groupId?: string;
  artifactId?: string;
  version?: string;
  scope?: string;
}

interface PomProject {
  groupId?: string;
  artifactId?: string;
  version?: string;
  dependencies?: { dependency?: PomDependency | PomDependency[] };
  parent?: { groupId?: string; version?: string };
}

export class JavaReader {
  async read(projectPath: string): Promise<RawJavaData> {
    const packages = new Map<
      string,
      {
        name: string;
        version: string;
        groupId: string;
        artifactId: string;
        scope: 'production' | 'development' | 'build';
        dependencies: string[];
      }
    >();
    const directDependencies = new Set<string>();
    let projectName = 'java-project';
    let projectVersion = '0.0.0';

    const pomPath = join(projectPath, 'pom.xml');
    if (!existsSync(pomPath)) {
      return { projectName, projectVersion, projectPath, packages, directDependencies };
    }

    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
    const pomContent = readFileSync(pomPath, 'utf-8');
    const parsed = parser.parse(pomContent) as { project?: PomProject };
    const project = parsed.project;

    if (!project) return { projectName, projectVersion, projectPath, packages, directDependencies };

    const groupId = project.groupId ?? project.parent?.groupId ?? 'unknown';
    projectName = `${groupId}:${project.artifactId ?? 'unknown'}`;
    projectVersion = project.version ?? project.parent?.version ?? '0.0.0';

    const deps = project.dependencies?.dependency;
    const depList: PomDependency[] = deps
      ? Array.isArray(deps)
        ? deps
        : [deps]
      : [];

    for (const dep of depList) {
      const g = dep.groupId ?? 'unknown';
      const a = dep.artifactId ?? 'unknown';
      const v = dep.version ?? 'unknown';
      const s = dep.scope ?? 'compile';

      const name = `${g}:${a}`;
      const key = `${name}@${v}`;

      let scope: 'production' | 'development' | 'build' = 'production';
      if (s === 'test') scope = 'development';
      else if (s === 'provided' || s === 'system') scope = 'build';

      packages.set(key, {
        name,
        version: v,
        groupId: g,
        artifactId: a,
        scope,
        dependencies: [],
      });
      directDependencies.add(name);
    }

    return { projectName, projectVersion, projectPath, packages, directDependencies };
  }
}
