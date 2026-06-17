import chalk from 'chalk';
import ora from 'ora';
import { evaluatePolicy, loadPolicy } from '@depgraph/core';
import { resolve } from 'node:path';
import { basename } from 'node:path';

interface PolicyOptions {
  path?: string;
}

export async function runPolicy(targetPath: string | undefined, options: PolicyOptions): Promise<void> {
  const projectPath = resolve(targetPath ?? options.path ?? process.cwd());
  const projectName = basename(projectPath);

  const spinner = ora('Evaluating policy…').start();

  try {
    const policy = loadPolicy(projectPath);
    const result = await evaluatePolicy(projectName, policy);
    spinner.stop();

    console.log(chalk.bold('\n📋 Policy Check Results\n'));

    if (result.violations.length > 0) {
      console.log(chalk.bold.red(`❌ Violations (${result.violations.length}):`));
      for (const v of result.violations) {
        console.log(
          `  ${chalk.red('✗')} [${v.type.toUpperCase()}] ${chalk.white(v.packageName)}@${v.packageVersion}`,
        );
        console.log(chalk.gray(`      ${v.message}`));
      }
      console.log();
    }

    if (result.warnings.length > 0) {
      console.log(chalk.bold.yellow(`⚠ Warnings (${result.warnings.length}):`));
      for (const w of result.warnings) {
        console.log(
          `  ${chalk.yellow('!')} [${w.type.toUpperCase()}] ${chalk.white(w.packageName)}@${w.packageVersion}`,
        );
        console.log(chalk.gray(`      ${w.message}`));
      }
      console.log();
    }

    console.log(result.passed ? chalk.bold.green(result.summary) : chalk.bold.red(result.summary));
    console.log();

    if (!result.passed) process.exit(1);
  } catch (err) {
    spinner.fail('Policy evaluation failed');
    console.error(err);
    process.exit(1);
  }
}
