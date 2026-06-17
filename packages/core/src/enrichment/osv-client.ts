import type { Vulnerability } from '../normalization/models/index.js';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const BATCH_SIZE = 100;
const DELAY_MS = 100;

interface OsvQuery {
  package: { name: string; ecosystem: string };
  version: string;
}

interface OsvVuln {
  id?: string;
  summary?: string;
  severity?: Array<{ type: string; score: string }>;
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{
      type?: string;
      events?: Array<{ introduced?: string; fixed?: string }>;
    }>;
    versions?: string[];
  }>;
  published?: string;
  database_specific?: { severity?: string };
}

interface OsvBatchResponse {
  results?: Array<{ vulns?: OsvVuln[] }>;
}

function mapEcosystem(eco: string): string {
  const map: Record<string, string> = {
    npm: 'npm',
    python: 'PyPI',
    rust: 'crates.io',
    java: 'Maven',
  };
  return map[eco] ?? eco;
}

function extractCvssScore(scoreStr: string): number | undefined {
  // Numeric string like '7.5'
  const direct = parseFloat(scoreStr);
  if (!isNaN(direct) && direct > 0) return direct;
  // CVSS vector string like 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
  // Base score is not encoded in the vector — we derive severity from AV/AC/PR combos
  // but for display we skip the numeric score and rely on severity label instead
  return undefined;
}

function parseSeverity(vuln: OsvVuln): Vulnerability['severity'] {
  // 1. database_specific.severity (GitHub Advisory format)
  const dbSev = vuln.database_specific?.severity?.toLowerCase();
  if (dbSev === 'critical') return 'critical';
  if (dbSev === 'high') return 'high';
  if (dbSev === 'moderate' || dbSev === 'medium') return 'medium';
  if (dbSev === 'low') return 'low';

  // 2. CVSS V3 numeric score
  for (const entry of vuln.severity ?? []) {
    const score = extractCvssScore(entry.score);
    if (score !== undefined) {
      if (score >= 9.0) return 'critical';
      if (score >= 7.0) return 'high';
      if (score >= 4.0) return 'medium';
      return 'low';
    }
  }

  // 3. Derive from CVSS V3 vector key metrics (AV/AC/PR/UI/S/C/I/A)
  const v3Entry = vuln.severity?.find((s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V3_1');
  if (v3Entry) {
    const vec = v3Entry.score;
    // High-confidence high/critical: network-accessible, low complexity
    if (/\/AV:N\//i.test(vec) && /\/AC:L\//i.test(vec)) {
      if (/\/C:H\//i.test(vec) && /\/I:H\//i.test(vec)) return 'critical';
      if (/\/(C|I|A):H\//i.test(vec)) return 'high';
      return 'medium';
    }
    return 'medium';
  }

  // 4. CVSS V2 fallback
  const v2Entry = vuln.severity?.find((s) => s.type === 'CVSS_V2');
  if (v2Entry) {
    const score = extractCvssScore(v2Entry.score);
    if (score !== undefined) {
      if (score >= 7.0) return 'high';
      if (score >= 4.0) return 'medium';
      return 'low';
    }
  }

  return 'unknown';
}

function parseCvss(vuln: OsvVuln): number | undefined {
  for (const entry of vuln.severity ?? []) {
    const score = extractCvssScore(entry.score);
    if (score !== undefined) return score;
  }
  return undefined;
}

function parseFixedVersion(vuln: OsvVuln): string | undefined {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OSVClient {
  private cache = new Map<string, Vulnerability[]>();

  /**
   * Query OSV for vulnerabilities affecting a list of packages.
   * Returns a Map keyed by `{name}@{version}`.
   */
  async queryBatch(
    packages: Array<{ name: string; version: string; ecosystem: string }>,
  ): Promise<Map<string, Vulnerability[]>> {
    const result = new Map<string, Vulnerability[]>();

    // Check cache first
    const uncached = packages.filter((p) => !this.cache.has(`${p.name}@${p.version}`));

    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const chunk = uncached.slice(i, i + BATCH_SIZE);
      const queries: OsvQuery[] = chunk.map((p) => ({
        package: { name: p.name, ecosystem: mapEcosystem(p.ecosystem) },
        version: p.version,
      }));

      try {
        const response = await fetch(OSV_BATCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries }),
        });

        if (!response.ok) {
          console.warn(`OSV API returned ${response.status} — skipping batch`);
          continue;
        }

        const data = (await response.json()) as OsvBatchResponse;

        for (let j = 0; j < chunk.length; j++) {
          const pkg = chunk[j];
          if (!pkg) continue;
          const key = `${pkg.name}@${pkg.version}`;
          const vulns: Vulnerability[] = (data.results?.[j]?.vulns ?? []).map(
            (v): Vulnerability => {
              const cvssScore = parseCvss(v);
              const fixedInVersion = parseFixedVersion(v);
              const publishedAt = v.published;
              return {
                id: v.id ?? 'UNKNOWN',
                summary: v.summary ?? 'No summary available',
                severity: parseSeverity(v),
                ...(cvssScore !== undefined && { cvssScore }),
                ...(fixedInVersion !== undefined && { fixedInVersion }),
                ...(publishedAt !== undefined && { publishedAt }),
                source: 'osv' as const,
              };
            },
          );
          this.cache.set(key, vulns);
        }
      } catch (err) {
        console.warn(`OSV batch request failed:`, err);
      }

      if (i + BATCH_SIZE < uncached.length) {
        await sleep(DELAY_MS);
      }
    }

    // Collect results (cached + freshly fetched)
    for (const pkg of packages) {
      const key = `${pkg.name}@${pkg.version}`;
      const vulns = this.cache.get(key) ?? [];
      if (vulns.length > 0) {
        result.set(key, vulns);
      }
    }

    return result;
  }
}
