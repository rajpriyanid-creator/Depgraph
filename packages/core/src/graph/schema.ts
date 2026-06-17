import { runQuery } from './db.js';

/**
 * Creates all constraints and indexes required by DepGraph.
 * Safe to call multiple times — uses IF NOT EXISTS.
 */
export async function initSchema(): Promise<void> {
  const statements: string[] = [
    // Unique constraints
    `CREATE CONSTRAINT pkg_unique IF NOT EXISTS
       FOR (p:Package) REQUIRE (p.name, p.version, p.ecosystem) IS UNIQUE`,

    `CREATE CONSTRAINT project_unique IF NOT EXISTS
       FOR (proj:Project) REQUIRE proj.path IS UNIQUE`,

    `CREATE CONSTRAINT vuln_unique IF NOT EXISTS
       FOR (v:Vulnerability) REQUIRE v.id IS UNIQUE`,

    `CREATE CONSTRAINT license_unique IF NOT EXISTS
       FOR (l:License) REQUIRE l.spdxId IS UNIQUE`,

    `CREATE CONSTRAINT scan_unique IF NOT EXISTS
       FOR (s:Scan) REQUIRE s.id IS UNIQUE`,

    `CREATE CONSTRAINT file_unique IF NOT EXISTS
       FOR (f:File) REQUIRE f.path IS UNIQUE`,

    // Performance indexes
    `CREATE INDEX pkg_name IF NOT EXISTS FOR (p:Package) ON (p.name)`,
    `CREATE INDEX pkg_ecosystem IF NOT EXISTS FOR (p:Package) ON (p.ecosystem)`,
    `CREATE INDEX pkg_health IF NOT EXISTS FOR (p:Package) ON (p.healthScore)`,
    `CREATE INDEX pkg_severity IF NOT EXISTS FOR (p:Package) ON (p.cveSeverity)`,
    `CREATE INDEX scan_project IF NOT EXISTS FOR (s:Scan) ON (s.projectName)`,
    `CREATE INDEX scan_started IF NOT EXISTS FOR (s:Scan) ON (s.startedAt)`,
    `CREATE INDEX vuln_severity IF NOT EXISTS FOR (v:Vulnerability) ON (v.severity)`,
  ];

  for (const statement of statements) {
    await runQuery(statement, {});
  }

  console.log(`✅ Graph schema initialized (${statements.length} constraints/indexes)`);
}
