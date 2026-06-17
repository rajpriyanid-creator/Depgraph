import { runQuery } from '../graph/db.js';

export interface HealthScore {
  packageName: string;
  packageVersion: string;
  score: number;
  label: 'healthy' | 'watch' | 'caution' | 'risky';
  breakdown: {
    recency: number;
    maintainers: number;
    downloadTrend: number;
    issues: number;
    securityPolicy: number;
    archived: number;
  };
}

interface NpmRegistryData {
  time?: Record<string, string>;
  maintainers?: unknown[];
  description?: string;
  homepage?: string;
  license?: string | { type: string };
  repository?: { url?: string };
  versions?: Record<string, unknown>;
  'dist-tags'?: { latest?: string };
}

interface NpmDownloadsData {
  downloads?: number;
  start?: string;
  end?: string;
}

async function fetchNpmMetadata(name: string, version: string): Promise<NpmRegistryData | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as NpmRegistryData;
  } catch {
    return null;
  }
}

async function fetchNpmDownloads(name: string, period: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/${period}/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as NpmDownloadsData;
    return data.downloads ?? 0;
  } catch {
    return 0;
  }
}

function scoreRecency(lastPublished?: string): number {
  if (!lastPublished) return 0;
  const daysSince = (Date.now() - new Date(lastPublished).getTime()) / 86_400_000;
  if (daysSince < 30) return 100;
  if (daysSince < 180) return 75;
  if (daysSince < 365) return 50;
  if (daysSince < 730) return 25;
  return 0;
}

function scoreMaintainers(count: number): number {
  if (count >= 5) return 100;
  if (count >= 3) return 75;
  if (count >= 2) return 50;
  if (count >= 1) return 25;
  return 0;
}

function scoreDownloadTrend(recentDownloads: number, olderDownloads: number): number {
  if (olderDownloads === 0 && recentDownloads > 0) return 75;
  if (olderDownloads === 0) return 25;
  const ratio = recentDownloads / olderDownloads;
  if (ratio >= 1.1) return 100;
  if (ratio >= 0.9) return 75;
  if (ratio >= 0.7) return 50;
  if (ratio >= 0.5) return 25;
  return 0;
}

function labelFromScore(score: number): HealthScore['label'] {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'watch';
  if (score >= 40) return 'caution';
  return 'risky';
}

export async function computeHealthScore(
  name: string,
  version: string,
  ecosystem: string,
): Promise<HealthScore> {
  // Only fully implemented for npm; other ecosystems get a basic score
  if (ecosystem !== 'npm') {
    return {
      packageName: name,
      packageVersion: version,
      score: 50,
      label: 'watch',
      breakdown: { recency: 50, maintainers: 50, downloadTrend: 50, issues: 50, securityPolicy: 0, archived: 100 },
    };
  }

  const meta = await fetchNpmMetadata(name, version);
  if (!meta) {
    return {
      packageName: name,
      packageVersion: version,
      score: 25,
      label: 'risky',
      breakdown: { recency: 0, maintainers: 0, downloadTrend: 0, issues: 50, securityPolicy: 0, archived: 100 },
    };
  }

  const lastPublished = Object.values(meta.time ?? {}).sort().reverse()[0];
  const maintainerCount = Array.isArray(meta.maintainers) ? meta.maintainers.length : 0;

  // Downloads: last 4 weeks vs. 6 months ago
  const [recentDl, olderDl] = await Promise.all([
    fetchNpmDownloads(name, 'last-week'),
    fetchNpmDownloads(name, '2024-01-01:2024-06-30'),
  ]);

  const breakdown = {
    recency: scoreRecency(lastPublished),
    maintainers: scoreMaintainers(maintainerCount),
    downloadTrend: scoreDownloadTrend(recentDl, olderDl),
    issues: 75,         // Would need GitHub API — default neutral
    securityPolicy: 0,  // Would need GitHub API — default unknown
    archived: 100,      // Would need GitHub API — default not archived
  };

  const score = Math.round(
    breakdown.recency * 0.30 +
    breakdown.maintainers * 0.20 +
    breakdown.downloadTrend * 0.15 +
    breakdown.issues * 0.15 +
    breakdown.securityPolicy * 0.10 +
    breakdown.archived * 0.10,
  );

  const label = labelFromScore(score);

  // Persist to Neo4j
  await runQuery(
    `MATCH (p:Package {name: $name, version: $version, ecosystem: $ecosystem})
     SET p.healthScore = $score,
         p.healthLabel = $label,
         p.lastPublished = $lastPublished,
         p.maintainerCount = $maintainerCount`,
    { name, version, ecosystem, score, label, lastPublished: lastPublished ?? null, maintainerCount },
  );

  return { packageName: name, packageVersion: version, score, label, breakdown };
}
