import chalk from 'chalk';
import ora from 'ora';
import { findVulnerabilityPaths } from '@depgraph/core';
import { resolve } from 'node:path';

interface AuditOptions {
  format?: 'text' | 'json';
  path?: string;
}

const SEVERITY_COLOR: Record<string, chalk.ChalkFunction> = {
  critical: chalk.bgRed.white.bold,
  high: chalk.red.bold,
  medium: chalk.yellow.bold,
  low: chalk.cyan,
  unknown: chalk.gray,
};

export async function runAudit(targetPath: string | undefined, options: AuditOptions): Promise<void> {
  const projectPath = resolve(targetPath ?? options.path ?? process.cwd());
  const { basename } = await import('node:path');
  const projectName = basename(projectPath);

  const spinner = ora('Fetching vulnerability paths from graph…').start();

  let paths;
  try {
    paths = await findVulnerabilityPaths(projectName);
    spinner.stop();
  } catch (err) {
    spinner.fail('Failed to query graph database');
    console.error(err);
    process.exit(1);
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(paths, null, 2));
    return;
  }

  if (paths.length === 0) {
    console.log(chalk.bold.green('\n✅ No known vulnerabilities found in dependency graph\n'));
    return;
  }

  console.log(chalk.bold.red(`\n🚨 Found ${paths.length} vulnerability path(s)\n`));

  for (const vp of paths) {
    const colorFn = SEVERITY_COLOR[vp.severity] ?? chalk.gray;
    console.log(colorFn(`  [${vp.severity.toUpperCase()}] ${vp.cveId}`));
    console.log(chalk.gray(`  ${vp.cveSummary}`));
    if (vp.fixedInVersion) {
      console.log(chalk.green(`  Fix: upgrade to ${vp.fixedInVersion}`));
    }
    console.log(`  Path: ${vp.chain.join(chalk.gray(' → '))}`);
    if (vp.cvssScore !== undefined) {
      console.log(chalk.gray(`  CVSS: ${vp.cvssScore}`));
    }
    console.log();
  }

  const critical = paths.filter((p) => p.severity === 'critical').length;
  const high = paths.filter((p) => p.severity === 'high').length;
  if (critical > 0) process.exitCode = 1;

  console.log(
    chalk.bold(
      `Summary: ${critical > 0 ? chalk.red(critical + ' critical') : ''} ${high > 0 ? chalk.yellow(high + ' high') : ''} ${paths.length} total`,
    ),
  );
}
