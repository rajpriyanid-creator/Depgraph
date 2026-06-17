import chalk from 'chalk';
import { resolve, basename } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { NpmReader, normalizeNpm, GraphIngester, initSchema } from '@depgraph/core';

interface DiffOptions {
  path?: string;
  verbose?: boolean;
  output?: string;
}

interface PackageSnapshot {
  name: string;
  version: string;
  scope: string;
  isDirect: boolean;
  isRoot?: boolean;
}

function snapshotProject(graph: { packages: PackageSnapshot[] }): Map<string, PackageSnapshot> {
  const map = new Map<string, PackageSnapshot>();
  for (const pkg of graph.packages) {
    if (!pkg.isRoot) map.set(pkg.name, pkg);
  }
  return map;
}

export async function runDiff(
  baseBranch: string | undefined,
  options: DiffOptions,
): Promise<void> {
  const projectPath = resolve(options.path ?? process.cwd());
  const base = baseBranch ?? 'main';

  console.log(chalk.bold.blue(`\n📊 DepGraph Diff — current vs ${base}\n`));

  // Scan current branch
  const reader = new NpmReader();
  await initSchema();
  const currentRaw = await reader.read(projectPath);
  const currentGraph = normalizeNpm(currentRaw);
  const currentSnapshot = snapshotProject(currentGraph);

  // Scan base branch (git stash, checkout, scan, restore)
  let baseSnapshot: Map<string, PackageSnapshot>;
  try {
    execSync('git stash', { cwd: projectPath, stdio: 'pipe' });
    execSync(`git checkout ${base}`, { cwd: projectPath, stdio: 'pipe' });

    const baseRaw = await reader.read(projectPath);
    const baseGraph = normalizeNpm(baseRaw);
    baseSnapshot = snapshotProject(baseGraph);

    execSync('git checkout -', { cwd: projectPath, stdio: 'pipe' });
    execSync('git stash pop', { cwd: projectPath, stdio: 'pipe' });
  } catch {
    console.warn(chalk.yellow('  ⚠ Could not scan base branch via git. Showing current only.'));
    baseSnapshot = new Map();
  }

  const added: PackageSnapshot[] = [];
  const removed: PackageSnapshot[] = [];
  const updated: Array<{ name: string; from: string; to: string }> = [];

  for (const [name, pkg] of currentSnapshot) {
    const basePkg = baseSnapshot.get(name);
    if (!basePkg) {
      added.push(pkg);
    } else if (basePkg.version !== pkg.version) {
      updated.push({ name, from: basePkg.version, to: pkg.version });
    }
  }

  for (const [name, pkg] of baseSnapshot) {
    if (!currentSnapshot.has(name)) {
      removed.push(pkg);
    }
  }

  const directAdded = added.filter((p) => p.isDirect);
  const transitiveAdded = added.filter((p) => !p.isDirect);

  // Print report
  if (added.length > 0) {
    console.log(chalk.bold.green(`Added (${directAdded.length} direct, ${transitiveAdded.length} transitive):`));
    for (const pkg of directAdded) {
      console.log(`  ${chalk.green('+')} ${pkg.name}@${chalk.white(pkg.version)}`);
    }
    if (transitiveAdded.length > 0 && !options.verbose) {
      console.log(chalk.gray(`  (${transitiveAdded.length} transitive — run with --verbose to see all)`));
    } else if (options.verbose) {
      for (const pkg of transitiveAdded) {
        console.log(`  ${chalk.green('+')} ${chalk.gray(pkg.name + '@' + pkg.version)} (transitive)`);
      }
    }
    console.log();
  } else {
    console.log(chalk.gray('Added: none\n'));
  }

  if (removed.length > 0) {
    console.log(chalk.bold.red(`Removed (${removed.length}):`));
    for (const pkg of removed) {
      console.log(`  ${chalk.red('-')} ${pkg.name}@${pkg.version}`);
    }
    console.log();
  } else {
    console.log(chalk.gray('Removed: none\n'));
  }

  if (updated.length > 0) {
    console.log(chalk.bold.yellow(`Updated (${updated.length}):`));
    for (const u of updated) {
      console.log(
        `  ${chalk.yellow('~')} ${chalk.white(u.name)} ${chalk.gray(u.from)} → ${chalk.white(u.to)}`,
      );
    }
    console.log();
  }

  const verdict = removed.length === 0 && added.filter((p) => p.isDirect).length <= 5
    ? chalk.bold.green('VERDICT: ✅ Safe to merge')
    : chalk.bold.yellow('VERDICT: ⚠ Review dependency changes before merging');
  console.log(verdict + '\n');

  // Write JSON report
  const reportDir = resolve(projectPath, '.depgraph');
  mkdirSync(reportDir, { recursive: true });
  const report = { base, added, removed, updated, timestamp: new Date().toISOString() };
  writeFileSync(resolve(reportDir, 'diff-report.json'), JSON.stringify(report, null, 2));
  console.log(chalk.gray(`  Report saved to .depgraph/diff-report.json`));

  // Ingest current graph
  await new GraphIngester().ingest(currentGraph);
}
