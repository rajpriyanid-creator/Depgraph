import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {
  NpmReader,
  normalizeNpm,
  GraphIngester,
  initSchema,
  VulnerabilityEnricher,
} from '@depgraph/core';

interface ScanOptions {
  ecosystem?: string;
  audit?: boolean;
  path?: string;
}

type Ecosystem = 'npm' | 'python' | 'rust' | 'java';

function detectEcosystem(projectPath: string): Ecosystem | null {
  if (existsSync(`${projectPath}/package.json`)) return 'npm';
  if (
    existsSync(`${projectPath}/requirements.txt`) ||
    existsSync(`${projectPath}/poetry.lock`) ||
    existsSync(`${projectPath}/Pipfile.lock`) ||
    existsSync(`${projectPath}/pyproject.toml`)
  )
    return 'python';
  if (existsSync(`${projectPath}/Cargo.toml`)) return 'rust';
  if (existsSync(`${projectPath}/pom.xml`) || existsSync(`${projectPath}/build.gradle`))
    return 'java';
  return null;
}

function printTree(
  packages: Array<{ name: string; version: string; scope: string; isDirect: boolean; isRoot?: boolean }>,
  maxLines = 50,
): void {
  const direct = packages.filter((p) => p.isDirect && !p.isRoot);
  const transitive = packages.filter((p) => !p.isDirect && !p.isRoot);

  console.log(chalk.bold('\n📦 Direct dependencies:'));
  for (const pkg of direct.slice(0, maxLines)) {
    const scopeLabel =
      pkg.scope === 'development'
        ? chalk.gray('[dev]')
        : pkg.scope === 'peer'
          ? chalk.cyan('[peer]')
          : pkg.scope === 'optional'
            ? chalk.yellow('[optional]')
            : '';
    console.log(
      `  ${chalk.green('├──')} ${chalk.white(pkg.name)} ${chalk.gray(pkg.version)} ${scopeLabel}`,
    );
  }
  if (transitive.length > 0) {
    console.log(chalk.bold(`\n🔗 Transitive (${transitive.length} total):`));
    for (const pkg of transitive.slice(0, 10)) {
      console.log(`  ${chalk.gray('│  ├──')} ${chalk.dim(pkg.name)} ${chalk.dim(pkg.version)}`);
    }
    if (transitive.length > 10) {
      console.log(chalk.gray(`  │  └── … and ${transitive.length - 10} more`));
    }
  }
}

export async function runScan(targetPath: string | undefined, options: ScanOptions): Promise<void> {
  const projectPath = resolve(targetPath ?? options.path ?? process.cwd());
  const startTime = Date.now();

  console.log(chalk.bold.blue('\n🔍 DepGraph — Scanning dependencies\n'));
  console.log(chalk.gray(`  Project: ${projectPath}`));

  const ecosystem = (options.ecosystem as Ecosystem | undefined) ?? detectEcosystem(projectPath);
  if (!ecosystem) {
    console.error(chalk.red('  ✗ Could not detect ecosystem. Is this a supported project?'));
    process.exit(1);
  }
  console.log(chalk.gray(`  Ecosystem: ${ecosystem}\n`));

  // Init schema
  const schemaSpinner = ora('Initializing graph schema…').start();
  try {
    await initSchema();
    schemaSpinner.succeed('Graph schema ready');
  } catch (err) {
    schemaSpinner.fail('Failed to connect to Neo4j');
    console.error(chalk.red(`  Make sure Neo4j is running: docker compose up -d`));
    console.error(err);
    process.exit(1);
  }

  // Read
  const readSpinner = ora('Reading project files…').start();
  let graph;
  try {
    if (ecosystem === 'npm') {
      const reader = new NpmReader();
      const raw = await reader.read(projectPath);
      graph = normalizeNpm(raw);
      readSpinner.succeed(
        `Read ${graph.packages.length} packages from ${raw.packages.size > 0 ? 'lockfile' : 'package.json'}`,
      );
    } else {
      readSpinner.fail(`Ecosystem '${ecosystem}' collection not yet wired in CLI`);
      process.exit(1);
    }
  } catch (err) {
    readSpinner.fail('Failed to read project files');
    console.error(err);
    process.exit(1);
  }

  // Ingest
  const ingestSpinner = ora('Writing to graph database…').start();
  try {
    const ingester = new GraphIngester();
    await ingester.ingest(graph);
    ingestSpinner.succeed('Graph database updated');
  } catch (err) {
    ingestSpinner.fail('Graph ingestion failed');
    console.error(err);
    process.exit(1);
  }

  // Vulnerability enrichment
  if (options.audit !== false) {
    const vulnSpinner = ora('Checking for vulnerabilities…').start();
    vulnSpinner.stop(); // VulnerabilityEnricher prints its own progress
    try {
      const enricher = new VulnerabilityEnricher();
      await enricher.enrich(graph.scan.id);
    } catch (err) {
      console.warn(chalk.yellow(`  ⚠ Vulnerability check failed: ${err}`));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  const s = graph.scan;
  console.log(chalk.bold.green('\n✅ Scan complete'));
  console.log(
    `${chalk.white('📦')} ${chalk.bold(s.packageCount)} packages found ${chalk.gray(`(${s.directCount} direct, ${s.transitiveCount} transitive)`)}`,
  );
  console.log(`${chalk.white('🔴')} ${chalk.bold(s.devCount)} dev dependencies`);
  console.log(`${chalk.white('⚡')} Ingested in ${chalk.bold(elapsed + 's')}`);
  console.log(chalk.gray('\n  Run `depgraph audit` to review vulnerabilities'));
  console.log(chalk.gray('  Run `depgraph serve` to open the web UI\n'));

  // Print tree
  printTree(graph.packages as Parameters<typeof printTree>[0]);
}
