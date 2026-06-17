export type SupplyChainVerdict =
  | 'clean'
  | 'suspicious'
  | 'likely_typosquat'
  | 'ownership_risk'
  | 'confirmed_malicious';

export interface SupplyChainResult {
  packageName: string;
  packageVersion: string;
  verdict: SupplyChainVerdict;
  signals: string[];
}

// Levenshtein distance for typosquat detection
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

// Top 50 most popular npm packages — subset used for typosquat detection
const POPULAR_PACKAGES = [
  'lodash', 'react', 'express', 'axios', 'moment', 'underscore',
  'chalk', 'commander', 'typescript', 'webpack', 'babel', 'eslint',
  'prettier', 'jest', 'mocha', 'jquery', 'vue', 'angular', 'svelte',
  'next', 'nuxt', 'vite', 'rollup', 'esbuild', 'turbo', 'nx',
  'prisma', 'mongoose', 'sequelize', 'typeorm', 'knex', 'pg',
  'mysql2', 'redis', 'socket.io', 'fastify', 'koa', 'hapi',
  'dotenv', 'cors', 'helmet', 'passport', 'jsonwebtoken', 'bcrypt',
  'uuid', 'debug', 'semver', 'glob', 'rimraf', 'cross-env',
];

interface NpmRegistryEntry {
  time?: Record<string, string>;
  maintainers?: Array<{ name: string; email: string }>;
  versions?: Record<string, { scripts?: { preinstall?: string; install?: string; postinstall?: string } }>;
  downloads?: number;
}

async function fetchNpmDownloads(name: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as { downloads?: number };
    return data.downloads ?? 0;
  } catch {
    return 0;
  }
}

async function fetchNpmMeta(name: string): Promise<NpmRegistryEntry | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as NpmRegistryEntry;
  } catch {
    return null;
  }
}

function hasInstallScripts(meta: NpmRegistryEntry, version: string): boolean {
  const versionMeta = meta.versions?.[version];
  if (!versionMeta?.scripts) return false;
  const { preinstall, install, postinstall } = versionMeta.scripts;
  const dangerous = /curl|wget|eval|bash|sh\s+-c/i;
  return [preinstall, install, postinstall].some((s) => s && dangerous.test(s));
}

export async function analyzeSupplyChain(
  packages: Array<{ name: string; version: string }>,
): Promise<SupplyChainResult[]> {
  const results: SupplyChainResult[] = [];

  for (const pkg of packages) {
    const signals: string[] = [];
    let verdict: SupplyChainVerdict = 'clean';

    // Typosquat detection
    for (const popular of POPULAR_PACKAGES) {
      const dist = levenshtein(pkg.name.toLowerCase(), popular.toLowerCase());
      if (dist > 0 && dist <= 2) {
        const [pkgDl, popularDl] = await Promise.all([
          fetchNpmDownloads(pkg.name),
          fetchNpmDownloads(popular),
        ]);
        if (popularDl > 10_000 && pkgDl < popularDl * 0.001) {
          signals.push(
            `Name similar to popular package '${popular}' (distance=${dist}), far fewer downloads`,
          );
          verdict = 'likely_typosquat';
        }
        break;
      }
    }

    // Registry metadata checks
    const meta = await fetchNpmMeta(pkg.name);
    if (meta) {
      const allTimes = Object.values(meta.time ?? {}).sort();
      const firstPublish = allTimes[0];
      const latestPublish = allTimes[allTimes.length - 1];

      // Newly published with low downloads
      if (firstPublish) {
        const daysSincePublish =
          (Date.now() - new Date(firstPublish).getTime()) / 86_400_000;
        const weeklyDl = await fetchNpmDownloads(pkg.name);
        if (daysSincePublish < 7 && weeklyDl < 1000) {
          signals.push(`Published ${Math.floor(daysSincePublish)} days ago with <1000 weekly downloads`);
          if (verdict === 'clean') verdict = 'suspicious';
        }
      }

      // Dangerous install scripts
      if (hasInstallScripts(meta, pkg.version)) {
        signals.push(`Contains potentially dangerous install script (curl/wget/eval)`);
        verdict = 'suspicious';
      }

      // Ownership change: if latest publish is much more recent than prior versions
      if (latestPublish && allTimes.length >= 2) {
        const secondLatest = allTimes[allTimes.length - 2]!;
        const gapDays =
          (new Date(latestPublish).getTime() - new Date(secondLatest).getTime()) / 86_400_000;
        if (gapDays > 0 && gapDays < 90) {
          const daysSinceOwnershipChange = (Date.now() - new Date(latestPublish).getTime()) / 86_400_000;
          if (daysSinceOwnershipChange < 90) {
            signals.push(`Recent publish activity (${Math.floor(daysSinceOwnershipChange)} days ago) — possible ownership change`);
            if (verdict === 'clean') verdict = 'ownership_risk';
          }
        }
      }
    }

    results.push({ packageName: pkg.name, packageVersion: pkg.version, verdict, signals });
  }

  return results.filter((r) => r.verdict !== 'clean');
}
