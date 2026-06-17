import type { Vulnerability } from '../normalization/models/index.js';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

interface GhAdvisoryNode {
  ghsaId?: string;
  summary?: string;
  severity?: string;
  cvss?: { score?: number };
  publishedAt?: string;
  vulnerabilities?: {
    nodes?: Array<{
      package?: { name?: string; ecosystem?: string };
      firstPatchedVersion?: { identifier?: string };
      vulnerableVersionRange?: string;
    }>;
  };
}

interface GhAdvisoryResponse {
  data?: {
    securityAdvisories?: {
      nodes?: GhAdvisoryNode[];
    };
  };
}

function mapSeverity(s?: string): Vulnerability['severity'] {
  switch (s?.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MODERATE': return 'medium';
    case 'LOW': return 'low';
    default: return 'unknown';
  }
}

function mapEcosystem(eco: string): string {
  const map: Record<string, string> = {
    npm: 'NPM',
    python: 'PIP',
    rust: 'RUST',
    java: 'MAVEN',
  };
  return map[eco] ?? eco.toUpperCase();
}

export async function fetchAdvisories(
  ecosystem: string,
  packageName: string,
): Promise<Vulnerability[]> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    return [];
  }

  const query = `
    query($ecosystem: SecurityAdvisoryEcosystem!, $package: String!) {
      securityAdvisories(ecosystem: $ecosystem, package: $package, first: 20) {
        nodes {
          ghsaId
          summary
          severity
          cvss { score }
          publishedAt
          vulnerabilities(first: 10) {
            nodes {
              package { name ecosystem }
              firstPatchedVersion { identifier }
              vulnerableVersionRange
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${token}`,
      },
      body: JSON.stringify({
        query,
        variables: { ecosystem: mapEcosystem(ecosystem), package: packageName },
      }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as GhAdvisoryResponse;
    const nodes = data.data?.securityAdvisories?.nodes ?? [];

    return nodes.map((node): Vulnerability => {
      const vulnNode = node.vulnerabilities?.nodes?.[0];
      const cvssScore = node.cvss?.score;
      const fixedInVersion = vulnNode?.firstPatchedVersion?.identifier;
      const affectedVersionRange = vulnNode?.vulnerableVersionRange;
      const publishedAt = node.publishedAt;
      return {
        id: node.ghsaId ?? 'GHSA-unknown',
        summary: node.summary ?? 'No summary',
        severity: mapSeverity(node.severity),
        ...(cvssScore !== undefined && { cvssScore }),
        ...(fixedInVersion !== undefined && { fixedInVersion }),
        ...(affectedVersionRange !== undefined && { affectedVersionRange }),
        ...(publishedAt !== undefined && { publishedAt }),
        source: 'github' as const,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Merge OSV and GitHub advisories, deduplicating by CVE/GHSA ID.
 */
export function mergeAdvisories(
  osvVulns: Vulnerability[],
  ghVulns: Vulnerability[],
): Vulnerability[] {
  const seen = new Map<string, Vulnerability>();
  for (const v of [...osvVulns, ...ghVulns]) {
    if (!seen.has(v.id)) {
      seen.set(v.id, v);
    }
  }
  return [...seen.values()];
}
