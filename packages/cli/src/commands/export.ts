import { resolve, basename } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import chalk from 'chalk';
import { runReadQuery } from '@depgraph/core';

interface ExportOptions {
  format?: 'cyclonedx' | 'spdx' | 'json';
  output?: string;
  path?: string;
}

interface PackageRow {
  name: string;
  version: string;
  ecosystem: string;
  license?: string;
  description?: string;
}

function buildCycloneDx(projectName: string, projectVersion: string, packages: PackageRow[]): string {
  const components = packages.map((p) => ({
    type: 'library',
    name: p.name,
    version: p.version,
    purl: `pkg:${p.ecosystem}/${p.name}@${p.version}`,
    licenses: p.license ? [{ license: { id: p.license } }] : [],
    description: p.description,
  }));

  return JSON.stringify(
    {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      serialNumber: `urn:uuid:${crypto.randomUUID()}`,
      metadata: {
        timestamp: new Date().toISOString(),
        component: { type: 'application', name: projectName, version: projectVersion },
        tools: [{ name: 'depgraph', version: '1.0.0' }],
      },
      components,
    },
    null,
    2,
  );
}

function buildSpdx(projectName: string, packages: PackageRow[]): string {
  const packages_spdx = packages.map((p) => ({
    SPDXID: `SPDXRef-Package-${p.name.replace(/[^a-zA-Z0-9-]/g, '-')}-${p.version}`,
    name: p.name,
    versionInfo: p.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: p.license ?? 'NOASSERTION',
    licenseDeclared: p.license ?? 'NOASSERTION',
    copyrightText: 'NOASSERTION',
  }));

  return JSON.stringify(
    {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: projectName,
      documentNamespace: `https://depgraph.dev/sbom/${projectName}-${Date.now()}`,
      creationInfo: {
        created: new Date().toISOString(),
        creators: ['Tool: depgraph-1.0.0'],
      },
      packages: packages_spdx,
    },
    null,
    2,
  );
}

export async function runExport(
  type: string,
  options: ExportOptions,
): Promise<void> {
  const projectPath = resolve(options.path ?? process.cwd());
  const projectName = basename(projectPath);
  const format = (options.format ?? type ?? 'cyclonedx') as ExportOptions['format'];

  const packages = await runReadQuery<PackageRow>(
    `MATCH (root:Package {isRoot: true, name: $name})-[:DEPENDS_ON*1..20]->(p:Package)
     RETURN DISTINCT p.name AS name, p.version AS version, p.ecosystem AS ecosystem,
       p.license AS license, p.description AS description`,
    { name: projectName },
  );

  let content: string;
  let ext: string;

  if (format === 'spdx') {
    content = buildSpdx(projectName, packages);
    ext = 'spdx.json';
  } else if (format === 'json') {
    content = JSON.stringify(packages, null, 2);
    ext = 'json';
  } else {
    content = buildCycloneDx(projectName, '1.0.0', packages);
    ext = 'cdx.json';
  }

  const outDir = resolve(projectPath, '.depgraph');
  mkdirSync(outDir, { recursive: true });
  const outPath = options.output ?? resolve(outDir, `sbom.${ext}`);
  writeFileSync(outPath, content);

  console.log(chalk.green(`✅ SBOM exported: ${outPath}`));
  console.log(chalk.gray(`  Format: ${format?.toUpperCase()}, ${packages.length} packages`));
}
