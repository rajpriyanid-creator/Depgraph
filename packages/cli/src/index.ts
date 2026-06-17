import { Command } from 'commander';
import { runScan } from './commands/scan.js';
import { runAudit } from './commands/audit.js';
import { runDiff } from './commands/diff.js';
import { runFix } from './commands/fix.js';
import { runServe } from './commands/serve.js';
import { runPolicy } from './commands/policy.js';
import { runExport } from './commands/export.js';

const program = new Command();

program
  .name('depgraph')
  .description('Dependency Intelligence Platform — graph-powered dependency analysis')
  .version('1.0.0');

program
  .command('scan [path]')
  .description('Scan a project and build the dependency graph')
  .option('-e, --ecosystem <ecosystem>', 'Override ecosystem detection (npm|python|rust|java)')
  .option('--no-audit', 'Skip vulnerability check after scan')
  .action(runScan);

program
  .command('audit [path]')
  .description('Show vulnerability paths in the dependency graph')
  .option('--format <format>', 'Output format: text|json', 'text')
  .action(runAudit);

program
  .command('diff [base-branch]')
  .description('Compare current dependencies against a base branch')
  .option('--verbose', 'Show all transitive changes')
  .option('--path <path>', 'Project path')
  .action(runDiff);

program
  .command('fix [path]')
  .description('Auto-apply safe dependency fixes')
  .option('--dry-run', 'Preview changes without applying them')
  .action(runFix);

program
  .command('serve')
  .description('Start the local web UI')
  .option('--port <port>', 'Port to listen on', '3847')
  .option('--path <path>', 'Project path')
  .action(runServe);

program
  .command('policy [path]')
  .description('Evaluate policy rules (.depgraph.yml) against the scanned graph')
  .action(runPolicy);

program
  .command('export [type]')
  .description('Export SBOM (cyclonedx|spdx|json)')
  .option('--format <format>', 'Output format', 'cyclonedx')
  .option('--output <path>', 'Output file path')
  .action(runExport);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
