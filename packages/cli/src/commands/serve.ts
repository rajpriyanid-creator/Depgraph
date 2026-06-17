import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import chalk from 'chalk';
import semver from 'semver';

function parsePkgNameAndVersion(str: string): { name: string; version: string } {
  const parts = str.split('@');
  if (str.startsWith('@')) {
    return { name: `@${parts[1]}`, version: parts[2] || '' };
  }
  return { name: parts[0] || '', version: parts[1] || '' };
}
import { createServer } from 'node:http';
import {
  runQuery,
  runReadQuery,
  findVulnerabilityPaths,
  detectCycles,
  findDuplicates,
  findZombies,
  initSchema,
  NpmReader,
  normalizeNpm,
  GraphIngester,
  VulnerabilityEnricher,
  computeHealthScore,
  scanImports,
} from '@depgraph/core';

interface ServeOptions {
  port?: string;
  path?: string;
}

export async function runServe(options: ServeOptions): Promise<void> {
  const projectPath = resolve(options.path ?? process.cwd());
  const port = parseInt(options.port ?? process.env['PORT'] ?? '3847', 10);

  const app = express();
  app.use(express.json());

  // CORS for local dev
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // API Routes
  // List all scanned projects
  app.get('/api/projects', async (_req, res) => {
    try {
      const rows = await runReadQuery<{ name: string }>(
        `MATCH (p:Package {isRoot: true}) RETURN DISTINCT p.name AS name ORDER BY p.name`,
        {},
      );
      res.json(rows.map((r) => r.name));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Clone and scan a repository from GitHub/Git
  app.post('/api/scan-repo', async (req, res) => {
    const { repoUrl } = req.body;
    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    try {
      const match = repoUrl.trim().match(/\/([^/]+?)(?:\.git)?\/?$/);
      const repoName = match ? match[1] : 'temp-repo';

      const tempParentDir = join(projectPath, 'temp-scans');
      mkdirSync(tempParentDir, { recursive: true });

      const tempDirName = `${repoName}-${Date.now()}`;
      const tempPath = join(tempParentDir, tempDirName);

      // Clone repo
      const execAsync = promisify(exec);
      await execAsync(`git clone --depth 1 "${repoUrl}" "${tempPath}"`);

      // Detect ecosystem
      const ecosystem = existsSync(join(tempPath, 'package.json')) ? 'npm' : null;
      if (ecosystem !== 'npm') {
        try {
          rmSync(tempPath, { recursive: true, force: true });
        } catch {}
        return res.status(400).json({
          error: 'Only Node.js/NPM projects with a package.json are currently supported.',
        });
      }

      // Ingest
      await initSchema();
      const reader = new NpmReader();
      const raw = await reader.read(tempPath);
      raw.projectName = repoName; // Overwrite with repo name

      const graph = normalizeNpm(raw);

      const ingester = new GraphIngester();
      await ingester.ingest(graph);

      // Vulnerability enrichment
      try {
        const enricher = new VulnerabilityEnricher();
        await enricher.enrich(graph.scan.id);
      } catch (enrichErr) {
        console.warn(`Vulnerability enrichment failed: ${enrichErr}`);
      }

      res.json({ success: true, projectName: repoName });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Get the server's current working directory (workspace path)
  app.get('/api/workspace-path', (_req, res) => {
    res.json({ path: process.cwd() });
  });

  // Write a new package.json file to target directory
  app.post('/api/init-package-json', async (req, res) => {
    const { targetPath, content } = req.body;
    if (!targetPath || !content) {
      return res.status(400).json({ error: 'targetPath and content are required' });
    }
    try {
      const pkgPath = join(resolve(targetPath), 'package.json');
      writeFileSync(pkgPath, content, 'utf8');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Scan local directory path
  app.post('/api/scan-local', async (req, res) => {
    let { localPath } = req.body;
    if (!localPath || !localPath.trim()) {
      localPath = process.cwd();
    }

    try {
      const targetPath = resolve(localPath.trim());
      if (!existsSync(targetPath)) {
        return res.status(400).json({ error: `Directory path does not exist: ${targetPath}` });
      }

      const pkgJsonPath = join(targetPath, 'package.json');
      const exists = existsSync(pkgJsonPath);
      let isValid = false;
      let parseError = '';

      if (exists) {
        try {
          JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
          isValid = true;
        } catch (e: any) {
          parseError = e.message;
        }
      }

      if (!exists || !isValid) {
        // Use ImportScanner to discover imported npm packages
        const imports = await scanImports(targetPath);
        const depNames = Object.keys(imports);

        const suggestedDeps: Record<string, string> = {};
        for (const dep of depNames) {
          suggestedDeps[dep] = "*";
        }

        const folderName = targetPath.split(/[\\/]/).pop() || 'suggested-project';

        const suggestedPkg = {
          name: folderName.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
          version: "1.0.0",
          description: "Auto-generated dependencies scanned by DepGraph",
          main: "index.js",
          scripts: {
            test: "echo \"Error: no test specified\" && exit 1"
          },
          dependencies: suggestedDeps,
          devDependencies: {}
        };

        return res.json({
          success: false,
          reason: !exists ? 'missing_package_json' : 'invalid_package_json',
          errorDetails: parseError || 'package.json file is missing.',
          suggestedPackageJson: JSON.stringify(suggestedPkg, null, 2),
          targetPath
        });
      }

      const projectName = targetPath.split(/[\\/]/).pop() || 'local-project';

      // Ingest
      await initSchema();
      const reader = new NpmReader();
      const raw = await reader.read(targetPath);
      raw.projectName = projectName; // Overwrite with project folder name

      const graph = normalizeNpm(raw);

      const ingester = new GraphIngester();
      await ingester.ingest(graph);

      // Vulnerability enrichment
      try {
        const enricher = new VulnerabilityEnricher();
        await enricher.enrich(graph.scan.id);
      } catch (enrichErr) {
        console.warn(`Vulnerability enrichment failed: ${enrichErr}`);
      }

      res.json({ success: true, projectName });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/scan/:projectName', async (req, res) => {
    try {
      const rows = await runReadQuery<Record<string, unknown>>(
        `MATCH (s:Scan {projectName: $name}) RETURN s ORDER BY s.startedAt DESC LIMIT 1`,
        { name: req.params['projectName'] },
      );
      res.json(rows[0] ?? null);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/vulnerabilities/:projectName', async (req, res) => {
    try {
      const paths = await findVulnerabilityPaths(req.params['projectName'] ?? '');
      res.json(paths);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Recommend package.json modifications to fix vulnerability hits
  app.get('/api/recommend-fix/:projectName', async (req, res) => {
    try {
      const projectName = req.params['projectName'] ?? '';

      // Get project path from latest scan
      const scans = await runReadQuery<{ projectPath: string }>(
        `MATCH (s:Scan {projectName: $name}) RETURN s.projectPath AS projectPath ORDER BY s.startedAt DESC LIMIT 1`,
        { name: projectName },
      );
      if (!scans[0]) {
        return res.status(404).json({ error: 'No scan found for this project.' });
      }
      const targetPath = scans[0].projectPath;
      const pkgJsonPath = join(targetPath, 'package.json');

      if (!existsSync(pkgJsonPath)) {
        return res.status(404).json({ error: 'package.json not found in project path.' });
      }

      const pkgJsonStr = readFileSync(pkgJsonPath, 'utf8');
      const pkg = JSON.parse(pkgJsonStr);

      // Find vulnerability paths
      const paths = await findVulnerabilityPaths(projectName);

      // Map of package name -> max fixed version
      const fixes = new Map<string, string>();
      const vulnDetails = new Map<string, { severity: string; cveId: string }>();

      for (const p of paths) {
        const chain = p.chain;
        if (chain.length < 2) continue;

        const vulnPkg = parsePkgNameAndVersion(chain[chain.length - 1]);
        if (p.fixedInVersion) {
          const existing = fixes.get(vulnPkg.name);
          if (existing) {
            try {
              if (semver.gt(p.fixedInVersion, existing)) {
                fixes.set(vulnPkg.name, p.fixedInVersion);
              }
            } catch {
              if (p.fixedInVersion > existing) {
                fixes.set(vulnPkg.name, p.fixedInVersion);
              }
            }
          } else {
            fixes.set(vulnPkg.name, p.fixedInVersion);
          }
        }
        vulnDetails.set(vulnPkg.name, { severity: p.severity, cveId: p.cveId });
      }

      // Compute modifications
      const changes: string[] = [];
      const updatedPkg = JSON.parse(JSON.stringify(pkg)); // Deep clone

      // Fetch resolved versions from Neo4j for this project
      const resolvedPackages = await runReadQuery<{ name: string; version: string }>(
        `MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON*1..20]->(p:Package)
         RETURN DISTINCT p.name AS name, p.version AS version`,
        { projectName }
      );
      const resolvedMap = new Map<string, string>();
      for (const r of resolvedPackages) {
        resolvedMap.set(r.name, r.version);
      }

      const getFallbackVersion = (name: string): string => {
        const fromDb = resolvedMap.get(name);
        if (fromDb) return fromDb;

        try {
          const localPath = join(targetPath, 'node_modules', name, 'package.json');
          if (existsSync(localPath)) {
            const p = JSON.parse(readFileSync(localPath, 'utf8'));
            if (p.version) return p.version;
          }
        } catch {}

        if (fixes.has(name)) {
          return fixes.get(name)!;
        }

        return '1.0.0';
      };

      const fixInvalidVersion = (depsObj: any) => {
        if (!depsObj) return;
        for (const [name, version] of Object.entries(depsObj)) {
          const vStr = String(version || '').trim();
          if (vStr.startsWith('workspace:')) continue;
          const isInvalid = !vStr || vStr === '*' || !semver.validRange(vStr);
          if (isInvalid) {
            const resolved = getFallbackVersion(name);
            const suggested = `^${resolved}`;
            depsObj[name] = suggested;
            changes.push(`Correct invalid version range for "${name}" from "${vStr}" to "${suggested}" (resolved version)`);
          }
        }
      };

      fixInvalidVersion(updatedPkg.dependencies);
      fixInvalidVersion(updatedPkg.devDependencies);

      // Detect package manager
      let packageManager = 'npm';
      if (existsSync(join(targetPath, 'pnpm-lock.yaml'))) {
        packageManager = 'pnpm';
      } else if (existsSync(join(targetPath, 'yarn.lock'))) {
        packageManager = 'yarn';
      }

      for (const [name, version] of fixes.entries()) {
        const detail = vulnDetails.get(name);
        const reason = detail ? ` (fixes ${detail.cveId} - ${detail.severity})` : '';

        // 1. Direct dependencies
        if (updatedPkg.dependencies && updatedPkg.dependencies[name]) {
          const current = updatedPkg.dependencies[name];
          let needsBump = true;
          try {
            const currentClean = semver.minVersion(current)?.version || '0.0.0';
            if (semver.gte(currentClean, version)) {
              needsBump = false;
            }
          } catch {}

          if (needsBump) {
            updatedPkg.dependencies[name] = `^${version}`;
            changes.push(`Bump dependency "${name}" from "${current}" to "^${version}"${reason}`);
          }
        }
        // 2. Dev dependencies
        else if (updatedPkg.devDependencies && updatedPkg.devDependencies[name]) {
          const current = updatedPkg.devDependencies[name];
          let needsBump = true;
          try {
            const currentClean = semver.minVersion(current)?.version || '0.0.0';
            if (semver.gte(currentClean, version)) {
              needsBump = false;
            }
          } catch {}

          if (needsBump) {
            updatedPkg.devDependencies[name] = `^${version}`;
            changes.push(`Bump devDependency "${name}" from "${current}" to "^${version}"${reason}`);
          }
        }
        // 3. Transitive dependencies (add override/resolution)
        else {
          if (packageManager === 'pnpm') {
            updatedPkg.pnpm = updatedPkg.pnpm || {};
            updatedPkg.pnpm.overrides = updatedPkg.pnpm.overrides || {};
            updatedPkg.pnpm.overrides[name] = `^${version}`;
            changes.push(`Add pnpm override for "${name}" to "^${version}"${reason}`);
          } else if (packageManager === 'yarn') {
            updatedPkg.resolutions = updatedPkg.resolutions || {};
            updatedPkg.resolutions[name] = `^${version}`;
            changes.push(`Add yarn resolution for "${name}" to "^${version}"${reason}`);
          } else {
            updatedPkg.overrides = updatedPkg.overrides || {};
            updatedPkg.overrides[name] = `^${version}`;
            changes.push(`Add npm override for "${name}" to "^${version}"${reason}`);
          }
        }
      }

      res.json({
        originalContent: pkgJsonStr,
        fixedContent: JSON.stringify(updatedPkg, null, 2),
        changes,
        packageManager,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Apply the recommended package.json modifications
  app.post('/api/apply-fix/:projectName', async (req, res) => {
    try {
      const projectName = req.params['projectName'] ?? '';
      const { fixedContent } = req.body;

      if (!fixedContent) {
        return res.status(400).json({ error: 'Fixed content is required.' });
      }

      // Get project path from latest scan
      const scans = await runReadQuery<{ projectPath: string }>(
        `MATCH (s:Scan {projectName: $name}) RETURN s.projectPath AS projectPath ORDER BY s.startedAt DESC LIMIT 1`,
        { name: projectName },
      );
      if (!scans[0]) {
        return res.status(404).json({ error: 'No scan found for this project.' });
      }
      const targetPath = scans[0].projectPath;
      const pkgJsonPath = join(targetPath, 'package.json');

      writeFileSync(pkgJsonPath, fixedContent, 'utf8');

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Re-run vulnerability enrichment for a project (clears stale data and re-fetches)
  app.post('/api/vuln-refresh/:projectName', async (req, res) => {
    try {
      const name = req.params['projectName'] ?? '';
      // Get latest scan id for this project
      const scanRows = await runReadQuery<{ scanId: string }>(
        `MATCH (s:Scan {projectName: $name}) RETURN s.id AS scanId ORDER BY s.startedAt DESC LIMIT 1`,
        { name },
      );
      if (!scanRows[0]) {
        return res.status(404).json({ error: 'No scan found for this project. Run depgraph scan first.' });
      }
      const scanId = scanRows[0].scanId;

      // Clear existing vulnerability severity on packages (so they get re-evaluated)
      await runQuery(
        `MATCH (root:Package {isRoot: true, name: $name})-[:DEPENDS_ON*0..20]->(p:Package)
         SET p.cveSeverity = null, p.cveIds = null
         RETURN count(p) AS cleared`,
        { name },
      );

      // Re-run enrichment with updated OSV parsing
      const enricher = new VulnerabilityEnricher();
      await enricher.enrich(scanId);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });



  app.get('/api/duplicates/:projectName', async (req, res) => {
    try {
      const dupes = await findDuplicates(req.params['projectName'] ?? '');
      res.json(dupes);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/zombies/:projectName', async (req, res) => {
    try {
      const scans = await runReadQuery<{ projectPath: string }>(
        `MATCH (s:Scan {projectName: $name}) RETURN s.projectPath AS projectPath ORDER BY s.startedAt DESC LIMIT 1`,
        { name: req.params['projectName'] },
      );
      const targetPath = scans[0]?.projectPath ?? projectPath;
      const zombies = await findZombies(req.params['projectName'] ?? '', targetPath);
      res.json(zombies);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/cycles/:projectName', async (req, res) => {
    try {
      const cycles = await detectCycles(req.params['projectName'] ?? '');
      res.json(cycles);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/health/:projectName', async (req, res) => {
    try {
      const rows = await runReadQuery<Record<string, unknown>>(
        `MATCH (root:Package {isRoot: true, name: $name})-[:DEPENDS_ON*1..20]->(p:Package)
         WHERE p.healthScore IS NOT NULL
         RETURN DISTINCT p.name AS name, p.version AS version, p.healthScore AS score, p.healthLabel AS label
         ORDER BY p.healthScore ASC LIMIT 200`,
        { name: req.params['projectName'] },
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // On-demand health scoring — fetches npm registry data and persists scores
  app.post('/api/health-compute/:projectName', async (req, res) => {
    try {
      const name = req.params['projectName'] ?? '';
      const pkgs = await runReadQuery<{ name: string; version: string; ecosystem: string }>(
        `MATCH (root:Package {isRoot: true, name: $name})-[:DEPENDS_ON*0..20]->(p:Package)
         WHERE NOT p.isRoot
         RETURN DISTINCT p.name AS name, p.version AS version, p.ecosystem AS ecosystem
         LIMIT 300`,
        { name },
      );
      if (pkgs.length === 0) {
        return res.status(404).json({ error: 'No packages found for this project. Run a scan first.' });
      }
      // Run health scoring with concurrency limit (avoid rate-limiting)
      const limit = 5;
      for (let i = 0; i < pkgs.length; i += limit) {
        await Promise.all(
          pkgs.slice(i, i + limit).map((p) =>
            computeHealthScore(p.name, p.version, p.ecosystem).catch(() => null),
          ),
        );
      }
      res.json({ success: true, computed: pkgs.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });



  app.get('/api/graph/:projectName', async (req, res) => {
    try {
      const nodeRows = await runReadQuery<{
        id: string; name: string; version: string; scope: string;
        isDirect: boolean; cveSeverity?: string; healthScore?: number;
      }>(
        `MATCH (root:Package {isRoot: true, name: $name})-[:DEPENDS_ON*0..20]->(p:Package)
         RETURN DISTINCT p.id AS id, p.name AS name, p.version AS version,
           p.scope AS scope, p.isDirect AS isDirect,
           p.cveSeverity AS cveSeverity, p.healthScore AS healthScore
         LIMIT 2000`,
        { name: req.params['projectName'] },
      );

      const edgeRows = await runReadQuery<{ source: string; target: string; type: string }>(
        `MATCH (a:Package)-[r:DEPENDS_ON]->(b:Package)
         WHERE a.name = $name OR EXISTS {
           MATCH (root:Package {isRoot: true, name: $name})-[:DEPENDS_ON*]->(a)
         }
         RETURN a.id AS source, b.id AS target, r.type AS type
         LIMIT 5000`,
        { name: req.params['projectName'] },
      );

      res.json({ nodes: nodeRows, links: edgeRows });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Serve built UI — resolve relative to this bundle, not cwd
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const uiDist = join(__dirname, '../../ui/dist');
  if (existsSync(uiDist)) {
    app.use(express.static(uiDist));
    app.get('*', (_req, res) => res.sendFile(join(uiDist, 'index.html')));
  } else {
    app.get('/', (_req, res) => {
      res.send(`
        <!DOCTYPE html><html><body style="font-family:monospace;padding:2rem">
        <h2>DepGraph API Running</h2>
        <p>UI not built yet. Run <code>pnpm --filter @depgraph/ui build</code> first.</p>
        <p>API endpoints: <code>/api/scan/:name</code>, <code>/api/vulnerabilities/:name</code>, etc.</p>
        </body></html>
      `);
    });
  }

  // Find available port
  const server = createServer(app);
  server.listen(port, () => {
    console.log(chalk.bold.blue(`\n🌐 DepGraph UI running at ${chalk.underline(`http://localhost:${port}`)}`));
    console.log(chalk.gray('  Press Ctrl+C to stop\n'));
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });

  // Try to open browser
  try {
    const { default: open } = await import('open');
    await open(`http://localhost:${port}`);
  } catch {
    // Not critical
  }
}
