import semver from 'semver';
import { runReadQuery } from '../graph/db.js';

export type RiskLevel = 'safe' | 'review' | 'breaking' | 'blocked';

export interface UpdateAnalysis {
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  riskLevel: RiskLevel;
  updateType: 'patch' | 'minor' | 'major' | 'unknown';
  breakingChanges: string[];
  affectedFiles: string[];
  peerConstraints: string[];
  estimatedEffortHours: number;
  autoMigratable: boolean;
}

export interface UpdatePlan {
  updates: UpdateAnalysis[];
  totalEstimatedHours: number;
  securityUpdates: number;
  breakingUpdates: number;
}

const BREAKING_CHANGE_PATTERNS = [
  /breaking/i,
  /removed/i,
  /renamed/i,
  /deprecated.*removed/i,
  /api change/i,
  /incompatible/i,
  /migration required/i,
];

async function fetchChangelog(name: string, _fromVersion: string, toVersion: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/${toVersion}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { description?: string; changelog?: string };
    const text = [data.description ?? '', data.changelog ?? ''].join(' ');
    return BREAKING_CHANGE_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
  } catch {
    return [];
  }
}

export async function analyzeUpdate(
  packageName: string,
  currentVersion: string,
  targetVersion: string,
): Promise<UpdateAnalysis> {
  const updateType =
    (semver.diff(currentVersion, targetVersion) as UpdateAnalysis['updateType'] | null) ?? 'unknown';

  let riskLevel: RiskLevel = 'safe';
  let breakingChanges: string[] = [];
  let estimatedEffortHours = 0;

  if (updateType === 'patch') {
    riskLevel = 'safe';
    estimatedEffortHours = 0.25;
  } else if (updateType === 'minor') {
    riskLevel = 'review';
    estimatedEffortHours = 1;
  } else if (updateType === 'major') {
    breakingChanges = await fetchChangelog(packageName, currentVersion, targetVersion);
    riskLevel = breakingChanges.length > 0 ? 'breaking' : 'review';
    estimatedEffortHours = breakingChanges.length > 0 ? 4 : 2;
  }

  return {
    packageName,
    currentVersion,
    targetVersion,
    riskLevel,
    updateType,
    breakingChanges,
    affectedFiles: [],
    peerConstraints: [],
    estimatedEffortHours,
    autoMigratable: updateType === 'patch' || (updateType === 'minor' && breakingChanges.length === 0),
  };
}

export async function buildUpdatePlan(projectName: string): Promise<UpdatePlan> {
  const packages = await runReadQuery<{
    name: string;
    version: string;
    cveSeverity?: string;
  }>(
    `MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON]->(p:Package)
     RETURN p.name AS name, p.version AS version, p.cveSeverity AS cveSeverity`,
    { projectName },
  );

  const updates: UpdateAnalysis[] = [];

  for (const pkg of packages) {
    try {
      const res = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (!res.ok) continue;
      const latest = (await res.json()) as { version?: string };
      if (!latest.version || latest.version === pkg.version) continue;

      const analysis = await analyzeUpdate(pkg.name, pkg.version, latest.version);
      updates.push(analysis);
    } catch {
      // skip
    }
  }

  // Sort: security gain first, then risk ascending, then effort ascending
  updates.sort((a, b) => {
    const aIsSecurityUpdate = packages.find((p) => p.name === a.packageName)?.cveSeverity ? 1 : 0;
    const bIsSecurityUpdate = packages.find((p) => p.name === b.packageName)?.cveSeverity ? 1 : 0;
    if (bIsSecurityUpdate !== aIsSecurityUpdate) return bIsSecurityUpdate - aIsSecurityUpdate;
    const riskOrder: Record<RiskLevel, number> = { safe: 0, review: 1, breaking: 2, blocked: 3 };
    const riskDiff = (riskOrder[a.riskLevel] ?? 0) - (riskOrder[b.riskLevel] ?? 0);
    if (riskDiff !== 0) return riskDiff;
    return a.estimatedEffortHours - b.estimatedEffortHours;
  });

  return {
    updates,
    totalEstimatedHours: updates.reduce((s, u) => s + u.estimatedEffortHours, 0),
    securityUpdates: updates.filter(
      (u) => packages.find((p) => p.name === u.packageName)?.cveSeverity,
    ).length,
    breakingUpdates: updates.filter((u) => u.riskLevel === 'breaking').length,
  };
}
